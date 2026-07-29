from django.contrib.auth.models import AbstractUser
from django.db import models

from .managers import UserManager


# Пользователь
class User(AbstractUser):
    username = None
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=100)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()
