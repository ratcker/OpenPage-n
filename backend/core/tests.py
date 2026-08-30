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
            "/api/health/": {"get": "health_check"},
            "/api/auth/register/": {"post": "auth_register"},
            "/api/auth/verify-email/": {"post": "auth_verify_email"},
            "/api/auth/login/": {"post": "auth_login"},
            "/api/auth/refresh/": {"post": "auth_refresh"},
            "/api/auth/logout/": {"post": "auth_logout"},
            "/api/auth/me/": {"get": "auth_me"},
            "/api/knowledge/books/": {
                "get": "knowledge_books_list",
                "post": "knowledge_books_upload",
            },
            "/api/knowledge/books/{book_uuid}/": {"get": "knowledge_books_retrieve"},
            "/api/knowledge/library/": {"get": "knowledge_library_list"},
            "/api/knowledge/library/{book_uuid}/": {"post": "knowledge_library_add"},
            "/api/knowledge/profile/": {"get": "knowledge_profile_retrieve"},
        }

        operation_ids = []
        for path, expected_methods in expected_operations.items():
            for method, operation_id in expected_methods.items():
                operation = schema["paths"][path][method]
                self.assertEqual(operation["operationId"], operation_id)
                operation_ids.append(operation_id)

        self.assertEqual(set(schema["paths"]), set(expected_operations))
        self.assertEqual(len(operation_ids), len(set(operation_ids)))

    def test_schema_marks_authenticated_operations_as_bearer_protected(self):
        schema = self.schema()
        protected_paths = {
            "/api/auth/me/",
            "/api/knowledge/books/",
            "/api/knowledge/books/{book_uuid}/",
            "/api/knowledge/library/",
            "/api/knowledge/library/{book_uuid}/",
            "/api/knowledge/profile/",
        }

        for path, methods in schema["paths"].items():
            for operation in methods.values():
                if path in protected_paths:
                    self.assertEqual(operation["security"], [{"jwtAuth": []}])
                else:
                    self.assertNotIn("security", operation)

    def test_upload_schema_uses_multipart_file_input(self):
        schema = self.schema()
        upload = schema["paths"]["/api/knowledge/books/"]["post"]
        request_body = upload["requestBody"]["content"]

        self.assertEqual(set(request_body), {"multipart/form-data"})
        component_reference = request_body["multipart/form-data"]["schema"]["$ref"]
        component_name = component_reference.rsplit("/", 1)[-1]
        upload_schema = schema["components"]["schemas"][component_name]
        file_schema = upload_schema["properties"]["file"]

        self.assertEqual(file_schema["type"], "string")
        self.assertEqual(file_schema["format"], "binary")

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
