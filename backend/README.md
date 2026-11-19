# Backend: локальный запуск

Локальный backend запускается через Docker Compose из корня репозитория. Docker собирает Django-приложение, а Compose также поднимает MinIO — S3-совместимое хранилище, используемое для файлов книг и изображений. В локальной конфигурации Django использует SQLite.

## Требования

- Docker Desktop с Docker Compose v2 (или Docker Engine и Compose v2).
- Свободные порты `8000`, `9000` и `9001`.

## Запуск

Все команды ниже выполняются из корня репозитория — из каталога, где находится `docker-compose.yml`.

1. Создайте локальный `.env` из шаблона:

   ```powershell
   Copy-Item .env.example .env
   ```

   В Bash или WSL используйте `cp .env.example .env`.

2. Откройте `.env` и для локальной проверки переключите отправку почты на вывод в лог:

   ```dotenv
   DJANGO_EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
   ```

   Это позволит проверять регистрацию без настройки SMTP: письмо с кодом подтверждения будет выведено в лог backend.

3. Соберите и запустите backend и MinIO:

   ```sh
   docker compose up -d --build backend minio minio-init
   ```

   При первом запуске Compose скачает образы и соберёт backend. Контейнер backend применит Django-миграции автоматически. Сервис `minio-init` создаст бакет и учётные данные для backend; дождитесь его завершения перед проверкой загрузки файлов. Для `minio-init` ожидаемо состояние `Exited (0)` после успешной инициализации.

4. Проверьте состояние и логи:

   ```sh
   docker compose ps
   docker compose logs -f backend
   ```

   Проверка API: <http://localhost:8000/api/health/> — ожидается ответ `{"status":"ok"}`.

## Адреса и команды

- API: <http://localhost:8000/api/>
- Swagger UI: <http://localhost:8000/api/docs/>
- OpenAPI-схема: <http://localhost:8000/api/schema/>
- Django admin: <http://localhost:8000/admin/>
- MinIO Console: <http://localhost:9001/>. Логин и пароль берутся из `MINIO_ROOT_USER` и `MINIO_ROOT_PASSWORD` в `.env`.

Создать учётную запись администратора Django:

```sh
docker compose exec backend python manage.py createsuperuser
```

Запустить backend-тесты:

```sh
docker compose exec backend python manage.py test
```

Посмотреть письмо с кодом регистрации, отправленное через консольный backend:

```sh
docker compose logs -f backend
```

Остановить сервисы:

```sh
docker compose down
```

Команда `down` сохраняет данные SQLite и MinIO. Чтобы применить изменения в `.env`, пересоздайте сервисы командой `docker compose up -d --build backend minio minio-init`.

## Полный стек с frontend

Чтобы запустить также frontend для ручной проверки в браузере, из корня репозитория выполните:

```sh
docker compose up -d --build
```

Frontend будет доступен по адресу <http://localhost:5173/> и отправит API-запросы backend через настроенный прокси.
