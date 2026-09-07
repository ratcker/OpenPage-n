import uuid

from django.core.exceptions import ValidationError
from django.db import transaction

from .covers import read_cover_image, read_image
from .epub import InvalidEpubError, extract_epub_metadata
from .models import Book, KnowledgeProfile, UserLibraryBook
from .storage import (
    book_cover_storage_key,
    book_storage_key,
    get_knowledge_storage,
    profile_avatar_storage_key,
)


def _cleanup(storage, keys):
    for key in reversed(keys):
        try:
            storage.delete(key)
        except Exception:
            # Cleanup не должен скрывать исходную ошибку операции.
            pass


# Создание книги остаётся одной явной доменной операцией.
def create_book(
    *,
    user,
    content,
    title,
    author,
    description,
    format,
    visibility,
    language="",
    year=None,
    publisher="",
    cover=None,
    storage=None,
):
    if format not in Book.Format.values:
        raise ValidationError({"format": "Неподдерживаемый формат книги."})

    if storage is None:
        storage = get_knowledge_storage()

    book_id = uuid.uuid4()
    storage_key = book_storage_key(book_id, format)
    cover_content = None
    cover_media_type = None
    if cover is not None:
        cover_content, cover_media_type = read_cover_image(
            cover,
            getattr(cover, "content_type", None),
        )
    elif format == Book.Format.EPUB:
        try:
            preview = extract_epub_metadata(content)
        except InvalidEpubError:
            preview = None
        if preview and preview.cover:
            cover_content = preview.cover
            cover_media_type = preview.cover_media_type

    cover_key = (
        book_cover_storage_key(book_id, cover_media_type)
        if cover_content and cover_media_type
        else ""
    )
    book = Book(
        id=book_id,
        title=title,
        author=author,
        description=description,
        language=language,
        year=year,
        publisher=publisher,
        format=format,
        uploaded_by=user,
        visibility=visibility,
        status=Book.Status.PROCESSING,
        storage_key=storage_key,
        cover_key=cover_key,
    )
    attempted_keys = []

    try:
        with transaction.atomic():
            book.full_clean()
            book.save(force_insert=True)

            # Файл не участвует в DB-транзакции, поэтому cleanup выполняется ниже.
            attempted_keys.append(storage_key)
            storage.save(storage_key, content)
            if not storage.exists(storage_key):
                raise OSError("Storage did not persist the book file.")

            if cover_key:
                attempted_keys.append(cover_key)
                storage.save(cover_key, cover_content)
                if not storage.exists(cover_key):
                    raise OSError("Storage did not persist the book cover.")

            book.status = Book.Status.READY
            book.save(update_fields=("status", "updated_at"))
            UserLibraryBook.objects.create(user=user, book=book)
    except Exception:
        _cleanup(storage, attempted_keys)
        raise

    return book


def update_book_metadata(*, book, data, storage=None):
    if storage is None:
        storage = get_knowledge_storage()

    changes = dict(data)
    cover = changes.pop("cover", None)
    old_cover_key = book.cover_key
    new_cover_key = ""

    if cover is not None:
        cover_content, media_type = read_cover_image(
            cover,
            getattr(cover, "content_type", None),
        )
        new_cover_key = book_cover_storage_key(book.id, media_type)
        try:
            storage.save(new_cover_key, cover_content)
            if not storage.exists(new_cover_key):
                raise OSError("Storage did not persist the book cover.")
        except Exception:
            _cleanup(storage, [new_cover_key])
            raise
        changes["cover_key"] = new_cover_key

    try:
        with transaction.atomic():
            for field, value in changes.items():
                setattr(book, field, value)
            book.full_clean()
            book.save(update_fields=(*changes.keys(), "updated_at"))
    except Exception:
        if new_cover_key:
            _cleanup(storage, [new_cover_key])
        raise

    if new_cover_key and old_cover_key:
        storage.delete(old_cover_key)
    return book


def create_knowledge_profile(*, user, data, storage=None):
    if storage is None:
        storage = get_knowledge_storage()

    values = dict(data)
    avatar = values.pop("avatar", None)
    profile = KnowledgeProfile(user=user, **values)
    avatar_key = ""

    if avatar is not None:
        content, media_type = read_image(
            avatar,
            getattr(avatar, "content_type", None),
            subject="Аватар",
        )
        avatar_key = profile_avatar_storage_key(profile.public_id, media_type)

    try:
        if avatar_key:
            storage.save(avatar_key, content)
            if not storage.exists(avatar_key):
                raise OSError("Storage did not persist the profile avatar.")
            profile.avatar = avatar_key

        with transaction.atomic():
            profile.full_clean()
            profile.save(force_insert=True)
    except Exception:
        if avatar_key:
            _cleanup(storage, [avatar_key])
        raise

    return profile


def update_knowledge_profile(*, profile, data, storage=None):
    if storage is None:
        storage = get_knowledge_storage()

    changes = dict(data)
    avatar = changes.pop("avatar", None)
    old_values = {field: getattr(profile, field) for field in changes}
    old_avatar_key = profile.avatar
    new_avatar_key = ""

    if avatar is not None:
        content, media_type = read_image(
            avatar,
            getattr(avatar, "content_type", None),
            subject="Аватар",
        )
        new_avatar_key = profile_avatar_storage_key(profile.public_id, media_type)
        try:
            storage.save(new_avatar_key, content)
            if not storage.exists(new_avatar_key):
                raise OSError("Storage did not persist the profile avatar.")
        except Exception:
            _cleanup(storage, [new_avatar_key])
            raise
        changes["avatar"] = new_avatar_key

    if not changes:
        return profile

    try:
        with transaction.atomic():
            for field, value in changes.items():
                setattr(profile, field, value)
            profile.full_clean()
            profile.save(update_fields=changes.keys())

            # При ошибке удаления DB-транзакция вернёт ссылку на старый avatar.
            if new_avatar_key and old_avatar_key:
                storage.delete(old_avatar_key)
    except Exception:
        for field, value in old_values.items():
            setattr(profile, field, value)
        profile.avatar = old_avatar_key
        if new_avatar_key:
            _cleanup(storage, [new_avatar_key])
        raise

    return profile


def delete_knowledge_profile_avatar(*, profile, storage=None):
    if not profile.avatar:
        return profile
    if storage is None:
        storage = get_knowledge_storage()

    old_avatar_key = profile.avatar
    try:
        with transaction.atomic():
            profile.avatar = ""
            profile.save(update_fields=("avatar",))
            storage.delete(old_avatar_key)
    except Exception:
        profile.avatar = old_avatar_key
        raise

    return profile
