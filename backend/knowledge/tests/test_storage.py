import uuid
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from backend.knowledge.storage import (
    LocalKnowledgeStorage,
    S3KnowledgeStorage,
    article_image_storage_key,
    book_storage_key,
    get_knowledge_storage,
)
from .test_support import InMemoryS3Client


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

    def test_returns_local_content_url(self):
        with TemporaryDirectory() as root:
            storage = LocalKnowledgeStorage(root=root)
            key = book_storage_key(uuid.uuid4(), "epub")

            url = storage.get_presigned_url(key, expires_in=300)

        self.assertEqual(urlsplit(url).path, f"/api/knowledge/files/{key}")
        self.assertIn("token=", urlsplit(url).query)


class S3KnowledgeStorageTests(SimpleTestCase):
    def test_saves_reads_checks_and_deletes_object(self):
        client = InMemoryS3Client()
        storage = S3KnowledgeStorage(
            client=client,
            presign_client=client,
            bucket_name="knowledge-test",
        )
        key = book_storage_key(uuid.uuid4(), "pdf")

        self.assertEqual(storage.save(key, b"pdf content"), key)
        self.assertTrue(storage.exists(key))
        with storage.open(key) as stored_file:
            self.assertEqual(stored_file.read(), b"pdf content")

        storage.delete(key)
        self.assertFalse(storage.exists(key))

    def test_generates_short_lived_download_url(self):
        client = InMemoryS3Client()
        storage = S3KnowledgeStorage(
            client=client,
            presign_client=client,
            bucket_name="knowledge-test",
        )
        key = book_storage_key(uuid.uuid4(), "epub")

        url = storage.get_presigned_url(key, expires_in=300)

        self.assertEqual(url, "https://storage.example.test/presigned-book")
        self.assertEqual(
            client.presign_calls,
            [
                (
                    "get_object",
                    {"Bucket": "knowledge-test", "Key": key},
                    300,
                )
            ],
        )

    def test_saves_article_image_content_type(self):
        client = InMemoryS3Client()
        storage = S3KnowledgeStorage(
            client=client,
            presign_client=client,
            bucket_name="knowledge-test",
        )
        key = article_image_storage_key(uuid.uuid4(), "image/png")

        storage.save(key, b"png content", content_type="image/png")

        self.assertEqual(client.content_types[("knowledge-test", key)], "image/png")

    @override_settings(
        S3_ENDPOINT_URL="http://minio:9000",
        S3_PUBLIC_ENDPOINT_URL="https://storage.example.test",
        S3_BUCKET_NAME="knowledge-test",
        S3_ACCESS_KEY_ID="backend",
        S3_SECRET_ACCESS_KEY="test-secret",
        S3_REGION_NAME="us-east-1",
    )
    def test_factory_uses_s3_when_endpoint_is_configured(self):
        client = InMemoryS3Client()
        with patch("knowledge.storage._create_s3_client", return_value=client):
            storage = get_knowledge_storage()

        self.assertIsInstance(storage, S3KnowledgeStorage)
        self.assertEqual(storage.bucket_name, "knowledge-test")

    @override_settings(S3_ENDPOINT_URL="")
    def test_factory_falls_back_to_local_storage(self):
        self.assertIsInstance(get_knowledge_storage(), LocalKnowledgeStorage)

