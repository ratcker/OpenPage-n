from django.contrib import admin

from .models import Book, KnowledgeProfile, UserLibraryBook


# Профили авторов материалов
@admin.register(KnowledgeProfile)
class KnowledgeProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "display_name")
    search_fields = ("user__email", "user__name", "display_name")
    raw_id_fields = ("user",)


# Глобальный каталог книг
@admin.register(Book)
class BookAdmin(admin.ModelAdmin):
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
