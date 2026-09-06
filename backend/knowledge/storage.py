from pathlib import PurePosixPath
from uuid import UUID, uuid4

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.files.base import ContentFile, File
from django.core.files.storage import FileSystemStorage


def book_storage_key(book_id, book_format):
    """Строит canonical storage key без пользовательского имени файла."""
    try:
        normalized_id = UUID(str(book_id))
    except (TypeError, ValueError, AttributeError) as error:
        raise ValueError("Book id must be a valid UUID.") from error

    if book_format not in {"epub", "pdf"}:
        raise ValueError("Book format must be epub or pdf.")

    return f"books/{normalized_id}/original.{book_format}"


def book_cover_storage_key(book_id, media_type, cover_id=None):
    """Строит новый ключ обложки, не перезаписывая предыдущий объект."""
    try:
        normalized_id = UUID(str(book_id))
        normalized_cover_id = UUID(str(cover_id)) if cover_id else uuid4()
    except (TypeError, ValueError, AttributeError) as error:
        raise ValueError("Book and cover ids must be valid UUIDs.") from error

    extensions = {
        "image/gif": "gif",
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
    }
    try:
        extension = extensions[media_type]
    except KeyError as error:
        raise ValueError("Unsupported cover image type.") from error

    return f"books/{normalized_id}/covers/{normalized_cover_id}.{extension}"


def _validate_key(key):
    if not isinstance(key, str) or not key or "\\" in key:
        raise ValueError("Storage key must be a non-empty POSIX path.")

    path = PurePosixPath(key)
    if (
        path.is_absolute()
        or ".." in path.parts
        or path.as_posix() != key
        or key.endswith("/")
    ):
        raise ValueError("Storage key must be a safe relative POSIX path.")

    return key


def _create_s3_client(endpoint_url):
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
        region_name=settings.S3_REGION_NAME,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
        ),
    )


# Локальная реализация изолирует домен от физических путей файловой системы.
class LocalKnowledgeStorage:
    def __init__(self, root=None):
        location = root or settings.MEDIA_ROOT / "knowledge"
        self._storage = FileSystemStorage(
            location=location,
            base_url="/media/knowledge/",
            allow_overwrite=True,
        )

    def save(self, key, content):
        key = _validate_key(key)
        if isinstance(content, (bytes, bytearray)):
            content = ContentFile(bytes(content))
        elif not hasattr(content, "chunks"):
            content = File(content)
        return self._storage.save(key, content)

    def open(self, key, mode="rb"):
        return self._storage.open(_validate_key(key), mode)

    def delete(self, key):
        self._storage.delete(_validate_key(key))

    def exists(self, key):
        return self._storage.exists(_validate_key(key))

    def get_presigned_url(self, key, expires_in):
        return self._storage.url(_validate_key(key))


class S3KnowledgeStorage:
    def __init__(self, *, client=None, presign_client=None, bucket_name=None):
        self.bucket_name = bucket_name or settings.S3_BUCKET_NAME
        if not self.bucket_name:
            raise ImproperlyConfigured("S3_BUCKET_NAME must be set for S3 storage.")

        if client is None:
            required_settings = {
                "S3_ENDPOINT_URL": settings.S3_ENDPOINT_URL,
                "S3_ACCESS_KEY_ID": settings.S3_ACCESS_KEY_ID,
                "S3_SECRET_ACCESS_KEY": settings.S3_SECRET_ACCESS_KEY,
            }
            missing = [name for name, value in required_settings.items() if not value]
            if missing:
                names = ", ".join(missing)
                raise ImproperlyConfigured(f"Missing S3 settings: {names}.")
            client = _create_s3_client(settings.S3_ENDPOINT_URL)

        if presign_client is None:
            public_endpoint = settings.S3_PUBLIC_ENDPOINT_URL
            if public_endpoint and public_endpoint != settings.S3_ENDPOINT_URL:
                presign_client = _create_s3_client(public_endpoint)
            else:
                presign_client = client

        self._client = client
        self._presign_client = presign_client

    def save(self, key, content):
        key = _validate_key(key)
        if isinstance(content, bytearray):
            content = bytes(content)
        elif not isinstance(content, bytes) and not hasattr(content, "read"):
            content = File(content)

        if hasattr(content, "seek"):
            content.seek(0)

        self._client.put_object(
            Bucket=self.bucket_name,
            Key=key,
            Body=content,
        )
        return key

    def open(self, key, mode="rb"):
        if mode != "rb":
            raise ValueError("S3 knowledge storage supports binary reads only.")
        response = self._client.get_object(
            Bucket=self.bucket_name,
            Key=_validate_key(key),
        )
        return response["Body"]

    def delete(self, key):
        self._client.delete_object(
            Bucket=self.bucket_name,
            Key=_validate_key(key),
        )

    def exists(self, key):
        try:
            self._client.head_object(
                Bucket=self.bucket_name,
                Key=_validate_key(key),
            )
        except ClientError as error:
            error_code = error.response.get("Error", {}).get("Code")
            if error_code in {"404", "NoSuchKey", "NotFound"}:
                return False
            raise
        return True

    def get_presigned_url(self, key, expires_in):
        return self._presign_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket_name, "Key": _validate_key(key)},
            ExpiresIn=expires_in,
        )


def get_knowledge_storage():
    if settings.S3_ENDPOINT_URL:
        return S3KnowledgeStorage()
    return LocalKnowledgeStorage()
