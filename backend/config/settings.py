import os
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

# Основные настройки
DEBUG = os.environ.get("DJANGO_DEBUG", "True") == "True"
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured(
            "DJANGO_SECRET_KEY must be set when DJANGO_DEBUG=False."
        )
    SECRET_KEY = "dev-only-secret-key-change-me-before-production"

ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get(
        "DJANGO_ALLOWED_HOSTS",
        "localhost,127.0.0.1",
    ).split(",")
    if host.strip()
]

# Приложения
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "drf_spectacular",
    "core",
    "accounts",
    "rest_framework_simplejwt.token_blacklist",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASE_ENGINE = os.environ.get("DJANGO_DATABASE_ENGINE", "sqlite3")
if DATABASE_ENGINE == "sqlite3":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
elif DATABASE_ENGINE == "postgresql":
    DATABASES = {
           "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ["POSTGRES_DB"],
            "USER": os.environ["POSTGRES_USER"],
            "PASSWORD": os.environ["POSTGRES_PASSWORD"],
            "HOST": os.environ["POSTGRES_HOST"],
            "PORT": os.environ.get("POSTGRES_PORT", "5432"),
        }
    }
else:
    raise ImproperlyConfigured(
        f"Unsupported DJANGO_DATABASE_ENGINE: {DATABASE_ENGINE}"
    )

LANGUAGE_CODE = "ru-ru"
TIME_ZONE = "Europe/Moscow"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "UserAttributeSimilarityValidator"
        ),
        "OPTIONS": {"user_attributes": ("email", "name")},
    },
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "MinimumLengthValidator"
        )
    },
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "CommonPasswordValidator"
        )
    },
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "NumericPasswordValidator"
        )
    },
]

# Email
EMAIL_BACKEND = os.environ.get(
    "DJANGO_EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend",
)
DEFAULT_FROM_EMAIL = os.environ.get(
    "DJANGO_DEFAULT_FROM_EMAIL",
    "Опенпейч <noreply@localhost>",
)
EMAIL_HOST = os.environ.get("DJANGO_EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.environ.get("DJANGO_EMAIL_PORT", "587"))
EMAIL_USE_TLS = os.environ.get("DJANGO_EMAIL_USE_TLS", "True") == "True"
EMAIL_HOST_USER = os.environ.get("DJANGO_EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("DJANGO_EMAIL_HOST_PASSWORD", "")
EMAIL_TIMEOUT = int(os.environ.get("DJANGO_EMAIL_TIMEOUT", "10"))
REGISTRATION_CODE_TTL = timedelta(
    minutes=int(os.environ.get("REGISTRATION_CODE_TTL_MINUTES", "10"))
)
REGISTRATION_RESEND_COOLDOWN = timedelta(seconds=60)
REGISTRATION_MAX_ATTEMPTS = 5

# API
REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    )
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Опенпейч API",
    "DESCRIPTION": (
        "Контракт существующего API платформы Опенпейч. Access-токен передаётся "
        "в заголовке `Authorization: Bearer <access-token>`. Refresh-токен "
        "хранится только в HttpOnly-cookie и не возвращается в JSON."
    ),
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "TAGS": [
        {
            "name": "Авторизация",
            "description": "Регистрация, пользовательская сессия и профиль.",
        },
        {
            "name": "Состояние",
            "description": "Простая проверка доступности процесса API.",
        },
    ],
    "SWAGGER_UI_SETTINGS": {
        "deepLinking": True,
        "displayRequestDuration": True,
        "docExpansion": "list",
        "filter": True,
        "persistAuthorization": False,
    },
    "SWAGGER_UI_FAVICON_HREF": "/static/openpage/mark.svg",
}

# JWT
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
