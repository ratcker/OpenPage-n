import logging
import secrets

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, make_password
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import JSONParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .models import PendingRegistration
from .serializers import (
    LoginSerializer,
    RegisterSerializer,
    RegistrationAcceptedSerializer,
    UserSerializer,
    VerifyEmailSerializer,
)

User = get_user_model()
logger = logging.getLogger(__name__)
REFRESH_COOKIE = "refresh_token"
REFRESH_COOKIE_PATH = "/api/auth"
REFRESH_COOKIE_SAMESITE = "Lax"


class EmailDeliveryError(Exception):
    pass


# Письмо с кодом подтверждения
def send_verification_code(email, code):
    lifetime_minutes = int(
        settings.REGISTRATION_CODE_TTL.total_seconds() // 60
    )
    try:
        sent = send_mail(
            subject="Код подтверждения Опенпейч",
            message=(
                f"Ваш код подтверждения Опенпейч: {code}\n\n"
                f"Код действует {lifetime_minutes} минут.\n"
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
        )
    except Exception as error:
        raise EmailDeliveryError from error

    if sent != 1:
        raise EmailDeliveryError


# Refresh-cookie
def set_refresh_cookie(response, refresh):
    lifetime = settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"]
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=str(refresh),
        max_age=int(lifetime.total_seconds()),
        httponly=True,
        secure=not settings.DEBUG,
        samesite=REFRESH_COOKIE_SAMESITE,
        path=REFRESH_COOKIE_PATH,
    )


def clear_refresh_cookie(response):
    response.delete_cookie(
        REFRESH_COOKIE,
        path=REFRESH_COOKIE_PATH,
        samesite=REFRESH_COOKIE_SAMESITE,
    )


# Ответ после входа или обновления токена
def auth_response(user, refresh):
    response = Response(
        {
            "access": str(refresh.access_token),
            "user": UserSerializer(user).data,
        }
    )
    set_refresh_cookie(response, refresh)
    return response


# Текущий пользователь
class MeView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        return Response(UserSerializer(request.user).data)


# Регистрация
class RegisterView(APIView):
    authentication_classes = []
    permission_classes = (AllowAny,)
    parser_classes = (JSONParser,)

    @extend_schema(
        request=RegisterSerializer,
        responses={
            202: RegistrationAcceptedSerializer,
            400: OpenApiResponse(
                description="Ошибка данных или слишком ранняя повторная отправка."
            ),
            503: OpenApiResponse(description="Не удалось отправить письмо."),
        },
    )
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        email = data["email"]
        now = timezone.now()
        code = f"{secrets.randbelow(1_000_000):06d}"

        try:
            with transaction.atomic():
                pending = (
                    PendingRegistration.objects.select_for_update()
                    .filter(email=email)
                    .first()
                )

                if pending and (
                    pending.sent_at
                    > now - settings.REGISTRATION_RESEND_COOLDOWN
                ):
                    raise ValidationError(
                        {
                            "email": (
                                "Код уже отправлен. Запросите новый код "
                                "через 60 секунд."
                            )
                        }
                    )

                if User.objects.filter(email__iexact=email).exists():
                    raise ValidationError(
                        {"email": "Пользователь с таким email уже существует."}
                    )

                if pending is None:
                    pending = PendingRegistration(email=email)

                pending.name = data["name"]
                pending.password_hash = make_password(data["password"])
                pending.code_hash = make_password(code)
                pending.sent_at = now
                pending.expires_at = now + settings.REGISTRATION_CODE_TTL
                pending.failed_attempts = 0
                pending.save()

                # Сбой почты откатит и новую заявку, и обновление старой.
                send_verification_code(email, code)
        except EmailDeliveryError:
            logger.exception("Не удалось отправить код подтверждения регистрации.")
            return Response(
                {
                    "detail": (
                        "Не удалось отправить код подтверждения. "
                        "Попробуйте позже."
                    )
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {
                "detail": "Код подтверждения отправлен на email.",
                "email": email,
            },
            status=status.HTTP_202_ACCEPTED,
        )


# Подтверждение почты
class VerifyEmailView(APIView):
    authentication_classes = []
    permission_classes = (AllowAny,)
    parser_classes = (JSONParser,)

    @extend_schema(
        request=VerifyEmailSerializer,
        responses={
            201: UserSerializer,
            400: OpenApiResponse(
                description=(
                    "Заявка или код недействительны, либо email уже занят."
                )
            ),
        },
    )
    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        code = serializer.validated_data["code"]
        verification_error = None
        user = None

        with transaction.atomic():
            # Одну заявку нельзя одновременно подтвердить двумя запросами.
            pending = (
                PendingRegistration.objects.select_for_update()
                .filter(email=email)
                .first()
            )

            if pending is None:
                raise ValidationError(
                    {
                        "email": (
                            "Заявка на регистрацию не найдена. "
                            "Запросите новый код."
                        )
                    }
                )

            if User.objects.filter(email__iexact=email).exists():
                raise ValidationError(
                    {"email": "Пользователь с таким email уже существует."}
                )

            if pending.expires_at <= timezone.now():
                raise ValidationError(
                    {
                        "code": (
                            "Срок действия кода истёк. Запросите новый код."
                        )
                    }
                )

            if pending.failed_attempts >= settings.REGISTRATION_MAX_ATTEMPTS:
                raise ValidationError(
                    {
                        "code": (
                            "Превышен лимит попыток. Запросите новый код."
                        )
                    }
                )

            if not check_password(code, pending.code_hash):
                pending.failed_attempts += 1
                pending.save(update_fields=["failed_attempts"])
                if pending.failed_attempts >= settings.REGISTRATION_MAX_ATTEMPTS:
                    verification_error = {
                        "code": (
                            "Превышен лимит попыток. Запросите новый код."
                        )
                    }
                else:
                    verification_error = {
                        "code": "Неверный код подтверждения."
                    }
            else:
                try:
                    with transaction.atomic():
                        user = User.objects.create_user_with_encoded_password(
                            email=pending.email,
                            encoded_password=pending.password_hash,
                            name=pending.name,
                        )
                except IntegrityError:
                    verification_error = {
                        "email": (
                            "Пользователь с таким email уже существует."
                        )
                    }
                else:
                    pending.delete()

        if verification_error:
            raise ValidationError(verification_error)

        return Response(
            UserSerializer(user).data,
            status=status.HTTP_201_CREATED,
        )


# Вход в аккаунт
class LoginView(APIView):
    authentication_classes = []
    permission_classes = (AllowAny,)

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        return auth_response(user, RefreshToken.for_user(user))


# Обновление токена
class RefreshView(APIView):
    authentication_classes = []
    permission_classes = (AllowAny,)

    def post(self, request):
        refresh_value = request.COOKIES.get(REFRESH_COOKIE)
        if not refresh_value:
            return Response(
                {"detail": "Refresh-токен отсутствует."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            old_refresh = RefreshToken(refresh_value)
            user = User.objects.get(
                id=old_refresh["user_id"],
                is_active=True,
            )
            old_refresh.blacklist()
        except (TokenError, User.DoesNotExist, KeyError):
            response = Response(
                {"detail": "Refresh-токен недействителен или истёк."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            clear_refresh_cookie(response)
            return response

        return auth_response(user, RefreshToken.for_user(user))


# Выход из аккаунта
class LogoutView(APIView):
    authentication_classes = []
    permission_classes = (AllowAny,)

    def post(self, request):
        refresh_value = request.COOKIES.get(REFRESH_COOKIE)

        if refresh_value:
            try:
                RefreshToken(refresh_value).blacklist()
            except TokenError:
                # Logout остаётся успешным, даже если cookie уже бесполезна.
                pass

        response = Response({"detail": "Вы вышли из аккаунта."})
        clear_refresh_cookie(response)
        return response
