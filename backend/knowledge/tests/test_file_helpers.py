from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings

from backend.knowledge.book_files import InvalidBookFile, inspect_book_file
from backend.knowledge.covers import (
    MAX_IMAGE_BYTES,
    detect_image_type,
    read_cover_image,
    read_image,
)
from backend.knowledge.models import Book
from .test_helpers import make_epub, make_pdf


class BookFileInspectionTests(SimpleTestCase):
    @override_settings(KNOWLEDGE_BOOK_MAX_UPLOAD_BYTES=1024 * 1024)
    def test_accepts_valid_pdf_and_restores_stream_position(self):
        content = make_pdf()
        file = BytesIO(content)
        file.seek(5)

        result = inspect_book_file(file, Book.Format.PDF)

        self.assertIsNone(result)
        self.assertEqual(file.tell(), 0)
        self.assertEqual(file.read(), content)

    @override_settings(KNOWLEDGE_BOOK_MAX_UPLOAD_BYTES=1024 * 1024)
    def test_rejects_invalid_pdf_header_or_missing_trailer(self):
        invalid_files = (
            b"not a pdf",
            b"%PDF-1.4\nbody without a valid trailer",
        )
        for content in invalid_files:
            with self.subTest(content=content[:16]):
                with self.assertRaises(InvalidBookFile):
                    inspect_book_file(content, Book.Format.PDF)

    @override_settings(KNOWLEDGE_BOOK_MAX_UPLOAD_BYTES=1024 * 1024)
    def test_accepts_epub_and_returns_extracted_metadata(self):
        metadata = inspect_book_file(make_epub(), Book.Format.EPUB)

        self.assertEqual(metadata.title, "Книга из EPUB")
        self.assertEqual(metadata.creator, "Автор EPUB")
        self.assertEqual(metadata.language, "ru")

    @override_settings(KNOWLEDGE_BOOK_MAX_UPLOAD_BYTES=8)
    def test_rejects_content_above_configured_size_limit(self):
        with self.assertRaisesRegex(InvalidBookFile, "не должен превышать"):
            inspect_book_file(make_pdf(), Book.Format.PDF)

    @override_settings(KNOWLEDGE_BOOK_MAX_UPLOAD_BYTES=1024 * 1024)
    def test_rejects_empty_and_unsupported_files(self):
        with self.assertRaisesRegex(InvalidBookFile, "пуст"):
            inspect_book_file(b"", Book.Format.PDF)
        with self.assertRaisesRegex(InvalidBookFile, "Неподдерживаемый формат"):
            inspect_book_file(b"content", "txt")

    @override_settings(KNOWLEDGE_BOOK_MAX_UPLOAD_BYTES=1024 * 1024)
    def test_declared_file_size_cannot_hide_larger_actual_content(self):
        upload = SimpleUploadedFile(
            "book.pdf",
            make_pdf(),
            content_type="application/pdf",
        )
        upload.size = 8

        # The implementation takes the greater of declared and actual sizes.
        with override_settings(KNOWLEDGE_BOOK_MAX_UPLOAD_BYTES=8):
            with self.assertRaises(InvalidBookFile):
                inspect_book_file(upload, Book.Format.PDF)


class CoverImageInspectionTests(SimpleTestCase):
    def test_detects_supported_image_signatures(self):
        examples = {
            "image/jpeg": b"\xff\xd8\xffpayload",
            "image/png": b"\x89PNG\r\n\x1a\npayload",
            "image/gif": b"GIF89apayload",
            "image/webp": b"RIFF\x00\x00\x00\x00WEBPpayload",
        }
        for expected_type, content in examples.items():
            with self.subTest(media_type=expected_type):
                self.assertEqual(detect_image_type(content), expected_type)

    def test_unknown_or_truncated_signatures_are_not_accepted(self):
        for content in (b"", b"GIF8", b"RIFF1234WAVE", b"<svg></svg>"):
            with self.subTest(content=content):
                self.assertIsNone(detect_image_type(content))

    def test_reads_image_and_resets_stream(self):
        content = b"\x89PNG\r\n\x1a\npng-data"
        upload = BytesIO(content)
        upload.seek(4)

        result, media_type = read_image(upload, "application/octet-stream")

        self.assertEqual((result, media_type), (content, "image/png"))
        self.assertEqual(upload.tell(), 0)

    def test_rejects_declared_mime_type_that_disagrees_with_signature(self):
        upload = SimpleUploadedFile("cover.png", b"GIF89a-data")

        with self.assertRaisesRegex(ValueError, "не соответствует"):
            read_cover_image(upload, "image/png")

    def test_rejects_unsupported_image_and_oversized_file(self):
        with self.assertRaisesRegex(ValueError, "должен быть изображением"):
            read_cover_image(BytesIO(b"plain text"))

        upload = SimpleUploadedFile("large.png", b"x" * (MAX_IMAGE_BYTES + 1))
        with self.assertRaisesRegex(ValueError, "5 МБ"):
            read_cover_image(upload)
