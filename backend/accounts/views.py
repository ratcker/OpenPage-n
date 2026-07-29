from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import LoginSerializer, UserSerializer

User = get_user_model()
REFRESH_COOKIE = "refresh_token"
REFRESH_COOKIE_PATH = "/api/auth"


# Refresh-cookie
def set_refresh_cookie(response, refresh):
    lifetime = settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"]
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=str(refresh),
        max_age=int(lifetime.total_seconds()),
        httponly=True,
        secure=not settings.DEBUG,
        samesite="Lax",
        path=REFRESH_COOKIE_PATH,
    )


def clear_refresh_cookie(response):
    response.delete_cookie(
        REFRESH_COOKIE,
        path=REFRESH_COOKIE_PATH,
        samesite="Lax",
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
