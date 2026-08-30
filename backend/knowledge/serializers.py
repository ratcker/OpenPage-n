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


class KnowledgeProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = KnowledgeProfile
        fields = ("id", "display_name", "bio", "avatar")
        read_only_fields = fields


class KnowledgeDetailResponseSerializer(serializers.Serializer):
    detail = serializers.CharField(read_only=True)
