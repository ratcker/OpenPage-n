from contextlib import contextmanager
from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core import mail
from django.core.cache import cache
from django.core.cache.backends.db import DatabaseCache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.settings import api_settings
from rest_framework.test import APITestCase
from rest_framework.throttling import SimpleRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import PendingRegistration, User
from knowledge.models import ArticleImageUploadSession, Book, KnowledgeProfile
from knowledge.test_helpers import make_epub

from .models import CacheEntry
from .throttles import LoginIPThrottle


@contextmanager
def throttle_settings(**rates):
    rest_framework = dict(settings.REST_FRAMEWORK)
    rest_framework["DEFAULT_THROTTLE_RATES"] = {
        **settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],
        **rates,
    }
    try:
        with (
            override_settings(REST_FRAMEWORK=rest_framework),
            patch.object(
                SimpleRateThrottle,
                "THROTTLE_RATES",
                rest_framework["DEFAULT_THROTTLE_RATES"],
            ),
        ):
            api_settings.reload()
            yield
    finally:
        api_settings.reload()


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class AuthenticationThrottleTests(APITestCase):
    password = "StrongThrottlePassword123!"

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.user = User.objects.create_user(
            email="limited@example.com",
            name="Пользователь",
            password=self.password,
        )

    def login(self, *, email=None, password=None, ip="198.51.100.10"):
        return self.client.post(
            reverse("login"),
            {
                "email": email or self.user.email,
                "password": password or self.password,
            },
            format="json",
            REMOTE_ADDR=ip,
        )

    def registration_data(self, email):
        return {
            "email": email,
            "name": "Новый пользователь",
            "password": self.password,
            "password_confirm": self.password,
        }

    def test_login_under_limit_succeeds(self):
        with throttle_settings(auth_login_ip="2/hour", auth_login_email="2/hour"):
            response = self.login()

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_login_over_limit_returns_429_without_blocking_refresh(self):
        with throttle_settings(auth_login_ip="1/hour", auth_login_email="10/hour"):
            first = self.login()
            blocked = self.login()
            refreshed = self.client.post(reverse("token_refresh"))

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(blocked.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn("detail", blocked.data)
        self.assertEqual(refreshed.status_code, status.HTTP_200_OK)

    def test_same_account_is_limited_across_ips_and_email_case(self):
        with throttle_settings(auth_login_ip="100/hour", auth_login_email="1/hour"):
            first = self.login(password="wrong", ip="198.51.100.11")
            blocked = self.login(
                email=" LIMITED@EXAMPLE.COM ",
                password="wrong",
                ip="198.51.100.12",
            )

        self.assertEqual(first.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(blocked.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        keys = list(CacheEntry.objects.values_list("cache_key", flat=True))
        self.assertFalse(any("limited@example.com" in key for key in keys))

    def test_different_ip_and_account_have_independent_limits(self):
        with throttle_settings(auth_login_ip="1/hour", auth_login_email="1/hour"):
            first = self.login(
                email="first@example.com",
                password="wrong",
                ip="198.51.100.21",
            )
            second = self.login(
                email="second@example.com",
                password="wrong",
                ip="198.51.100.22",
            )

        self.assertEqual(first.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_registration_under_limit_succeeds(self):
        with throttle_settings(
            auth_register_ip="2/hour",
            auth_register_email="2/hour",
        ):
            response = self.client.post(
                reverse("register"),
                self.registration_data("new@example.com"),
                format="json",
                REMOTE_ADDR="198.51.100.30",
            )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(len(mail.outbox), 1)

    def test_registration_over_ip_limit_returns_429(self):
        with throttle_settings(
            auth_register_ip="2/hour",
            auth_register_email="10/hour",
        ):
            responses = [
                self.client.post(
                    reverse("register"),
                    self.registration_data(f"new-{number}@example.com"),
                    format="json",
                    REMOTE_ADDR="198.51.100.31",
                )
                for number in range(3)
            ]

        self.assertEqual(
            [response.status_code for response in responses],
            [
                status.HTTP_202_ACCEPTED,
                status.HTTP_202_ACCEPTED,
                status.HTTP_429_TOO_MANY_REQUESTS,
            ],
        )

    def test_registration_email_limit_uses_normalized_email(self):
        with throttle_settings(
            auth_register_ip="100/hour",
            auth_register_email="1/hour",
        ):
            first = self.client.post(
                reverse("register"),
                self.registration_data("new@example.com"),
                format="json",
                REMOTE_ADDR="198.51.100.32",
            )
            blocked = self.client.post(
                reverse("register"),
                self.registration_data(" NEW@EXAMPLE.COM "),
                format="json",
                REMOTE_ADDR="198.51.100.33",
            )

        self.assertEqual(first.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(blocked.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_verification_email_limit_cannot_be_bypassed_by_another_ip(self):
        PendingRegistration.objects.create(
            email="verify@example.com",
            name="Пользователь",
            password_hash=make_password(self.password),
            code_hash=make_password("123456"),
            sent_at=timezone.now(),
            expires_at=timezone.now() + timedelta(minutes=10),
        )
        with throttle_settings(auth_email_ip="100/hour", auth_email="1/hour"):
            first = self.client.post(
                reverse("verify_email"),
                {"email": "verify@example.com", "code": "000000"},
                format="json",
                REMOTE_ADDR="198.51.100.34",
            )
            blocked = self.client.post(
                reverse("verify_email"),
                {"email": " VERIFY@EXAMPLE.COM ", "code": "000000"},
                format="json",
                REMOTE_ADDR="198.51.100.35",
            )

        self.assertEqual(first.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(blocked.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_request_is_allowed_after_throttle_window_expires(self):
        with (
            throttle_settings(auth_login_ip="1/minute", auth_login_email="100/hour"),
            patch.object(LoginIPThrottle, "timer", side_effect=[1000, 1000, 1061]),
        ):
            first = self.login(password="wrong")
            blocked = self.login(password="wrong")
            after_window = self.login(password="wrong")

        self.assertEqual(first.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(blocked.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(after_window.status_code, status.HTTP_400_BAD_REQUEST)

    def test_database_cache_is_shared_by_independent_backend_instances(self):
        first = DatabaseCache("openpage_cache", settings.CACHES["default"])
        second = DatabaseCache("openpage_cache", settings.CACHES["default"])

        first.set("worker-visible-counter", 1, timeout=60)

        self.assertEqual(second.get("worker-visible-counter"), 1)


class KnowledgeUploadThrottleTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.media_directory = TemporaryDirectory()
        self.addCleanup(self.media_directory.cleanup)
        self.media_override = override_settings(
            MEDIA_ROOT=Path(self.media_directory.name),
        )
        self.media_override.enable()
        self.addCleanup(self.media_override.disable)
        self.user = User.objects.create_user(
            email="uploader@example.com",
            name="Автор",
            password="test-password",
        )
        KnowledgeProfile.objects.create(user=self.user, display_name="Автор")
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def book_data(self):
        return {
            "file": SimpleUploadedFile(
                "book.epub",
                make_epub(),
                content_type="application/epub+zip",
            ),
            "title": "Книга",
            "author": "Автор",
            "format": Book.Format.EPUB,
            "visibility": Book.Visibility.PRIVATE,
        }

    def test_book_upload_over_limit_returns_429(self):
        with throttle_settings(knowledge_book_upload="1/hour"):
            first = self.client.post(
                reverse("knowledge_books"),
                self.book_data(),
                format="multipart",
            )
            blocked = self.client.post(
                reverse("knowledge_books"),
                self.book_data(),
                format="multipart",
            )

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(blocked.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(Book.objects.count(), 1)

    def test_article_image_upload_over_limit_returns_429(self):
        session = ArticleImageUploadSession.objects.create(user=self.user)
        url = reverse(
            "knowledge_article_image_upload",
            kwargs={"session_uuid": session.id},
        )

        def image():
            return SimpleUploadedFile(
                "image.png",
                b"\x89PNG\r\n\x1a\nimage",
                content_type="image/png",
            )

        with throttle_settings(knowledge_article_image_upload="1/hour"):
            first = self.client.post(url, {"image": image()}, format="multipart")
            blocked = self.client.post(url, {"image": image()}, format="multipart")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(blocked.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_book_catalog_get_is_not_counted_as_upload(self):
        with throttle_settings(knowledge_book_upload="1/hour"):
            responses = [self.client.get(reverse("knowledge_books")) for _ in range(3)]

        self.assertEqual(
            [response.status_code for response in responses],
            [status.HTTP_200_OK] * 3,
        )
