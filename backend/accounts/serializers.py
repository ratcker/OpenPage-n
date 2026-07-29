from django.contrib.auth import authenticate
from rest_framework import serializers

from .models import User


# Данные пользователя
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "name", "date_joined", "last_login"]
        read_only_fields = ["id", "date_joined", "last_login"]


# Вход в аккаунт
class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get("request"),
            email=attrs["email"].strip(),
            password=attrs["password"],
        )

        if user is None:
            raise serializers.ValidationError("Неверный email или пароль.")
        if not user.is_active:
            raise serializers.ValidationError("Учетная запись пользователя отключена.")

        attrs["user"] = user
        return attrs
