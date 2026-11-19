import logging
from dataclasses import dataclass

from botocore.exceptions import ClientError
from django.conf import settings
from django.db import connection, transaction
from django.db.models import F
from django.utils import timezone

from .models import (
    Article,
    ArticleImage,
    ArticleImageUploadSession,
    Book,
    KnowledgeProfile,
    StorageCleanupJob,
)
from .storage import get_knowledge_storage

logger = logging.getLogger(__name__)
CRITICAL_CLEANUP_ATTEMPTS = 5

ARTICLE_DELETED = "article_deleted"
ARTICLE_IMAGE_DELETED = "article_image_deleted"
ARTICLE_UPLOAD_SESSION_DELETED = "article_upload_session_deleted"
BOOK_DELETED = "book_deleted"
BOOK_COVER_REPLACED = "book_cover_replaced"
PROFILE_DELETED = "profile_deleted"
PROFILE_AVATAR_REPLACED = "profile_avatar_replaced"
PROFILE_AVATAR_DELETED = "profile_avatar_deleted"
USER_DELETED = "user_deleted"


@dataclass(frozen=True)
class CleanupBatchResult:
    claimed: int
    completed: int
    failed: int


def enqueue_storage_cleanup(storage_key, reason):
    if not storage_key:
        raise ValueError("Storage cleanup requires a storage key.")
    if not reason:
        raise ValueError("Storage cleanup requires a reason.")
    job = StorageCleanupJob.objects.create(storage_key=storage_key, reason=reason)
    logger.debug(
        "Storage cleanup job queued (job_id=%s reason=%s).",
        job.pk,
        reason,
    )
    return job


def _storage_keys_for_delete(model, object_ids):
    if model is Article:
        keys = ArticleImage.objects.filter(
            upload_session__article_id__in=object_ids
        ).values_list("storage_key", flat=True)
        return keys, ARTICLE_DELETED
    if model is ArticleImageUploadSession:
        keys = ArticleImage.objects.filter(
            upload_session_id__in=object_ids
        ).values_list("storage_key", flat=True)
        return keys, ARTICLE_UPLOAD_SESSION_DELETED
    if model is ArticleImage:
        keys = ArticleImage.objects.filter(id__in=object_ids).values_list(
            "storage_key", flat=True
        )
        return keys, ARTICLE_IMAGE_DELETED
    if model is Book:
        books = Book.objects.filter(id__in=object_ids).values_list(
            "storage_key", "cover_key"
        )
        keys = (key for book_keys in books for key in book_keys)
        return keys, BOOK_DELETED
    if model is KnowledgeProfile:
        keys = KnowledgeProfile.objects.filter(id__in=object_ids).values_list(
            "avatar", flat=True
        )
        return keys, PROFILE_DELETED
    if model._meta.label_lower == settings.AUTH_USER_MODEL.lower():
        profile_keys = KnowledgeProfile.objects.filter(
            user_id__in=object_ids
        ).values_list("avatar", flat=True)
        article_image_keys = ArticleImage.objects.filter(
            upload_session__user_id__in=object_ids
        ).values_list("storage_key", flat=True)
        return (*profile_keys, *article_image_keys), USER_DELETED
    raise TypeError(f"Unsupported storage-backed model: {model._meta.label}.")


def delete_storage_backed_queryset(queryset):
    model = queryset.model
    with transaction.atomic():
        object_ids = list(queryset.select_for_update().values_list("pk", flat=True))
        if not object_ids:
            logger.debug(
                "Storage-backed deletion skipped because queryset is empty (model=%s).",
                model._meta.label,
            )
            return 0, {}

        keys, reason = _storage_keys_for_delete(model, object_ids)
        queued_count = 0
        for key in dict.fromkeys(key for key in keys if key):
            enqueue_storage_cleanup(key, reason)
            queued_count += 1

        deleted_count, deleted_objects = model.objects.filter(pk__in=object_ids).delete()
        logger.info(
            "Storage-backed objects deleted (model=%s selected=%s deleted=%s cleanup_jobs=%s reason=%s).",
            model._meta.label,
            len(object_ids),
            deleted_count,
            queued_count,
            reason,
        )
        return deleted_count, deleted_objects


def _advisory_lock_id(job_id):
    return job_id.int & ((1 << 63) - 1)


def _try_advisory_lock(job_id):
    if connection.vendor != "postgresql":
        return True
    lock_id = _advisory_lock_id(job_id)
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_try_advisory_lock(%s)", [lock_id])
        return cursor.fetchone()[0]


def _release_advisory_lock(job_id):
    if connection.vendor != "postgresql":
        return
    lock_id = _advisory_lock_id(job_id)
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_unlock(%s)", [lock_id])


def _claim_pending_jobs(batch_size):
    claimed = []
    try:
        with transaction.atomic():
            jobs = StorageCleanupJob.objects.filter(completed_at__isnull=True).order_by(
                "created_at", "id"
            )
            if connection.features.has_select_for_update:
                jobs = jobs.select_for_update(
                    skip_locked=connection.features.has_select_for_update_skip_locked
                )

            for job in jobs[:batch_size]:
                if _try_advisory_lock(job.id):
                    claimed.append(job)
                else:
                    logger.debug(
                        "Storage cleanup job is already being processed (job_id=%s).",
                        job.pk,
                    )
    except Exception:
        for job in claimed:
            _release_advisory_lock(job.id)
        raise
    return claimed


def _is_missing_object_error(error):
    if isinstance(error, FileNotFoundError):
        return True
    if isinstance(error, ClientError):
        code = error.response.get("Error", {}).get("Code")
        return code in {"404", "NoSuchKey", "NotFound"}
    return False


def _record_failure(job, error):
    message = f"{type(error).__name__}: {error}"[:4000]
    StorageCleanupJob.objects.filter(
        id=job.id,
        completed_at__isnull=True,
    ).update(
        attempts=F("attempts") + 1,
        last_error=message,
    )


def _record_success(job):
    StorageCleanupJob.objects.filter(
        id=job.id,
        completed_at__isnull=True,
    ).update(
        completed_at=timezone.now(),
        last_error="",
    )


def process_storage_cleanup_batch(*, batch_size=100, storage=None):
    if batch_size <= 0:
        raise ValueError("Batch size must be positive.")
    if storage is None:
        storage = get_knowledge_storage()

    logger.debug("Starting storage cleanup batch (batch_size=%s).", batch_size)
    jobs = _claim_pending_jobs(batch_size)
    completed = 0
    failed = 0

    for job in jobs:
        try:
            try:
                storage.delete(job.storage_key)
            except Exception as error:
                if not _is_missing_object_error(error):
                    raise
            _record_success(job)
            completed += 1
            logger.debug(
                "Storage cleanup job completed (job_id=%s reason=%s attempts=%s).",
                job.pk,
                job.reason,
                job.attempts,
            )
        except Exception as error:
            _record_failure(job, error)
            failed += 1
            log_failure = (
                logger.critical
                if job.attempts + 1 >= CRITICAL_CLEANUP_ATTEMPTS
                else logger.error
            )
            log_failure(
                "Storage cleanup job failed (job_id=%s reason=%s attempts=%s).",
                job.pk,
                job.reason,
                job.attempts + 1,
                exc_info=True,
            )
        finally:
            _release_advisory_lock(job.id)

    result = CleanupBatchResult(
        claimed=len(jobs),
        completed=completed,
        failed=failed,
    )
    if result.claimed:
        logger.info(
            "Storage cleanup batch finished (claimed=%s completed=%s failed=%s).",
            result.claimed,
            result.completed,
            result.failed,
        )
    return result
