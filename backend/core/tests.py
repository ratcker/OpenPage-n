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
            "/api/knowledge/books/preview/": {"post": "knowledge_books_preview"},
            "/api/knowledge/books/{book_uuid}/": {
                "get": "knowledge_books_retrieve",
                "patch": "knowledge_books_metadata_update",
            },
            "/api/knowledge/books/{book_uuid}/content/": {
                "get": "knowledge_books_content_retrieve"
            },
            "/api/knowledge/library/": {"get": "knowledge_library_list"},
            "/api/knowledge/library/{book_uuid}/": {"post": "knowledge_library_add"},
            "/api/knowledge/library/{book_uuid}/progress/": {
                "patch": "knowledge_library_progress_update"
            },
            "/api/knowledge/profile/": {
                "get": "knowledge_profile_retrieve",
                "post": "knowledge_profile_create",
                "patch": "knowledge_profile_update",
            },
            "/api/knowledge/profile/avatar/": {
                "delete": "knowledge_profile_avatar_delete"
            },
            "/api/knowledge/authors/{profile_uuid}/": {
                "get": "knowledge_author_retrieve"
            },
            "/api/knowledge/authors/{profile_uuid}/books/": {
                "get": "knowledge_author_books_list"
            },
            "/api/knowledge/articles/": {
                "get": "knowledge_articles_list",
                "post": "knowledge_articles_create",
            },
            "/api/knowledge/articles/{article_uuid}/": {
                "get": "knowledge_articles_retrieve",
                "patch": "knowledge_articles_update",
                "delete": "knowledge_articles_delete",
            },
            "/api/knowledge/articles/upload-sessions/": {
                "post": "knowledge_article_upload_sessions_create"
            },
            "/api/knowledge/articles/upload-sessions/{session_uuid}/images/": {
                "post": "knowledge_article_images_upload"
            },
            "/api/knowledge/article-images/{image_uuid}/": {
                "get": "knowledge_article_images_retrieve"
            },
            "/api/knowledge/authors/{profile_uuid}/articles/": {
                "get": "knowledge_author_articles_list"
            },
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
        protected_operations = {
            ("/api/auth/me/", "get"),
            ("/api/knowledge/books/", "post"),
            ("/api/knowledge/books/preview/", "post"),
            ("/api/knowledge/books/{book_uuid}/", "patch"),
            ("/api/knowledge/library/", "get"),
            ("/api/knowledge/library/{book_uuid}/", "post"),
            ("/api/knowledge/library/{book_uuid}/progress/", "patch"),
            ("/api/knowledge/profile/", "get"),
            ("/api/knowledge/profile/", "post"),
            ("/api/knowledge/profile/", "patch"),
            ("/api/knowledge/profile/avatar/", "delete"),
            ("/api/knowledge/articles/", "post"),
            ("/api/knowledge/articles/{article_uuid}/", "patch"),
            ("/api/knowledge/articles/{article_uuid}/", "delete"),
            ("/api/knowledge/articles/upload-sessions/", "post"),
            (
                "/api/knowledge/articles/upload-sessions/{session_uuid}/images/",
                "post",
            ),
        }

        for path, methods in schema["paths"].items():
            for method, operation in methods.items():
                if (path, method) in protected_operations:
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

    def test_book_schema_exposes_only_computed_edit_permission(self):
        schema = self.schema()
        book = schema["components"]["schemas"]["Book"]

        self.assertEqual(
            book["properties"]["can_edit"],
            {"type": "boolean", "readOnly": True},
        )
        self.assertNotIn("uploaded_by", book["properties"])
        self.assertNotIn("user", book["properties"])
        self.assertNotIn("email", book["properties"])

    def test_profile_schema_uses_multipart_and_hides_avatar_key(self):
        schema = self.schema()
        profile_schema = schema["components"]["schemas"]["KnowledgeProfile"]

        self.assertEqual(
            set(profile_schema["properties"]),
            {"id", "display_name", "bio", "avatar_url"},
        )
        self.assertNotIn("avatar", profile_schema["properties"])
        self.assertNotIn("user", profile_schema["properties"])

        for method in ("post", "patch"):
            operation = schema["paths"]["/api/knowledge/profile/"][method]
            content = operation["requestBody"]["content"]
            self.assertEqual(set(content), {"multipart/form-data"})
            component_reference = content["multipart/form-data"]["schema"]["$ref"]
            component_name = component_reference.rsplit("/", 1)[-1]
            request_schema = schema["components"]["schemas"][component_name]
            self.assertEqual(
                request_schema["properties"]["avatar"],
                {"type": "string", "format": "binary"},
            )

    def test_article_schema_keeps_storage_private(self):
        schema = self.schema()
        article = schema["components"]["schemas"]["Article"]
        image = schema["components"]["schemas"]["ArticleImage"]

        self.assertIn("body", article["properties"])
        self.assertIn("can_edit", article["properties"])
        self.assertNotIn("created_by", article["properties"])
        self.assertEqual(
            set(image["properties"]),
            {"id", "url", "content_type", "created_at"},
        )
        self.assertNotIn("format", image["properties"]["url"])
        self.assertNotIn("storage_key", image["properties"])

        upload = schema["paths"][
            "/api/knowledge/articles/upload-sessions/{session_uuid}/images/"
        ]["post"]
        content = upload["requestBody"]["content"]
        self.assertEqual(set(content), {"multipart/form-data"})

    def test_swagger_uses_openpage_template_and_static(self):
        response = self.client.get(reverse("swagger-ui"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertContains(response, "Опенпейч API — документация")
        self.assertContains(response, "openpage-docs-header")
        self.assertContains(response, "/static/openpage/swagger.css")
        self.assertIsNotNone(finders.find("openpage/swagger.css"))
        self.assertIsNotNone(finders.find("openpage/mark.svg"))
