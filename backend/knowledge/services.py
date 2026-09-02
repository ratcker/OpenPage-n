import uuid

from django.core.exceptions import ValidationError
from django.db import transaction

from .models import Book, UserLibraryBook
from .storage import book_storage_key, get_knowledge_storage


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
    storage=None,
):
    if format not in Book.Format.values:
        raise ValidationError({"format": "Неподдерживаемый формат книги."})

    if storage is None:
        storage = get_knowledge_storage()

    book_id = uuid.uuid4()
    storage_key = book_storage_key(book_id, format)
    book = Book(
        id=book_id,
        title=title,
        author=author,
        description=description,
        format=format,
        uploaded_by=user,
        visibility=visibility,
        status=Book.Status.PROCESSING,
        storage_key=storage_key,
    )
    save_attempted = False

    try:
        with transaction.atomic():
            book.full_clean()
            book.save(force_insert=True)

            # Файл не участвует в DB-транзакции, поэтому cleanup выполняется ниже.
            save_attempted = True
            storage.save(storage_key, content)
            if not storage.exists(storage_key):
                raise OSError("Storage did not persist the book file.")

            book.status = Book.Status.READY
            book.save(update_fields=("status", "updated_at"))
            UserLibraryBook.objects.create(user=user, book=book)
    except Exception:
        if save_attempted:
            storage.delete(storage_key)
        raise

    return book
