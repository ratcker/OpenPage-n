#!/usr/bin/env bash
set -Eeuo pipefail

# Определяем пути и обновляем локальную ветку main.
deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(dirname "$deploy_dir")"

cd "$repo_dir"

old_revision="$(git rev-parse HEAD)"
git pull --ff-only origin main
new_revision="$(git rev-parse HEAD)"

# Расшифровываем env во временный файл и заменяем его атомарно.
env_tmp="$(mktemp "$deploy_dir/.env.prod.XXXXXX")"
chmod 600 "$env_tmp"
cleanup() {
    rm -f "$env_tmp"
}
trap cleanup EXIT
sops decrypt \
    --input-type dotenv \
    --output-type dotenv \
    "$deploy_dir/.env.prod.sops" > "$env_tmp"
mv -f "$env_tmp" "$deploy_dir/.env.prod"
trap - EXIT

# Переиспользуем одну команду Compose со стабильным env и конфигом.
compose=(
    docker compose
    --env-file "$deploy_dir/.env.prod"
    -f "$deploy_dir/compose.yml"
)

# Запоминаем image ID запущенных контейнеров до обновления.
backend_container="$("${compose[@]}" ps -q backend)"
frontend_container="$("${compose[@]}" ps -q frontend)"
gateway_container="$("${compose[@]}" ps -q gateway)"

backend_before=""
frontend_before=""
gateway_before=""

if [[ -n "$backend_container" ]]; then
    backend_before="$(docker inspect --format '{{.Image}}' "$backend_container")"
fi

if [[ -n "$frontend_container" ]]; then
    frontend_before="$(docker inspect --format '{{.Image}}' "$frontend_container")"
fi

if [[ -n "$gateway_container" ]]; then
    gateway_before="$(docker inspect --format '{{.Image}}' "$gateway_container")"
fi

# Загружаем актуальные образы и получаем их новые image ID.
"${compose[@]}" pull backend frontend gateway
backend_after="$(docker image inspect \
    ghcr.io/ratcker/openpage-backend:main \
    --format '{{.Id}}')"
frontend_after="$(docker image inspect \
    ghcr.io/ratcker/openpage-frontend:main \
    --format '{{.Id}}')"
gateway_after="$(docker image inspect \
    ghcr.io/ratcker/openpage-gateway:main \
    --format '{{.Id}}')"

backend_changed=false
frontend_changed=false
config_changed=false
caddy_changed=false
gateway_changed=false

# Сравниваем запущенные и загруженные версии образов.
if [[ "$backend_before" != "$backend_after" ]];then
    backend_changed=true
fi
if [[ "$frontend_before" != "$frontend_after" ]]; then
    frontend_changed=true
fi
if [[ "$gateway_before" != "$gateway_after" ]]; then
    gateway_changed=true
fi

# Проверяем изменения deployment-конфигурации между ревизиями Git.
if ! git diff --quiet "$old_revision" "$new_revision" -- deploy; then
    config_changed=true
fi
if ! git diff --quiet "$old_revision" "$new_revision" -- deploy/Caddyfile; then
    caddy_changed=true
fi

# Завершаемся раньше, если обновлять нечего.
if [[ "$backend_changed" == false &&
      "$frontend_changed" == false &&
      "$gateway_changed" == false &&
      "$config_changed" == false &&
      "$caddy_changed" == false ]]; then
    echo "Production is already up to date."
    exit 0
fi

# Поднимаем БД и применяем миграции новым backend image.
"${compose[@]}" up -d --wait --wait-timeout 120 postgres
if [[ "$backend_changed" == true ]]; then
    "${compose[@]}" run --rm --no-deps backend \
        python manage.py migrate --noinput
fi

# Синхронизируем все сервисы с актуальными image и конфигурацией.
"${compose[@]}" up -d --remove-orphans --wait --wait-timeout 120
gateway_container_after_up="$("${compose[@]}" ps -q gateway)"

# Изменение bind-mounted Caddyfile требует явного пересоздания gateway.
if [[ "$caddy_changed" == true &&
        "$gateway_container" == "$gateway_container_after_up" ]]; then
    "${compose[@]}" up \
    -d \
    --force-recreate \
    --wait \
    --wait-timeout 120 \
    gateway
fi

echo "Production reconciliation completed."
"${compose[@]}" ps
