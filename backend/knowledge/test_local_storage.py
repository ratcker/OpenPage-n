from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from urllib.parse import urlsplit
from uuid import uuid4

from django.test import SimpleTestCase, override_settings

from .storage import LocalKnowledgeStorage, book_storage_key


@override_settings(S3_ENDPOINT_URL="")
class LocalFileTests(SimpleTestCase):
    def setUp(self):
        directory = self.enterContext(TemporaryDirectory())
        self.enterContext(override_settings(MEDIA_ROOT=Path(directory)))
        self.storage = LocalKnowledgeStorage()
        self.key = book_storage_key(uuid4(), "pdf")
        self.content = b"0123456789"
        self.storage.save(self.key, self.content)
        self.url = self.storage.get_presigned_url(self.key, expires_in=300)

    def test_signed_url_serves_file_without_authorization_header(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertEqual(response["Content-Length"], "10")
        self.assertEqual(response["Accept-Ranges"], "bytes")
        self.assertIn("no-store", response["Cache-Control"])
        self.assertEqual(b"".join(response.streaming_content), self.content)

    def test_head_returns_headers_without_content(self):
        response = self.client.head(self.url, HTTP_RANGE="bytes=0-2")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Length"], "10")
        self.assertEqual(b"".join(response.streaming_content), b"")

    def test_missing_or_invalid_signature_is_forbidden(self):
        path = urlsplit(self.url).path
        for url in (path, f"{path}?token=invalid", self.url + "tampered"):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 403)

    def test_signature_cannot_be_reused_for_another_file(self):
        other_key = book_storage_key(uuid4(), "pdf")
        self.storage.save(other_key, b"private")
        response = self.client.get(self.url.replace(self.key, other_key))

        self.assertEqual(response.status_code, 403)

    def test_url_expires_after_requested_lifetime(self):
        with patch("knowledge.storage.time", return_value=1000):
            url = self.storage.get_presigned_url(self.key, expires_in=10)
        with patch("knowledge.storage_views.time", return_value=1009):
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200)
            response.close()
        with patch("knowledge.storage_views.time", return_value=1010):
            self.assertEqual(self.client.get(url).status_code, 403)

    def test_deleted_file_returns_not_found(self):
        self.storage.delete(self.key)

        self.assertEqual(self.client.get(self.url).status_code, 404)

    def test_unsigned_media_path_is_not_served(self):
        response = self.client.get(f"/media/knowledge/{self.key}")

        self.assertEqual(response.status_code, 404)

    @override_settings(S3_ENDPOINT_URL="http://minio:9000")
    def test_local_endpoint_is_disabled_in_s3_mode(self):
        self.assertEqual(self.client.get(self.url).status_code, 404)

    def test_single_byte_ranges(self):
        cases = (
            ("bytes=2-5", b"2345", "bytes 2-5/10"),
            ("bytes=7-", b"789", "bytes 7-9/10"),
            ("bytes=-3", b"789", "bytes 7-9/10"),
            ("bytes=8-99", b"89", "bytes 8-9/10"),
            ("bytes=-99", self.content, "bytes 0-9/10"),
            ("bytes=0-0", b"0", "bytes 0-0/10"),
        )
        for header, content, content_range in cases:
            with self.subTest(range=header):
                response = self.client.get(self.url, HTTP_RANGE=header)
                self.assertEqual(response.status_code, 206)
                self.assertEqual(response["Content-Length"], str(len(content)))
                self.assertEqual(response["Content-Range"], content_range)
                self.assertEqual(b"".join(response.streaming_content), content)

    def test_unsatisfiable_range(self):
        for header in ("bytes=10-", "bytes=5-2", "bytes=-0"):
            with self.subTest(range=header):
                response = self.client.get(self.url, HTTP_RANGE=header)
                self.assertEqual(response.status_code, 416)
                self.assertEqual(response["Content-Range"], "bytes */10")

    def test_unsupported_range_returns_entire_file(self):
        for header in ("bytes=0-1,4-5", "invalid", "bytes=-"):
            with self.subTest(range=header):
                response = self.client.get(self.url, HTTP_RANGE=header)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(b"".join(response.streaming_content), self.content)

    def test_if_range_returns_entire_file_without_matching_validator(self):
        response = self.client.get(
            self.url, HTTP_RANGE="bytes=0-2", HTTP_IF_RANGE='"old-version"'
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), self.content)
