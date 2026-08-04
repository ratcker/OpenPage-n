from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import User


# Данные пользователя
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "name", "date_joined", "last_login"]
        read_only_fields = ["id", "date_joined", "last_login"]


class AuthSessionSerializer(serializers.Serializer):
    access = serializers.CharField(read_only=True)
    user = UserSerializer(read_only=True)


class DetailResponseSerializer(serializers.Serializer):
    detail = serializers.CharField(read_only=True)


class TokenErrorMessageSerializer(serializers.Serializer):
    token_class = serializers.CharField(read_only=True)
    token_type = serializers.CharField(read_only=True)
    message = serializers.CharField(read_only=True)


class InvalidTokenErrorSerializer(DetailResponseSerializer):
    code = serializers.CharField(read_only=True)
    messages = TokenErrorMessageSerializer(
        many=True,
        read_only=True,
    )


# Регистрация
class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    name = serializers.CharField(max_length=100)
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    password_confirm = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
    )

    def validate_email(self, email):
        email = User.objects.normalize_email(email)
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError(
                "Пользователь с таким email уже существует."
            )
        return email

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError(
                {"password_confirm": "Пароли не совпадают."}
            )

        user = User(email=attrs["email"], name=attrs["name"])
        try:
            validate_password(attrs["password"], user=user)
        except DjangoValidationError as error:
            raise serializers.ValidationError({"password": error.messages})

        return attrs


class RegistrationAcceptedSerializer(serializers.Serializer):
    detail = serializers.CharField(read_only=True)
    email = serializers.EmailField(read_only=True)


# Подтверждение почты
class VerifyEmailSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.RegexField(r"^\d{6}$")

    def validate_email(self, email):
        return User.objects.normalize_email(email)


# Вход в аккаунт
class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get("request"),
            email=User.objects.normalize_email(attrs["email"]),
            password=attrs["password"],
        )

        if user is None:
            raise serializers.ValidationError("Неверный email или пароль.")
        if not user.is_active:
            raise serializers.ValidationError("Учетная запись пользователя отключена.")

        attrs["user"] = user
        return attrs
