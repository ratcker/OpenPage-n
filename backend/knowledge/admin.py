from django.contrib import admin

from .admin_mixins import StorageCleanupAdminMixin
from .models import (
    Article,
    ArticleImage,
    ArticleImageUploadSession,
    Book,
    KnowledgeProfile,
    StorageCleanupJob,
    UserLibraryBook,
)


# Профили авторов материалов
@admin.register(KnowledgeProfile)
class KnowledgeProfileAdmin(StorageCleanupAdminMixin, admin.ModelAdmin):
    list_display = ("user", "display_name", "public_id")
    search_fields = ("user__email", "user__name", "display_name")
    readonly_fields = ("public_id",)
    raw_id_fields = ("user",)


# Глобальный каталог книг
@admin.register(Book)
class BookAdmin(StorageCleanupAdminMixin, admin.ModelAdmin):
    list_display = (
        "title",
        "author",
        "language",
        "year",
        "format",
        "visibility",
        "status",
        "uploaded_by",
        "created_at",
    )
    list_filter = ("format", "visibility", "status", "language")
    search_fields = (
        "title",
        "author",
        "publisher",
        "storage_key",
        "uploaded_by__email",
    )
    readonly_fields = ("id", "created_at", "updated_at")
    raw_id_fields = ("uploaded_by",)
    ordering = ("-created_at",)


# Личные библиотеки пользователей
@admin.register(UserLibraryBook)
class UserLibraryBookAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "book",
        "reading_percentage",
        "added_at",
        "updated_at",
    )
    search_fields = ("user__email", "book__title")
    readonly_fields = ("added_at", "updated_at")
    raw_id_fields = ("user", "book")
    ordering = ("-updated_at",)


@admin.register(Article)
class ArticleAdmin(StorageCleanupAdminMixin, admin.ModelAdmin):
    list_display = ("title", "visibility", "created_by", "created_at")
    list_filter = ("visibility",)
    search_fields = ("title", "body", "created_by__email")
    readonly_fields = ("id", "created_at", "updated_at")
    raw_id_fields = ("created_by",)
    ordering = ("-created_at",)


@admin.register(ArticleImageUploadSession)
class ArticleImageUploadSessionAdmin(StorageCleanupAdminMixin, admin.ModelAdmin):
    list_display = ("id", "user", "article", "created_at")
    readonly_fields = ("id", "created_at")
    raw_id_fields = ("user", "article")
    ordering = ("-created_at",)


@admin.register(ArticleImage)
class ArticleImageAdmin(StorageCleanupAdminMixin, admin.ModelAdmin):
    list_display = ("id", "upload_session", "content_type", "created_at")
    readonly_fields = ("id", "created_at")
    raw_id_fields = ("upload_session",)
    ordering = ("-created_at",)


@admin.register(StorageCleanupJob)
class StorageCleanupJobAdmin(admin.ModelAdmin):
    list_display = (
        "storage_key",
        "reason",
        "attempts",
        "created_at",
        "completed_at",
    )
    list_filter = ("reason", "completed_at")
    search_fields = ("storage_key", "last_error")
    readonly_fields = (
        "id",
        "storage_key",
        "reason",
        "attempts",
        "last_error",
        "created_at",
        "completed_at",
    )
    ordering = ("-created_at",)
