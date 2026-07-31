from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models.functions import Lower

from .managers import UserManager


# Пользователь
class User(AbstractUser):
    username = None
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=100)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        verbose_name = "user"
        verbose_name_plural = "users"
        constraints = [
            models.UniqueConstraint(
                Lower("email"),
                name="accounts_user_email_ci_unique",
            )
        ]


# Незавершённая регистрация
class PendingRegistration(models.Model):
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=100)
    password_hash = models.CharField(max_length=128)
    code_hash = models.CharField(max_length=128)
    sent_at = models.DateTimeField()
    expires_at = models.DateTimeField()
    failed_attempts = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = "pending registration"
        verbose_name_plural = "pending registrations"
