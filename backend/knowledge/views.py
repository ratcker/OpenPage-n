import base64

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.db.utils import IntegrityError
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.generics import GenericAPIView
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .epub import InvalidEpubError, extract_epub_metadata
from .models import Book, KnowledgeProfile, UserLibraryBook
from .pagination import KnowledgePagination
from .serializers import (
    BookContentSerializer,
    BookSerializer,
    BookUpdateSerializer,
    BookUploadSerializer,
    EpubPreviewSerializer,
    EpubPreviewUploadSerializer,
    KnowledgeDetailResponseSerializer,
    KnowledgeProfileSerializer,
    KnowledgeProfileWriteSerializer,
    ReadingProgressSerializer,
    UserLibraryBookSerializer,
)
from .services import (
    create_book,
    create_knowledge_profile,
    delete_knowledge_profile_avatar,
    update_book_metadata,
    update_knowledge_profile,
)
from .storage import get_knowledge_storage

KNOWLEDGE_TAG = "База знаний"
VALIDATION_ERROR_SCHEMA = {
    "type": "object",
    "additionalProperties": {
        "oneOf": [
            {"type": "string"},
            {"type": "array", "items": {"type": "string"}},
        ]
    },
}


class Conflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "conflict"


def _can_access_book(user, book):
    return book.visibility == Book.Visibility.PUBLIC or book.uploaded_by_id == user.id


def _get_or_add_library_book(user, book):
    return UserLibraryBook.objects.get_or_create(user=user, book=book)


class BookListView(GenericAPIView):
    permission_classes = (IsAuthenticated,)
    parser_classes = (MultiPartParser,)
    pagination_class = KnowledgePagination
    serializer_class = BookSerializer

    def get_permissions(self):
        if self.request.method == "GET":
            return (AllowAny(),)
        return super().get_permissions()

    @extend_schema(
        operation_id="knowledge_books_list",
        summary="Получить каталог книг",
        description="Возвращает только публичные книги, новые сверху.",
        tags=[KNOWLEDGE_TAG],
        auth=[],
        responses={200: BookSerializer(many=True)},
    )
    def get(self, request):
        books = Book.objects.filter(
            visibility=Book.Visibility.PUBLIC,
        ).order_by("-created_at", "-id")
        page = self.paginate_queryset(books)
        serializer = BookSerializer(page, many=True, context={"request": request})
        return self.get_paginated_response(serializer.data)

    @extend_schema(
        operation_id="knowledge_books_upload",
        summary="Загрузить книгу",
        description=(
            "Создаёт книгу из multipart-файла и добавляет её в библиотеку текущего "
            "пользователя. Принимает optional metadata и обложку; для EPUB без "
            "ручной обложки пытается сохранить обложку из файла. Требуется профиль "
            "автора материалов."
        ),
        tags=[KNOWLEDGE_TAG],
        request=BookUploadSerializer,
        responses={
            201: OpenApiResponse(
                response=BookSerializer,
                description="Книга сохранена и добавлена в библиотеку.",
                examples=[
                    OpenApiExample(
                        "Загруженная книга",
                        value={
                            "id": "2c9f34e4-d3f1-44d6-ae72-228c87496f3d",
                            "title": "Новая книга",
                            "author": "Автор книги",
                            "description": "Описание",
                            "format": "epub",
                            "visibility": "private",
                            "status": "ready",
                            "created_at": "2026-08-30T12:00:00Z",
                            "updated_at": "2026-08-30T12:00:01Z",
                        },
                        response_only=True,
                    )
                ],
            ),
            400: OpenApiResponse(
                response=VALIDATION_ERROR_SCHEMA,
                description="Поля multipart-запроса не прошли валидацию.",
            ),
            401: OpenApiResponse(
                response=KnowledgeDetailResponseSerializer,
                description="Access-токен отсутствует или недействителен.",
            ),
            403: OpenApiResponse(
                response=KnowledgeDetailResponseSerializer,
                description="У пользователя нет KnowledgeProfile.",
                examples=[
                    OpenApiExample(
                        "Профиль автора отсутствует",
                        value={"detail": "Для загрузки книги нужен профиль автора."},
                        response_only=True,
                    )
                ],
            ),
            415: OpenApiResponse(
                response=KnowledgeDetailResponseSerializer,
                description="Запрос передан не как multipart/form-data.",
            ),
        },
    )
    def post(self, request):
        if not KnowledgeProfile.objects.filter(user=request.user).exists():
            raise PermissionDenied("Для загрузки книги нужен профиль автора.")

        serializer = BookUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            book = create_book(
                user=request.user,
                content=data["file"],
                title=data["title"],
                author=data["author"],
                description=data["description"],
                format=data["format"],
                visibility=data["visibility"],
                language=data.get("language", ""),
                year=data.get("year"),
                publisher=data.get("publisher", ""),
                cover=data.get("cover"),
            )
        except Exception as error:
            raise APIException("Не удалось сохранить книгу.") from error
        return Response(
            BookSerializer(book, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class BookDetailView(GenericAPIView):
    permission_classes = (IsAuthenticated,)
    parser_classes = (MultiPartParser,)
    serializer_class = BookSerializer

    def get_permissions(self):
        if self.request.method == "GET":
            return (AllowAny(),)
        return super().get_permissions()

    @extend_schema(
        operation_id="knowledge_books_retrieve",
        summary="Получить книгу",
        description=(
            "Публичная книга доступна всем пользователям, "
            "приватная — только загрузившему её пользователю."
        ),
        tags=[KNOWLEDGE_TAG],
        auth=[],
        responses={
            200: BookSerializer,
            403: OpenApiResponse(
                response=KnowledgeDetailResponseSerializer,
                description="Чужая приватная книга.",
            ),
            404: OpenApiResponse(
                response=KnowledgeDetailResponseSerializer,
                description="Книга не найдена.",
            ),
        },
    )
    def get(self, request, book_uuid):
        book = get_object_or_404(Book, id=book_uuid)
        if not _can_access_book(request.user, book):
            raise PermissionDenied("Эта приватная книга вам недоступна.")
        return Response(BookSerializer(book, context={"request": request}).data)

    @extend_schema(
        operation_id="knowledge_books_metadata_update",
        summary="Изменить metadata книги",
        description=(
            "Позволяет загрузившему книгу пользователю изменить metadata и заменить "
            "обложку. Формат, видимость, исходный файл и системные поля неизменяемы."
        ),
        tags=[KNOWLEDGE_TAG],
        request=BookUpdateSerializer,
        responses={
            200: BookSerializer,
            400: OpenApiResponse(
                response=VALIDATION_ERROR_SCHEMA,
                description="Metadata или обложка не прошли валидацию.",
            ),
            401: OpenApiResponse(response=KnowledgeDetailResponseSerializer),
            403: OpenApiResponse(
                response=KnowledgeDetailResponseSerializer,
                description="Изменять книгу может только загрузивший её пользователь.",
            ),
            404: OpenApiResponse(
                response=KnowledgeDetailResponseSerializer,
                description="Книга не найдена.",
            ),
        },
    )
    def patch(self, request, book_uuid):
        book = get_object_or_404(Book, id=book_uuid)
        if book.uploaded_by_id != request.user.id:
            raise PermissionDenied("Изменять книгу может только её владелец.")

        serializer = BookUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        storage = get_knowledge_storage()
        try:
            book = update_book_metadata(
                book=book,
                data=serializer.validated_data,
                storage=storage,
            )
        except Exception as error:
            raise APIException("Не удалось обновить metadata книги.") from error
        return Response(
            BookSerializer(
                book,
                context={"request": request, "knowledge_storage": storage},
            ).data
        )


class EpubPreviewView(GenericAPIView):
    permission_classes = (IsAuthenticated,)
    parser_classes = (MultiPartParser,)
    serializer_class = EpubPreviewUploadSerializer

    @extend_schema(
        operation_id="knowledge_books_preview",
        summary="Получить preview metadata EPUB",
        description=(
            "Извлекает основные metadata и обложку из EPUB без создания книги "
            "и без постоянного сохранения файла. Требуется профиль автора."
        ),
        tags=[KNOWLEDGE_TAG],
        request=EpubPreviewUploadSerializer,
        responses={
            200: EpubPreviewSerializer,
            400: OpenApiResponse(
                response=VALIDATION_ERROR_SCHEMA,
                description="Файл не является корректным EPUB.",
            ),
            401: OpenApiResponse(response=KnowledgeDetailResponseSerializer),
            403: OpenApiResponse(
                response=KnowledgeDetailResponseSerializer,
                description="У пользователя нет KnowledgeProfile.",
            ),
        },
    )
    def post(self, request):
        if not KnowledgeProfile.objects.filter(user=request.user).exists():
            raise PermissionDenied("Для preview нужен профиль автора.")

        serializer = EpubPreviewUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            preview = extract_epub_metadata(serializer.validated_data["file"])
        except InvalidEpubError as error:
            raise ValidationError({"file": str(error)}) from error

        cover = None
        if preview.cover:
            encoded = base64.b64encode(preview.cover).decode("ascii")
            cover = f"data:{preview.cover_media_type};base64,{encoded}"
        return Response(
            {
                "title": preview.title,
                "author": preview.author,
                "language": preview.language,
                "publisher": preview.publisher,
                "year": preview.year,
                "cover": cover,
            }
        )


class BookContentView(GenericAPIView):
    permission_classes = (AllowAny,)
    serializer_class = BookContentSerializer

    @extend_schema(
        operation_id="knowledge_books_content_retrieve",
        summary="Получить временный URL книги",
        description=(
            "Возвращает короткоживущий signed URL файла. Публичная книга доступна "
            "анонимно; приватная — только загрузившему её пользователю. При успешном "
            "доступе авторизованного пользователя книга появляется в его библиотеке."
        ),
        tags=[KNOWLEDGE_TAG],
        auth=[],
        responses={
            200: BookContentSerializer,
            403: OpenApiResponse(
                response=KnowledgeDetailResponseSerializer,
                description="Чужая приватная книга.",
            ),
            404: OpenApiResponse(
                response=KnowledgeDetailResponseSerializer,
                description="Книга не найдена.",
            ),
            500: OpenApiResponse(
                response=KnowledgeDetailResponseSerializer,
                description="Не удалось подготовить временный URL.",
            ),
        },
    )
    def get(self, request, book_uuid):
        book = get_object_or_404(Book, id=book_uuid)
        if not _can_access_book(request.user, book):
            raise PermissionDenied("Эта приватная книга вам недоступна.")

        expires_in = settings.KNOWLEDGE_CONTENT_URL_TTL_SECONDS
        try:
            url = get_knowledge_storage().get_presigned_url(
                book.storage_key,
                expires_in,
            )
        except Exception as error:
            raise APIException("Не удалось подготовить файл книги.") from error

        if request.user.is_authenticated:
            _get_or_add_library_book(request.user, book)

        return Response({"url": url, "expires_in": expires_in})


class LibraryListView(GenericAPIView):
    permission_classes = (IsAuthenticated,)
    pagination_class = KnowledgePagination
    serializer_class = UserLibraryBookSerializer

    @extend_schema(
        operation_id="knowledge_library_list",
        summary="Получить личную библиотеку",
        description=(
            "Возвращает публичные и собственные приватные книги текущего "
            "пользователя, новые добавления сверху."
        ),
        tags=[KNOWLEDGE_TAG],
        responses={
            200: UserLibraryBookSerializer(many=True),
            401: OpenApiResponse(response=KnowledgeDetailResponseSerializer),
        },
    )
    def get(self, request):
        entries = (
            UserLibraryBook.objects.filter(user=request.user)
            .filter(
                Q(book__visibility=Book.Visibility.PUBLIC)
                | Q(book__uploaded_by=request.user)
            )
            .select_related("book")
            .order_by("-added_at", "-id")
        )
        page = self.paginate_queryset(entries)
        serializer = UserLibraryBookSerializer(
            page,
            many=True,
            context={"request": request},
        )
        return self.get_paginated_response(serializer.data)


class LibraryAddView(GenericAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = UserLibraryBookSerializer

    @extend_schema(
        operation_id="knowledge_library_add",
        summary="Добавить книгу в библиотеку",
        description=(
            "Идемпотентно добавляет публичную или собственную приватную книгу. "
            "Повторный запрос возвращает существующую связь."
        ),
        tags=[KNOWLEDGE_TAG],
        request=None,
        responses={
            200: OpenApiResponse(
                response=UserLibraryBookSerializer,
                description="Книга уже находилась в библиотеке.",
            ),
            201: OpenApiResponse(
                response=UserLibraryBookSerializer,
                description="Книга добавлена в библиотеку.",
            ),
            401: OpenApiResponse(response=KnowledgeDetailResponseSerializer),
            403: OpenApiResponse(
                response=KnowledgeDetailResponseSerializer,
                description="Чужую приватную книгу добавить нельзя.",
            ),
            404: OpenApiResponse(
                response=KnowledgeDetailResponseSerializer,
                description="Книга не найдена.",
            ),
        },
    )
    def post(self, request, book_uuid):
        book = get_object_or_404(Book, id=book_uuid)
        if not _can_access_book(request.user, book):
            raise PermissionDenied("Эту приватную книгу нельзя добавить.")

        entry, created = _get_or_add_library_book(request.user, book)
        response_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(
            UserLibraryBookSerializer(entry, context={"request": request}).data,
            status=response_status,
        )


class LibraryProgressView(GenericAPIView):
    permission_classes = (IsAuthenticated,)
    parser_classes = (JSONParser,)
    serializer_class = ReadingProgressSerializer

    @extend_schema(
        operation_id="knowledge_library_progress_update",
        summary="Сохранить позицию чтения",
        description=(
            "Сохраняет последнюю позицию и процент чтения для текущего пользователя. "
            "Для доступной книги отсутствующая связь с библиотекой создаётся автоматически; "
            "последняя запись полностью заменяет предыдущий progress."
        ),
        tags=[KNOWLEDGE_TAG],
        request=ReadingProgressSerializer,
        responses={
            200: UserLibraryBookSerializer,
            400: OpenApiResponse(
                response=VALIDATION_ERROR_SCHEMA,
                description="Progress не прошёл валидацию.",
            ),
            401: OpenApiResponse(
                response=KnowledgeDetailResponseSerializer,
                description="Access-токен отсутствует или недействителен.",
            ),
            403: OpenApiResponse(
                response=KnowledgeDetailResponseSerializer,
                description="Чужая приватная книга.",
            ),
            404: OpenApiResponse(
                response=KnowledgeDetailResponseSerializer,
                description="Книга не найдена.",
            ),
        },
    )
    def patch(self, request, book_uuid):
        book = get_object_or_404(Book, id=book_uuid)
        if not _can_access_book(request.user, book):
            raise PermissionDenied("Эта приватная книга вам недоступна.")

        serializer = ReadingProgressSerializer(
            data=request.data,
            context={"book": book},
        )
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            entry, _ = _get_or_add_library_book(request.user, book)
            entry.reading_location = serializer.validated_data["reading_location"]
            entry.reading_percentage = serializer.validated_data["reading_percentage"]
            entry.save(
                update_fields=(
                    "reading_location",
                    "reading_percentage",
                    "updated_at",
                )
            )

        return Response(
            UserLibraryBookSerializer(entry, context={"request": request}).data
        )


class KnowledgeProfileView(GenericAPIView):
    permission_classes = (IsAuthenticated,)
    parser_classes = (MultiPartParser,)
    serializer_class = KnowledgeProfileSerializer

    @extend_schema(
        operation_id="knowledge_profile_retrieve",
        summary="Получить профиль в Базе знаний",
        description="Возвращает только KnowledgeProfile текущего пользователя.",
        tags=[KNOWLEDGE_TAG],
        responses={
            200: KnowledgeProfileSerializer,
            401: OpenApiResponse(response=KnowledgeDetailResponseSerializer),
            404: OpenApiResponse(
                response=KnowledgeDetailResponseSerializer,
                description="KnowledgeProfile отсутствует.",
            ),
        },
    )
    def get(self, request):
        profile = get_object_or_404(KnowledgeProfile, user=request.user)
        storage = get_knowledge_storage()
        return Response(
            KnowledgeProfileSerializer(
                profile,
                context={"knowledge_storage": storage},
            ).data
        )

    @extend_schema(
        operation_id="knowledge_profile_create",
        summary="Создать профиль автора",
        description=(
            "Создаёт KnowledgeProfile текущего пользователя сразу, без moderation. "
            "Повторное создание возвращает 409 Conflict."
        ),
        tags=[KNOWLEDGE_TAG],
        request=KnowledgeProfileWriteSerializer,
        responses={
            201: KnowledgeProfileSerializer,
            400: OpenApiResponse(
                response=VALIDATION_ERROR_SCHEMA,
                description="Поля профиля или avatar не прошли валидацию.",
            ),
            401: OpenApiResponse(response=KnowledgeDetailResponseSerializer),
            409: OpenApiResponse(
                response=KnowledgeDetailResponseSerializer,
                description="KnowledgeProfile уже существует.",
            ),
        },
    )
    def post(self, request):
        if KnowledgeProfile.objects.filter(user=request.user).exists():
            raise Conflict("Профиль автора уже существует.")

        serializer = KnowledgeProfileWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        storage = get_knowledge_storage()
        try:
            profile = create_knowledge_profile(
                user=request.user,
                data=serializer.validated_data,
                storage=storage,
            )
        except IntegrityError as error:
            if KnowledgeProfile.objects.filter(user=request.user).exists():
                raise Conflict("Профиль автора уже существует.") from error
            raise APIException("Не удалось создать профиль автора.") from error
        except Exception as error:
            raise APIException("Не удалось создать профиль автора.") from error

        return Response(
            KnowledgeProfileSerializer(
                profile,
                context={"knowledge_storage": storage},
            ).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        operation_id="knowledge_profile_update",
        summary="Изменить профиль автора",
        description=(
            "Обновляет профиль текущего пользователя. Новый avatar безопасно "
            "заменяет предыдущий объект в Knowledge storage."
        ),
        tags=[KNOWLEDGE_TAG],
        request=KnowledgeProfileWriteSerializer(partial=True),
        responses={
            200: KnowledgeProfileSerializer,
            400: OpenApiResponse(
                response=VALIDATION_ERROR_SCHEMA,
                description="Поля профиля или avatar не прошли валидацию.",
            ),
            401: OpenApiResponse(response=KnowledgeDetailResponseSerializer),
            404: OpenApiResponse(
                response=KnowledgeDetailResponseSerializer,
                description="KnowledgeProfile отсутствует.",
            ),
        },
    )
    def patch(self, request):
        profile = get_object_or_404(KnowledgeProfile, user=request.user)
        serializer = KnowledgeProfileWriteSerializer(
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        storage = get_knowledge_storage()
        try:
            profile = update_knowledge_profile(
                profile=profile,
                data=serializer.validated_data,
                storage=storage,
            )
        except Exception as error:
            raise APIException("Не удалось обновить профиль автора.") from error

        return Response(
            KnowledgeProfileSerializer(
                profile,
                context={"knowledge_storage": storage},
            ).data
        )


class KnowledgeProfileAvatarView(GenericAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = KnowledgeProfileSerializer

    @extend_schema(
        operation_id="knowledge_profile_avatar_delete",
        summary="Удалить avatar профиля автора",
        description=(
            "Удаляет avatar текущего пользователя. Повторный вызов без avatar "
            "возвращает неизменённый профиль."
        ),
        tags=[KNOWLEDGE_TAG],
        request=None,
        responses={
            200: KnowledgeProfileSerializer,
            401: OpenApiResponse(response=KnowledgeDetailResponseSerializer),
            404: OpenApiResponse(
                response=KnowledgeDetailResponseSerializer,
                description="KnowledgeProfile отсутствует.",
            ),
        },
    )
    def delete(self, request):
        profile = get_object_or_404(KnowledgeProfile, user=request.user)
        storage = get_knowledge_storage()
        try:
            profile = delete_knowledge_profile_avatar(
                profile=profile,
                storage=storage,
            )
        except Exception as error:
            raise APIException("Не удалось удалить avatar профиля.") from error

        return Response(
            KnowledgeProfileSerializer(
                profile,
                context={"knowledge_storage": storage},
            ).data
        )


class PublicAuthorView(GenericAPIView):
    permission_classes = (AllowAny,)
    serializer_class = KnowledgeProfileSerializer

    @extend_schema(
        operation_id="knowledge_author_retrieve",
        summary="Получить публичный профиль автора",
        description="Возвращает только публично безопасные поля KnowledgeProfile.",
        tags=[KNOWLEDGE_TAG],
        auth=[],
        responses={
            200: KnowledgeProfileSerializer,
            404: OpenApiResponse(
                response=KnowledgeDetailResponseSerializer,
                description="Профиль автора не найден.",
            ),
        },
    )
    def get(self, request, profile_uuid):
        profile = get_object_or_404(KnowledgeProfile, public_id=profile_uuid)
        storage = get_knowledge_storage()
        return Response(
            KnowledgeProfileSerializer(
                profile,
                context={"knowledge_storage": storage},
            ).data
        )


class PublicAuthorBooksView(GenericAPIView):
    permission_classes = (AllowAny,)
    pagination_class = KnowledgePagination
    serializer_class = BookSerializer

    @extend_schema(
        operation_id="knowledge_author_books_list",
        summary="Получить публичные книги автора",
        description="Возвращает публичные книги автора, новые сверху.",
        tags=[KNOWLEDGE_TAG],
        auth=[],
        responses={
            200: BookSerializer(many=True),
            404: OpenApiResponse(
                response=KnowledgeDetailResponseSerializer,
                description="Профиль автора не найден.",
            ),
        },
    )
    def get(self, request, profile_uuid):
        profile = get_object_or_404(KnowledgeProfile, public_id=profile_uuid)
        books = Book.objects.filter(
            uploaded_by_id=profile.user_id,
            visibility=Book.Visibility.PUBLIC,
        ).order_by("-created_at", "-id")
        page = self.paginate_queryset(books)
        serializer = BookSerializer(page, many=True, context={"request": request})
        return self.get_paginated_response(serializer.data)
