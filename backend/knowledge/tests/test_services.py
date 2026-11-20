from decimal import Decimal
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.test import TestCase

from backend.accounts.models import User
from backend.knowledge.models import Book, UserLibraryBook
from backend.knowledge.services import create_book
from .test_helpers import make_epub, make_pdf
from .test_support import FailingAfterSaveStorage, TrackingLocalKnowledgeStorage


class CreateBookTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            email="uploader@example.com",
            name="Загрузивший книгу",
            password="test-password",
        )

    def create_book(self, storage, **changes):
        data = {
            "user": self.user,
            "content": make_epub(),
            "title": "Новая книга",
            "author": "Автор книги",
            "description": "Описание",
            "format": Book.Format.EPUB,
            "visibility": Book.Visibility.PRIVATE,
            "storage": storage,
        }
        data.update(changes)
        return create_book(**data)

    def test_creates_ready_epub_and_adds_it_to_user_library(self):
        with TemporaryDirectory() as root:
            storage = TrackingLocalKnowledgeStorage(root=root)

            book = self.create_book(storage)

            book.refresh_from_db()
            self.assertEqual(book.status, Book.Status.READY)
            self.assertEqual(
                book.storage_key,
                f"books/{book.id}/original.epub",
            )
            self.assertTrue(storage.exists(book.storage_key))
            with storage.open(book.storage_key) as stored_file:
                self.assertEqual(stored_file.read(), make_epub())

            library_entry = UserLibraryBook.objects.get(
                user=self.user,
                book=book,
            )
            self.assertEqual(library_entry.reading_location, {})
            self.assertEqual(library_entry.reading_percentage, Decimal("0.00"))

    def test_creates_ready_pdf_with_original_content(self):
        with TemporaryDirectory() as root:
            storage = TrackingLocalKnowledgeStorage(root=root)
            content = make_pdf()

            book = self.create_book(
                storage,
                content=content,
                format=Book.Format.PDF,
                visibility=Book.Visibility.PUBLIC,
                publication_basis=Book.PublicationBasis.AUTHOR,
                rights_confirmation=True,
            )

            book.refresh_from_db()
            self.assertEqual(book.status, Book.Status.READY)
            self.assertEqual(book.format, Book.Format.PDF)
            self.assertEqual(book.visibility, Book.Visibility.PUBLIC)
            self.assertEqual(
                book.storage_key,
                f"books/{book.id}/original.pdf",
            )
            with storage.open(book.storage_key) as stored_file:
                self.assertEqual(stored_file.read(), content)
            self.assertTrue(
                UserLibraryBook.objects.filter(user=self.user, book=book).exists()
            )

    def test_public_book_requires_confirmation_before_storage_is_used(self):
        with TemporaryDirectory() as root:
            storage = TrackingLocalKnowledgeStorage(root=root)

            with self.assertRaises(ValidationError):
                self.create_book(
                    storage,
                    visibility=Book.Visibility.PUBLIC,
                )

            self.assertIsNone(storage.last_key)
            self.assertFalse(Book.objects.exists())

    def test_storage_failure_rolls_back_database_and_removes_partial_file(self):
        with TemporaryDirectory() as root:
            storage = FailingAfterSaveStorage(root=root)

            with self.assertRaises(OSError):
                self.create_book(storage)

            self.assertFalse(Book.objects.exists())
            self.assertFalse(UserLibraryBook.objects.exists())
            self.assertIsNotNone(storage.last_key)
            self.assertFalse(storage.exists(storage.last_key))

    def test_library_failure_rolls_back_book_and_removes_saved_file(self):
        with TemporaryDirectory() as root:
            storage = TrackingLocalKnowledgeStorage(root=root)

            with patch(
                "knowledge.services.UserLibraryBook.objects.create",
                side_effect=IntegrityError("Library failure"),
            ):
                with self.assertRaises(IntegrityError):
                    self.create_book(storage)

            self.assertFalse(Book.objects.exists())
            self.assertFalse(UserLibraryBook.objects.exists())
            self.assertIsNotNone(storage.last_key)
            self.assertFalse(storage.exists(storage.last_key))

    def test_rejects_unsupported_format_before_creating_resources(self):
        with TemporaryDirectory() as root:
            storage = TrackingLocalKnowledgeStorage(root=root)

            with self.assertRaises(ValidationError):
                self.create_book(storage, format="txt")

            self.assertFalse(Book.objects.exists())
            self.assertFalse(UserLibraryBook.objects.exists())
            self.assertIsNone(storage.last_key)

