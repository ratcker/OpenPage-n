from django.core.exceptions import ObjectDoesNotExist
from django.urls import reverse
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .article_services import upload_session_expires_at
from .covers import read_image
from .models import Article, ArticleImage, ArticleImageUploadSession
from .serializers import KnowledgeProfileSerializer


def _validate_article_image(value):
    try:
        read_image(
            value,
            getattr(value, "content_type", None),
            subject="Изображение статьи",
        )
    except ValueError as error:
        raise serializers.ValidationError(str(error)) from error
    return value


class ArticleSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()

    def get_author(self, article) -> dict | None:
        try:
            profile = article.created_by.knowledge_profile
        except ObjectDoesNotExist:
            return None
        return KnowledgeProfileSerializer(profile, context=self.context).data

    def get_can_edit(self, article) -> bool:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and article.created_by_id == user.id)

    class Meta:
        model = Article
        fields = (
            "id",
            "title",
            "body",
            "visibility",
            "author",
            "can_edit",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class ArticleWriteSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255, trim_whitespace=True)
    body = serializers.CharField(trim_whitespace=False)
    visibility = serializers.ChoiceField(
        choices=Article.Visibility.choices,
        required=False,
    )
    upload_session_id = serializers.UUIDField(required=False)


class ArticleUploadSessionSerializer(serializers.ModelSerializer):
    expires_at = serializers.SerializerMethodField()

    @extend_schema_field(serializers.DateTimeField())
    def get_expires_at(self, session):
        return upload_session_expires_at(session)

    class Meta:
        model = ArticleImageUploadSession
        fields = ("id", "expires_at")
        read_only_fields = fields


class ArticleImageUploadSerializer(serializers.Serializer):
    image = serializers.FileField(validators=[_validate_article_image])


class ArticleImageSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField())
    def get_url(self, image) -> str:
        return reverse("knowledge_article_image", kwargs={"image_uuid": image.id})

    class Meta:
        model = ArticleImage
        fields = ("id", "url", "content_type", "created_at")
        read_only_fields = fields
