from datetime import date

from django.conf import settings
from rest_framework import serializers

from .covers import read_cover_image
from .models import Book, KnowledgeProfile, UserLibraryBook
from .storage import get_knowledge_storage


def _validate_cover(value):
    try:
        read_cover_image(value, value.content_type)
    except ValueError as error:
        raise serializers.ValidationError(str(error)) from error
    return value


class OptionalMetadataSerializer(serializers.Serializer):
    language = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=16,
        trim_whitespace=True,
    )
    year = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=0,
        max_value=date.today().year + 1,
    )
    publisher = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=255,
        trim_whitespace=True,
    )


# Публичные metadata книги без данных загрузившего пользователя и storage.
class BookSerializer(serializers.ModelSerializer):
    cover_url = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()

    def get_cover_url(self, book) -> str | None:
        if not book.cover_key:
            return None
        storage = self.context.get("knowledge_storage")
        if storage is None:
            storage = get_knowledge_storage()
        return storage.get_presigned_url(
            book.cover_key,
            settings.KNOWLEDGE_CONTENT_URL_TTL_SECONDS,
        )

    def get_can_edit(self, book) -> bool:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and book.uploaded_by_id == user.id)

    class Meta:
        model = Book
        fields = (
            "id",
            "title",
            "author",
            "description",
            "language",
            "year",
            "publisher",
            "cover_url",
            "can_edit",
            "format",
            "visibility",
            "status",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class BookUploadSerializer(OptionalMetadataSerializer):
    file = serializers.FileField()
    title = serializers.CharField(max_length=255)
    author = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    format = serializers.ChoiceField(choices=Book.Format.choices)
    visibility = serializers.ChoiceField(choices=Book.Visibility.choices)
    cover = serializers.FileField(required=False, validators=[_validate_cover])


class BookUpdateSerializer(OptionalMetadataSerializer):
    title = serializers.CharField(required=False, max_length=255)
    author = serializers.CharField(required=False, max_length=255)
    description = serializers.CharField(required=False, allow_blank=True)
    cover = serializers.FileField(required=False, validators=[_validate_cover])

    immutable_fields = {
        "file",
        "format",
        "visibility",
        "uploaded_by",
        "storage_key",
        "cover_key",
        "status",
    }

    def to_internal_value(self, data):
        forbidden = self.immutable_fields.intersection(data.keys())
        if forbidden:
            raise serializers.ValidationError(
                {field: "Это поле нельзя изменить." for field in sorted(forbidden)}
            )
        return super().to_internal_value(data)


class EpubPreviewUploadSerializer(serializers.Serializer):
    file = serializers.FileField()


class EpubPreviewSerializer(serializers.Serializer):
    title = serializers.CharField(allow_null=True, read_only=True)
    author = serializers.CharField(allow_null=True, read_only=True)
    language = serializers.CharField(allow_null=True, read_only=True)
    publisher = serializers.CharField(allow_null=True, read_only=True)
    year = serializers.IntegerField(allow_null=True, read_only=True)
    cover = serializers.CharField(allow_null=True, read_only=True)


class UserLibraryBookSerializer(serializers.ModelSerializer):
    book = BookSerializer(read_only=True)

    class Meta:
        model = UserLibraryBook
        fields = (
            "id",
            "book",
            "reading_location",
            "reading_percentage",
            "added_at",
            "updated_at",
        )
        read_only_fields = fields


class ReadingProgressSerializer(serializers.Serializer):
    reading_location = serializers.JSONField()
    reading_percentage = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=0,
        max_value=100,
    )

    def validate_reading_location(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Ожидается JSON-объект.")
        return value

    def validate(self, attrs):
        location = attrs["reading_location"]
        book = self.context["book"]
        location_type = location.get("type")

        if location_type is not None:
            if location_type not in Book.Format.values:
                raise serializers.ValidationError(
                    {"reading_location": "Неподдерживаемый тип позиции чтения."}
                )
            if location_type != book.format:
                raise serializers.ValidationError(
                    {"reading_location": "Тип позиции не соответствует формату книги."}
                )

        if book.format == Book.Format.PDF and "page" in location:
            page = location["page"]
            if isinstance(page, bool) or not isinstance(page, int) or page <= 0:
                raise serializers.ValidationError(
                    {
                        "reading_location": "Номер страницы должен быть целым больше нуля."
                    }
                )

        return attrs


class BookContentSerializer(serializers.Serializer):
    url = serializers.URLField(read_only=True)
    expires_in = serializers.IntegerField(read_only=True)


class KnowledgeProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = KnowledgeProfile
        fields = ("id", "display_name", "bio", "avatar")
        read_only_fields = fields


class KnowledgeDetailResponseSerializer(serializers.Serializer):
    detail = serializers.CharField(read_only=True)
