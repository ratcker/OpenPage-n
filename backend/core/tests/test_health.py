from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase


class HealthTests(APITestCase):
    def test_health_stays_public_with_invalid_bearer_token(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer broken-token")

        response = self.client.get(reverse("health"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"status": "ok"})

