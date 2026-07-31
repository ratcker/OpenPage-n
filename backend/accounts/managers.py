from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.hashers import identify_hasher


# Создание пользователей
class UserManager(BaseUserManager):
    @classmethod
    def normalize_email(cls, email):
        email = (email or "").strip()
        return super().normalize_email(email).lower()

    def get_by_natural_key(self, email):
        return self.get(email__iexact=self.normalize_email(email))

    def create_user(self, email, password=None, **extra_fields):
        email = self.normalize_email(email)
        if not email:
            raise ValueError("Email должен быть указан.")

        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user_with_encoded_password(
        self,
        email,
        encoded_password,
        **extra_fields,
    ):
        email = self.normalize_email(email)
        if not email:
            raise ValueError("Email должен быть указан.")

        identify_hasher(encoded_password)
        # create_user() вызвал бы set_password() и повторно захешировал пароль.
        user = self.model(email=email, password=encoded_password, **extra_fields)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Суперпользователь должен иметь is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Суперпользователь должен иметь is_superuser=True.")

        return self.create_user(
            email=email,
            password=password,
            **extra_fields,
        )
