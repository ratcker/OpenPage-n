import uuid
from datetime import date
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User

from .epub import InvalidEpubError, extract_epub_metadata
from .models import Book, KnowledgeProfile, UserLibraryBook
from .services import create_book, update_book_metadata
from .storage import LocalKnowledgeStorage, book_cover_storage_key, book_storage_key

JPEG = b"\xff\xd8\xff\xe0test-cover"
PNG = b"\x89PNG\r\n\x1a\ntest-cover"


def make_epub(*, metadata=True, cover=JPEG, container=None, extra_entries=None):
    metadata_xml = ""
    if metadata:
        metadata_xml = """
            <dc:title>Книга из EPUB</dc:title>
            <dc:creator>Автор EPUB</dc:creator>
            <dc:language>ru</dc:language>
            <dc:publisher>Издательство</dc:publisher>
            <dc:date>2024-05-10</dc:date>
            <meta name="cover" content="cover-image" />
        """
    cover_item = (
        '<item id="cover-image" href="images/cover.jpg" '
        'media-type="image/jpeg" properties="cover-image" />'
        if cover is not None
        else ""
    )
    opf = f"""<?xml version="1.0"?>
        <package xmlns="http://www.idpf.org/2007/opf"
                 xmlns:dc="http://purl.org/dc/elements/1.1/">
          <metadata>{metadata_xml}</metadata>
          <manifest>{cover_item}</manifest>
        </package>
    """
    container = (
        container
        or """<?xml version="1.0"?>
        <container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles><rootfile full-path="OEBPS/content.opf" /></rootfiles>
        </container>
    """
    )

    output = BytesIO()
    with ZipFile(output, "w") as archive:
        archive.writestr("mimetype", "application/epub+zip", compress_type=ZIP_STORED)
        archive.writestr(
            "META-INF/container.xml",
            container,
            compress_type=ZIP_DEFLATED,
        )
        archive.writestr("OEBPS/content.opf", opf, compress_type=ZIP_DEFLATED)
        if cover is not None:
            archive.writestr("OEBPS/images/cover.jpg", cover)
        for name, content in extra_entries or ():
            archive.writestr(name, content)
    return output.getvalue()


class EpubExtractionTests(TestCase):
    def test_extracts_metadata_and_cover(self):
        result = extract_epub_metadata(BytesIO(make_epub()))

        self.assertEqual(result.title, "Книга из EPUB")
        self.assertEqual(result.author, "Автор EPUB")
        self.assertEqual(result.language, "ru")
        self.assertEqual(result.publisher, "Издательство")
        self.assertEqual(result.year, 2024)
        self.assertEqual(result.cover, JPEG)
        self.assertEqual(result.cover_media_type, "image/jpeg")

    def test_missing_metadata_and_cover_are_allowed(self):
        result = extract_epub_metadata(BytesIO(make_epub(metadata=False, cover=None)))

        self.assertIsNone(result.title)
        self.assertIsNone(result.author)
        self.assertIsNone(result.year)
        self.assertIsNone(result.cover)

    def test_rejects_malformed_non_epub_and_dangerous_paths(self):
        unsafe_epub = make_epub(extra_entries=(("../outside.txt", b"unsafe"),))

        for content in (b"not a zip", unsafe_epub):
            with self.subTest(content=content[:12]):
                with self.assertRaises(InvalidEpubError):
                    extract_epub_metadata(BytesIO(content))

    def test_rejects_excessive_archive_and_external_entities(self):
        xxe_container = """<?xml version="1.0"?>
            <!DOCTYPE container [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
            <container><rootfiles><rootfile full-path="OEBPS/content.opf" />
            </rootfiles></container>
        """
        with self.assertRaises(InvalidEpubError):
            extract_epub_metadata(BytesIO(make_epub(container=xxe_container)))

        with patch("knowledge.epub.MAX_EPUB_ENTRIES", 2):
            with self.assertRaises(InvalidEpubError):
                extract_epub_metadata(BytesIO(make_epub()))


class CatalogV2APITestCase(APITestCase):
    def setUp(self):
        self.media_directory = TemporaryDirectory()
        self.addCleanup(self.media_directory.cleanup)
        self.media_override = override_settings(
            MEDIA_ROOT=Path(self.media_directory.name)
        )
        self.media_override.enable()
        self.addCleanup(self.media_override.disable)

        self.user = User.objects.create_user(
            email="author@example.com",
            name="Автор",
            password="test-password",
        )
        self.other_user = User.objects.create_user(
            email="other-author@example.com",
            name="Другой автор",
            password="test-password",
        )
        KnowledgeProfile.objects.create(user=self.user, display_name="Автор")

    def authenticate(self, user=None):
        token = RefreshToken.for_user(user or self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def create_model_book(self, *, user=None, cover_key=""):
        book_id = uuid.uuid4()
        return Book.objects.create(
            id=book_id,
            title="Исходное название",
            author="Исходный автор",
            description="Исходное описание",
            format=Book.Format.EPUB,
            uploaded_by=user or self.user,
            visibility=Book.Visibility.PRIVATE,
            status=Book.Status.READY,
            storage_key=book_storage_key(book_id, Book.Format.EPUB),
            cover_key=cover_key,
        )

    def epub_file(self, content=None):
        return SimpleUploadedFile(
            "book.epub",
            content or make_epub(),
            content_type="application/epub+zip",
        )

    def cover_file(self, content=PNG, content_type="image/png"):
        return SimpleUploadedFile("cover.png", content, content_type=content_type)

    def upload_data(self, **changes):
        data = {
            "file": self.epub_file(),
            "title": "  Новая книга  ",
            "author": "Автор книги",
            "description": "Описание",
            "format": Book.Format.EPUB,
            "visibility": Book.Visibility.PRIVATE,
            "language": "  en  ",
            "year": 2020,
            "publisher": "  Издатель  ",
        }
        data.update(changes)
        return data


class EpubPreviewAPITests(CatalogV2APITestCase):
    def setUp(self):
        super().setUp()
        self.authenticate()
        self.url = reverse("knowledge_books_preview")

    def test_preview_returns_metadata_and_data_url_without_side_effects(self):
        with patch(
            "knowledge.views.get_knowledge_storage",
            side_effect=AssertionError("storage must not be used"),
        ):
            response = self.client.post(
                self.url,
                {"file": self.epub_file()},
                format="multipart",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["title"], "Книга из EPUB")
        self.assertEqual(response.data["author"], "Автор EPUB")
        self.assertEqual(response.data["language"], "ru")
        self.assertEqual(response.data["publisher"], "Издательство")
        self.assertEqual(response.data["year"], 2024)
        self.assertTrue(response.data["cover"].startswith("data:image/jpeg;base64,"))
        self.assertFalse(Book.objects.exists())

    def test_preview_without_optional_values_succeeds_with_nulls(self):
        response = self.client.post(
            self.url,
            {"file": self.epub_file(make_epub(metadata=False, cover=None))},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            {
                "title": None,
                "author": None,
                "language": None,
                "publisher": None,
                "year": None,
                "cover": None,
            },
        )

    def test_malformed_and_non_epub_files_are_rejected(self):
        for content in (b"broken zip", make_epub(extra_entries=(("../x", b"x"),))):
            with self.subTest(content=content[:10]):
                response = self.client.post(
                    self.url,
                    {"file": self.epub_file(content)},
                    format="multipart",
                )
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class BookMetadataUploadAPITests(CatalogV2APITestCase):
    def setUp(self):
        super().setUp()
        self.authenticate()
        self.url = reverse("knowledge_books")

    def test_upload_saves_metadata_and_extracted_cover(self):
        response = self.client.post(
            self.url,
            self.upload_data(visibility=Book.Visibility.PUBLIC),
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        book = Book.objects.get()
        self.assertEqual(book.language, "en")
        self.assertEqual(book.year, 2020)
        self.assertEqual(book.publisher, "Издатель")
        self.assertTrue(book.cover_key)
        self.assertNotIn("cover_key", response.data)
        self.assertNotIn("storage_key", response.data)
        with LocalKnowledgeStorage().open(book.cover_key) as stored:
            self.assertEqual(stored.read(), JPEG)
        self.assertTrue(response.data["cover_url"].endswith(book.cover_key))

        catalog = self.client.get(self.url)
        serialized = catalog.data["results"][0]
        self.assertIn("cover_url", serialized)
        self.assertNotIn("cover_key", serialized)
        self.assertNotIn("storage_key", serialized)

    def test_manual_epub_cover_has_priority(self):
        response = self.client.post(
            self.url,
            self.upload_data(cover=self.cover_file()),
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        with LocalKnowledgeStorage().open(Book.objects.get().cover_key) as stored:
            self.assertEqual(stored.read(), PNG)

    def test_epub_and_pdf_without_cover_upload_successfully(self):
        epub_data = self.upload_data(file=self.epub_file(make_epub(cover=None)))
        pdf_data = self.upload_data(
            file=SimpleUploadedFile("book.pdf", b"%PDF content"),
            format=Book.Format.PDF,
        )

        for data in (epub_data, pdf_data):
            with self.subTest(format=data["format"]):
                response = self.client.post(self.url, data, format="multipart")
                self.assertEqual(response.status_code, status.HTTP_201_CREATED)
                self.assertEqual(Book.objects.latest("created_at").cover_key, "")

    def test_pdf_manual_cover_is_saved(self):
        response = self.client.post(
            self.url,
            self.upload_data(
                file=SimpleUploadedFile("book.pdf", b"%PDF content"),
                format=Book.Format.PDF,
                cover=self.cover_file(),
            ),
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Book.objects.get().cover_key)

    def test_invalid_year_and_cover_are_rejected(self):
        invalid_data = (
            self.upload_data(year=-1),
            self.upload_data(year=date.today().year + 2),
            self.upload_data(
                cover=self.cover_file(b"not an image", "image/png"),
            ),
            self.upload_data(
                cover=self.cover_file(b"\x89PNG\r\n\x1a\n" + b"x" * (5 * 1024 * 1024)),
            ),
        )

        for data in invalid_data:
            with self.subTest(fields=tuple(data)):
                response = self.client.post(self.url, data, format="multipart")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Book.objects.exists())


class BookMetadataPatchAPITests(CatalogV2APITestCase):
    def setUp(self):
        super().setUp()
        self.book = self.create_model_book()
        self.url = reverse(
            "knowledge_book_detail",
            kwargs={"book_uuid": self.book.id},
        )

    def test_uploader_can_update_all_metadata(self):
        self.authenticate()
        response = self.client.patch(
            self.url,
            {
                "title": "Новое название",
                "author": "Новый автор",
                "description": "Новое описание",
                "language": " de ",
                "year": 1999,
                "publisher": " Новый издатель ",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.book.refresh_from_db()
        self.assertEqual(self.book.title, "Новое название")
        self.assertEqual(self.book.author, "Новый автор")
        self.assertEqual(self.book.description, "Новое описание")
        self.assertEqual(self.book.language, "de")
        self.assertEqual(self.book.year, 1999)
        self.assertEqual(self.book.publisher, "Новый издатель")

    def test_anonymous_and_foreign_user_cannot_patch(self):
        anonymous = self.client.patch(self.url, {"title": "Нет"}, format="multipart")
        self.authenticate(self.other_user)
        foreign = self.client.patch(self.url, {"title": "Нет"}, format="multipart")

        self.assertEqual(anonymous.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(foreign.status_code, status.HTTP_403_FORBIDDEN)
        self.book.refresh_from_db()
        self.assertEqual(self.book.title, "Исходное название")

    def test_immutable_fields_are_rejected_and_unchanged(self):
        self.authenticate()
        original = {
            "format": self.book.format,
            "visibility": self.book.visibility,
            "storage_key": self.book.storage_key,
            "uploaded_by_id": self.book.uploaded_by_id,
            "status": self.book.status,
        }

        for field, value in {
            "format": "pdf",
            "visibility": "public",
            "storage_key": "books/other/original.epub",
            "uploaded_by": self.other_user.id,
            "status": "failed",
            "file": self.epub_file(),
        }.items():
            with self.subTest(field=field):
                response = self.client.patch(
                    self.url,
                    {field: value},
                    format="multipart",
                )
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.book.refresh_from_db()
        for field, value in original.items():
            self.assertEqual(getattr(self.book, field), value)

    def test_cover_replacement_deletes_old_cover_after_success(self):
        storage = LocalKnowledgeStorage()
        old_key = book_cover_storage_key(self.book.id, "image/jpeg")
        storage.save(old_key, JPEG)
        self.book.cover_key = old_key
        self.book.save(update_fields=("cover_key",))
        self.authenticate()

        response = self.client.patch(
            self.url,
            {"cover": self.cover_file()},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.book.refresh_from_db()
        self.assertNotEqual(self.book.cover_key, old_key)
        self.assertFalse(storage.exists(old_key))
        self.assertTrue(storage.exists(self.book.cover_key))

    def test_cover_save_failure_keeps_old_cover(self):
        class FailingStorage(LocalKnowledgeStorage):
            attempted_key = None

            def save(self, key, content):
                self.attempted_key = key
                super().save(key, content)
                raise OSError("cover storage failed")

        storage = LocalKnowledgeStorage()
        old_key = book_cover_storage_key(self.book.id, "image/jpeg")
        storage.save(old_key, JPEG)
        self.book.cover_key = old_key
        self.book.save(update_fields=("cover_key",))
        self.authenticate()

        failing_storage = FailingStorage()
        with patch(
            "knowledge.views.get_knowledge_storage", return_value=failing_storage
        ):
            response = self.client.patch(
                self.url,
                {"cover": self.cover_file()},
                format="multipart",
            )

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.book.refresh_from_db()
        self.assertEqual(self.book.cover_key, old_key)
        self.assertTrue(storage.exists(old_key))
        self.assertFalse(storage.exists(failing_storage.attempted_key))


class CreateBookCoverCleanupTests(TestCase):
    def test_cover_storage_failure_removes_original_and_partial_cover(self):
        class FailingSecondSaveStorage(LocalKnowledgeStorage):
            keys = []

            def save(self, key, content):
                self.keys.append(key)
                result = super().save(key, content)
                if len(self.keys) == 2:
                    raise OSError("cover storage failed")
                return result

        user = User.objects.create_user(email="cleanup@example.com")
        with TemporaryDirectory() as root:
            storage = FailingSecondSaveStorage(root=root)
            cover = SimpleUploadedFile("cover.jpg", JPEG, content_type="image/jpeg")

            with self.assertRaises(OSError):
                create_book(
                    user=user,
                    content=b"epub",
                    title="Книга",
                    author="Автор",
                    description="",
                    format=Book.Format.EPUB,
                    visibility=Book.Visibility.PRIVATE,
                    cover=cover,
                    storage=storage,
                )

            self.assertFalse(Book.objects.exists())
            self.assertFalse(UserLibraryBook.objects.exists())
            self.assertEqual(len(storage.keys), 2)
            self.assertTrue(all(not storage.exists(key) for key in storage.keys))

    def test_database_failure_during_cover_replace_keeps_old_cover(self):
        user = User.objects.create_user(email="replace@example.com")
        book_id = uuid.uuid4()
        book = Book.objects.create(
            id=book_id,
            title="Книга",
            author="Автор",
            format=Book.Format.EPUB,
            uploaded_by=user,
            storage_key=book_storage_key(book_id, Book.Format.EPUB),
        )

        with TemporaryDirectory() as root:
            storage = LocalKnowledgeStorage(root=root)
            old_key = book_cover_storage_key(book.id, "image/jpeg")
            storage.save(old_key, JPEG)
            book.cover_key = old_key
            book.save(update_fields=("cover_key",))
            cover = SimpleUploadedFile("cover.png", PNG, content_type="image/png")

            with patch.object(book, "save", side_effect=IntegrityError("db failed")):
                with self.assertRaises(IntegrityError):
                    update_book_metadata(
                        book=book,
                        data={"cover": cover},
                        storage=storage,
                    )

            book.refresh_from_db()
            self.assertEqual(book.cover_key, old_key)
            self.assertTrue(storage.exists(old_key))
            cover_directory = Path(root) / "books" / str(book.id) / "covers"
            self.assertEqual(
                [path.name for path in cover_directory.iterdir()], [Path(old_key).name]
            )
