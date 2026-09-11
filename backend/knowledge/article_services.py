import uuid
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from .covers import read_image
from .models import Article, ArticleImage, ArticleImageUploadSession
from .storage import article_image_storage_key, get_knowledge_storage
from .storage_cleanup import delete_storage_backed_queryset


def upload_session_expires_at(session):
    return session.created_at + timedelta(
        seconds=settings.KNOWLEDGE_ARTICLE_UPLOAD_TTL_SECONDS
    )


def upload_session_is_expired(session):
    return upload_session_expires_at(session) <= timezone.now()


def _attach_upload_session(*, session_id, user, article):
    try:
        session = ArticleImageUploadSession.objects.select_for_update().get(
            id=session_id
        )
    except ArticleImageUploadSession.DoesNotExist as error:
        raise ValidationError(
            {"upload_session_id": "Сессия загрузки не найдена."}
        ) from error

    if session.user_id != user.id:
        raise ValidationError(
            {"upload_session_id": "Нельзя использовать чужую сессию загрузки."}
        )
    if session.article_id and session.article_id != article.id:
        raise ValidationError(
            {"upload_session_id": "Сессия уже привязана к другой статье."}
        )
    if not session.article_id and upload_session_is_expired(session):
        raise ValidationError({"upload_session_id": "Сессия загрузки истекла."})

    if not session.article_id:
        session.article = article
        session.save(update_fields=("article",))


def create_article(*, user, data):
    values = dict(data)
    session_id = values.pop("upload_session_id", None)

    with transaction.atomic():
        article = Article(created_by=user, **values)
        article.full_clean()
        article.save(force_insert=True)
        if session_id:
            _attach_upload_session(
                session_id=session_id,
                user=user,
                article=article,
            )

    return article


def update_article(*, article, user, data):
    changes = dict(data)
    session_id = changes.pop("upload_session_id", None)

    with transaction.atomic():
        for field, value in changes.items():
            setattr(article, field, value)
        article.full_clean()
        if changes:
            article.save(update_fields=(*changes.keys(), "updated_at"))
        if session_id:
            _attach_upload_session(
                session_id=session_id,
                user=user,
                article=article,
            )

    return article


def create_article_image(*, upload_session, image, storage=None):
    if storage is None:
        storage = get_knowledge_storage()

    content, media_type = read_image(
        image,
        getattr(image, "content_type", None),
        subject="Изображение статьи",
    )
    image_id = uuid.uuid4()
    storage_key = article_image_storage_key(
        upload_session.id,
        media_type,
        image_id,
    )

    try:
        storage.save(storage_key, content, content_type=media_type)
        if not storage.exists(storage_key):
            raise OSError("Storage did not persist the article image.")

        with transaction.atomic():
            article_image = ArticleImage(
                id=image_id,
                upload_session=upload_session,
                storage_key=storage_key,
                content_type=media_type,
            )
            article_image.full_clean()
            article_image.save(force_insert=True)
    except Exception:
        try:
            storage.delete(storage_key)
        except Exception:
            # Cleanup не должен скрывать исходную ошибку сохранения.
            pass
        raise

    return article_image


def delete_article(*, article):
    delete_storage_backed_queryset(Article.objects.filter(id=article.id))


def delete_abandoned_upload_session(*, session, cutoff, storage=None):
    if storage is None:
        storage = get_knowledge_storage()

    with transaction.atomic():
        try:
            session = ArticleImageUploadSession.objects.select_for_update().get(
                id=session.id
            )
        except ArticleImageUploadSession.DoesNotExist:
            return False

        if session.article_id or session.created_at >= cutoff:
            return False

        for key in session.images.values_list("storage_key", flat=True):
            storage.delete(key)
        session.delete()
    return True
