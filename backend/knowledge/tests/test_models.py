import uuid
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from backend.accounts.models import User
from backend.knowledge.models import Book, KnowledgeProfile, UserLibraryBook
from backend.knowledge.storage import book_storage_key


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

