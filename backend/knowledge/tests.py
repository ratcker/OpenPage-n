import uuid
from decimal import Decimal
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import SimpleTestCase, TestCase

from accounts.models import User

from .models import Book, KnowledgeProfile, UserLibraryBook
from .services import create_book
from .storage import LocalKnowledgeStorage, book_storage_key


class TrackingLocalKnowledgeStorage(LocalKnowledgeStorage):
    last_key = None

    def save(self, key, content):
        self.last_key = key
        return super().save(key, content)


class FailingAfterSaveStorage(TrackingLocalKnowledgeStorage):
    def save(self, key, content):
        super().save(key, content)
        raise OSError("Storage failure")


class KnowledgeModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            email="reader@example.com",
            name="Читатель",
            password="test-password",
        )

    def create_book(self, **changes):
        book_id = changes.pop("id", uuid.uuid4())
        data = {
            "id": book_id,
            "title": "Тестовая книга",
            "author": "Автор",
            "description": "Описание книги",
            "format": Book.Format.EPUB,
            "uploaded_by": self.user,
            "visibility": Book.Visibility.PRIVATE,
            "status": Book.Status.PROCESSING,
            "storage_key": book_storage_key(book_id, Book.Format.EPUB),
        }
        data.update(changes)
        return Book.objects.create(**data)

    def test_creates_knowledge_profile_for_existing_user(self):
        profile = KnowledgeProfile.objects.create(
            user=self.user,
            display_name="Автор материалов",
            bio="Короткое описание",
            avatar="avatars/profile-id/original.webp",
        )

        self.assertEqual(profile.user, self.user)
        self.assertEqual(self.user.knowledge_profile, profile)
        self.assertEqual(str(profile), "Автор материалов")

    def test_creates_book_with_uuid_and_canonical_storage_key(self):
        book = self.create_book()

        self.assertIsInstance(book.id, uuid.UUID)
        self.assertEqual(book.format, Book.Format.EPUB)
        self.assertEqual(book.visibility, Book.Visibility.PRIVATE)
        self.assertEqual(book.status, Book.Status.PROCESSING)
        self.assertEqual(
            book.storage_key,
            f"books/{book.id}/original.epub",
        )

    def test_book_choices_contain_only_supported_values(self):
        self.assertEqual(set(Book.Format.values), {"epub", "pdf"})
        self.assertEqual(set(Book.Visibility.values), {"public", "private"})
        self.assertEqual(
            set(Book.Status.values),
            {"processing", "ready", "failed"},
        )

        invalid_book = self.create_book()
        invalid_book.format = "txt"
        invalid_book.visibility = "shared"
        invalid_book.status = "unknown"

        with self.assertRaises(ValidationError):
            invalid_book.full_clean()

    def test_user_and_book_pair_is_unique_in_library(self):
        book = self.create_book()
        UserLibraryBook.objects.create(
            user=self.user,
            book=book,
            reading_location={"chapter": "chapter-2", "offset": 148},
            reading_percentage=Decimal("24.50"),
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                UserLibraryBook.objects.create(user=self.user, book=book)

    def test_reading_percentage_stays_between_zero_and_one_hundred(self):
        entry = UserLibraryBook(
            user=self.user,
            book=self.create_book(),
            reading_percentage=Decimal("100.01"),
        )

        with self.assertRaises(ValidationError):
            entry.full_clean()


class LocalKnowledgeStorageTests(SimpleTestCase):
    def test_saves_reads_overwrites_and_deletes_file(self):
        with TemporaryDirectory() as root:
            storage = LocalKnowledgeStorage(root=root)
            key = book_storage_key(uuid.uuid4(), "pdf")

            self.assertEqual(storage.save(key, b"first version"), key)
            self.assertTrue(storage.exists(key))
            with storage.open(key) as stored_file:
                self.assertEqual(stored_file.read(), b"first version")

            self.assertEqual(storage.save(key, b"updated version"), key)
            with storage.open(key) as stored_file:
                self.assertEqual(stored_file.read(), b"updated version")

            storage.delete(key)
            self.assertFalse(storage.exists(key))

    def test_rejects_unsafe_or_unsupported_keys(self):
        with TemporaryDirectory() as root:
            storage = LocalKnowledgeStorage(root=root)

            with self.assertRaises(ValueError):
                storage.save("../outside.pdf", b"content")

            with self.assertRaises(ValueError):
                book_storage_key(uuid.uuid4(), "txt")


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
            "content": b"epub file content",
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
                self.assertEqual(stored_file.read(), b"epub file content")

            library_entry = UserLibraryBook.objects.get(
                user=self.user,
                book=book,
            )
            self.assertEqual(library_entry.reading_location, {})
            self.assertEqual(library_entry.reading_percentage, Decimal("0.00"))

    def test_creates_ready_pdf_with_original_content(self):
        with TemporaryDirectory() as root:
            storage = TrackingLocalKnowledgeStorage(root=root)
            content = b"%PDF test content"

            book = self.create_book(
                storage,
                content=content,
                format=Book.Format.PDF,
                visibility=Book.Visibility.PUBLIC,
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
