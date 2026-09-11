import uuid
from datetime import date

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


def max_publication_year():
    return date.today().year + 1


# Профиль пользователя внутри Базы знаний
class KnowledgeProfile(models.Model):
    public_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="knowledge_profile",
    )
    display_name = models.CharField(max_length=100, blank=True)
    bio = models.TextField(blank=True)
    avatar = models.CharField(
        max_length=500,
        blank=True,
        help_text="Логический ключ avatar в Knowledge storage.",
    )

    class Meta:
        verbose_name = "knowledge profile"
        verbose_name_plural = "knowledge profiles"

    def __str__(self):
        return self.display_name or self.user.name


# Один объект книги соответствует одному исходному файлу.
class Book(models.Model):
    class Format(models.TextChoices):
        EPUB = "epub", "EPUB"
        PDF = "pdf", "PDF"

    class Visibility(models.TextChoices):
        PUBLIC = "public", "Public"
        PRIVATE = "private", "Private"

    class Status(models.TextChoices):
        PROCESSING = "processing", "Processing"
        READY = "ready", "Ready"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    author = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    language = models.CharField(max_length=16, blank=True)
    year = models.PositiveIntegerField(
        null=True,
        blank=True,
        validators=[MaxValueValidator(max_publication_year)],
    )
    publisher = models.CharField(max_length=255, blank=True)
    format = models.CharField(max_length=4, choices=Format.choices)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="uploaded_books",
    )
    visibility = models.CharField(
        max_length=7,
        choices=Visibility.choices,
        default=Visibility.PRIVATE,
    )
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PROCESSING,
    )
    storage_key = models.CharField(max_length=500, unique=True)
    cover_key = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        verbose_name = "book"
        verbose_name_plural = "books"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(format__in=("epub", "pdf")),
                name="knowledge_book_format_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(visibility__in=("public", "private")),
                name="knowledge_book_visibility_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=("processing", "ready", "failed")),
                name="knowledge_book_status_valid",
            ),
        ]

    def __str__(self):
        return self.title


# Книга в личной библиотеке пользователя
class UserLibraryBook(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="knowledge_library_books",
    )
    book = models.ForeignKey(
        Book,
        on_delete=models.CASCADE,
        related_name="library_entries",
    )
    reading_location = models.JSONField(default=dict, blank=True)
    reading_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    added_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)
        verbose_name = "library book"
        verbose_name_plural = "library books"
        constraints = [
            models.UniqueConstraint(
                fields=("user", "book"),
                name="knowledge_library_user_book_unique",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    reading_percentage__gte=0,
                    reading_percentage__lte=100,
                ),
                name="knowledge_library_percentage_range",
            ),
        ]

    def __str__(self):
        return f"{self.user.email}: {self.book.title}"


# Markdown хранится как исходный текст и обрабатывается только на клиенте.
class Article(models.Model):
    class Visibility(models.TextChoices):
        PUBLIC = "public", "Public"
        PRIVATE = "private", "Private"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    body = models.TextField()
    visibility = models.CharField(
        max_length=7,
        choices=Visibility.choices,
        default=Visibility.PRIVATE,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="knowledge_articles",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        verbose_name = "article"
        verbose_name_plural = "articles"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(visibility__in=("public", "private")),
                name="knowledge_article_visibility_valid",
            )
        ]

    def __str__(self):
        return self.title


# Сессия позволяет загрузить изображения до появления самой статьи.
class ArticleImageUploadSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="knowledge_article_upload_sessions",
    )
    article = models.ForeignKey(
        Article,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="image_upload_sessions",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        verbose_name = "article image upload session"
        verbose_name_plural = "article image upload sessions"

    def __str__(self):
        return str(self.id)


class ArticleImage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    upload_session = models.ForeignKey(
        ArticleImageUploadSession,
        on_delete=models.CASCADE,
        related_name="images",
    )
    storage_key = models.CharField(max_length=500, unique=True)
    content_type = models.CharField(max_length=32)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at",)
        verbose_name = "article image"
        verbose_name_plural = "article images"

    def __str__(self):
        return str(self.id)


class StorageCleanupJob(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    storage_key = models.CharField(max_length=500)
    reason = models.CharField(max_length=100)
    attempts = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("created_at", "id")
        indexes = [
            models.Index(
                fields=("completed_at", "created_at"),
                name="knowledge_cleanup_pending_idx",
            )
        ]
        verbose_name = "storage cleanup job"
        verbose_name_plural = "storage cleanup jobs"

    def __str__(self):
        return self.storage_key
