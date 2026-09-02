from rest_framework import serializers

from .models import Book, KnowledgeProfile, UserLibraryBook


# Публичные metadata книги без данных загрузившего пользователя и storage.
class BookSerializer(serializers.ModelSerializer):
    class Meta:
        model = Book
        fields = (
            "id",
            "title",
            "author",
            "description",
            "format",
            "visibility",
            "status",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class BookUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    title = serializers.CharField(max_length=255)
    author = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    format = serializers.ChoiceField(choices=Book.Format.choices)
    visibility = serializers.ChoiceField(choices=Book.Visibility.choices)


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
