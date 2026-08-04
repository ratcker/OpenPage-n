import json

from django.contrib.staticfiles import finders
from django.test import SimpleTestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase


class HealthTests(APITestCase):
    def test_health_stays_public_with_invalid_bearer_token(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer broken-token")

        response = self.client.get(reverse("health"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"status": "ok"})


class DocumentationTests(SimpleTestCase):
    def schema(self):
        response = self.client.get(reverse("schema"), {"format": "json"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return json.loads(response.content)

    def test_schema_contains_all_application_operations(self):
        schema = self.schema()
        expected_operations = {
            "/api/health/": ("get", "health_check"),
            "/api/auth/register/": ("post", "auth_register"),
            "/api/auth/verify-email/": ("post", "auth_verify_email"),
            "/api/auth/login/": ("post", "auth_login"),
            "/api/auth/refresh/": ("post", "auth_refresh"),
            "/api/auth/logout/": ("post", "auth_logout"),
            "/api/auth/me/": ("get", "auth_me"),
        }

        operation_ids = []
        for path, (method, operation_id) in expected_operations.items():
            operation = schema["paths"][path][method]
            self.assertEqual(operation["operationId"], operation_id)
            operation_ids.append(operation_id)

        self.assertEqual(set(schema["paths"]), set(expected_operations))
        self.assertEqual(len(operation_ids), len(set(operation_ids)))

    def test_schema_marks_only_me_as_bearer_protected(self):
        schema = self.schema()
        me_operation = schema["paths"]["/api/auth/me/"]["get"]
        self.assertEqual(me_operation["security"], [{"jwtAuth": []}])

        for path, methods in schema["paths"].items():
            for operation in methods.values():
                if path != "/api/auth/me/":
                    self.assertNotIn("security", operation)

        self.assertEqual(
            schema["components"]["securitySchemes"]["jwtAuth"],
            {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"},
        )

    def test_swagger_uses_openpage_template_and_static(self):
        response = self.client.get(reverse("swagger-ui"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertContains(response, "Опенпейч API — документация")
        self.assertContains(response, "openpage-docs-header")
        self.assertContains(response, "/static/openpage/swagger.css")
        self.assertIsNotNone(finders.find("openpage/swagger.css"))
        self.assertIsNotNone(finders.find("openpage/mark.svg"))
