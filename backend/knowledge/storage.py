from pathlib import PurePosixPath
from uuid import UUID

from django.conf import settings
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


# Локальная реализация изолирует домен от физических путей файловой системы.
class LocalKnowledgeStorage:
    def __init__(self, root=None):
        location = root or settings.MEDIA_ROOT / "knowledge"
        self._storage = FileSystemStorage(
            location=location,
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
