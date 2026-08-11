#stage requirements
FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app
RUN groupadd --system app && useradd --system --gid app --no-create-home app #создать пользователя, чтобы не запускать приложение от root
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

#stage image - dev-version
FROM base AS development
EXPOSE 8000
CMD ["sh", "-c", "python manage.py migrate && python manage.py runserver 0.0.0.0:8000"]

#stage image - prod-version
FROM base AS production
USER app
EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2"]