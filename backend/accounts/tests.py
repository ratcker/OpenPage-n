from django.conf import settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User


# Авторизация
class AuthenticationTests(APITestCase):
    def setUp(self):
        self.password = "StrongTestPassword123!"
        self.user = User.objects.create_user(
            email="email@example.com",
            name="Тестовый пользователь",
            password=self.password,
        )

    def login(self, password=None):
        password = self.password if password is None else password
        return self.client.post(
            reverse("login"),
            {
                "email": self.user.email,
                "password": password,
            },
            format="json",
        )

    # Вход
    def test_login_returns_access_token_user_and_refresh_cookie(self):
        response = self.login()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertEqual(response.data["user"]["id"], self.user.id)
        self.assertNotIn("refresh", response.data)

        cookie = response.cookies["refresh_token"]
        lifetime = settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["samesite"], "Lax")
        self.assertEqual(cookie["path"], "/api/auth")
        self.assertEqual(int(cookie["max-age"]), int(lifetime.total_seconds()))

    def test_login_rejects_invalid_password(self):
        response = self.login(password="wrong-password")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn("refresh_token", response.cookies)

    # Текущий пользователь
    def test_me_requires_authentication(self):
        response = self.client.get(reverse("me"))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_returns_authenticated_user(self):
        login_response = self.login()
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {login_response.data['access']}"
        )

        response = self.client.get(reverse("me"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], self.user.email)

    # Обновление токена
    def test_refresh_requires_cookie(self):
        response = self.client.post(reverse("token_refresh"))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_rotates_token_and_blacklists_old_token(self):
        login_response = self.login()
        old_refresh = login_response.cookies["refresh_token"].value

        response = self.client.post(reverse("token_refresh"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertEqual(response.data["user"]["id"], self.user.id)
        new_refresh = response.cookies["refresh_token"].value
        self.assertNotEqual(new_refresh, old_refresh)

        self.client.cookies["refresh_token"] = old_refresh
        reused_response = self.client.post(reverse("token_refresh"))

        self.assertEqual(reused_response.status_code, status.HTTP_401_UNAUTHORIZED)
        cookie = reused_response.cookies["refresh_token"]
        self.assertEqual(cookie["max-age"], 0)

    def test_refresh_rejects_inactive_user(self):
        refresh = RefreshToken.for_user(self.user)
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        self.client.cookies["refresh_token"] = str(refresh)

        response = self.client.post(reverse("token_refresh"))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.cookies["refresh_token"]["max-age"], 0)
