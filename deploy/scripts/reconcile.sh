#!/usr/bin/env bash
set -Eeuo pipefail

# Определяем пути и обновляем локальную ветку main.
deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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

reload_caddy() {
    echo "reloading Caddy configuration"
    "${compose[@]}" exec -T gateway \
        caddy reload \
        --config /etc/caddy/Caddyfile \
        --adapter caddyfile
}

# Отдельный Compose-проект для мониторинга.
monitoring_compose=(
    docker compose
    --project-name monitoring
    --env-file "$deploy_dir/.env.prod"
    -f "$deploy_dir/monitoring/compose.yml"
)

# Запоминаем image ID запущенных контейнеров до обновления.
backend_container="$("${compose[@]}" ps -q backend)"
frontend_container="$("${compose[@]}" ps -q frontend)"
gateway_container="$("${compose[@]}" ps -q gateway)"

backend_before=""
frontend_before=""

if [[ -n "$backend_container" ]]; then
    backend_before="$(docker inspect --format '{{.Image}}' "$backend_container")"
fi

if [[ -n "$frontend_container" ]]; then
    frontend_before="$(docker inspect --format '{{.Image}}' "$frontend_container")"
fi

# Загружаем актуальные образы и получаем их новые image ID.
"${compose[@]}" pull backend frontend gateway
backend_after="$(docker image inspect \
    ghcr.io/ratcker/openpage-backend:main \
    --format '{{.Id}}')"
frontend_after="$(docker image inspect \
    ghcr.io/ratcker/openpage-frontend:main \
    --format '{{.Id}}')"

backend_changed=false
frontend_changed=false
config_changed=false
caddy_changed=false
caddy_mount_stale=false
monitoring_changed=false

static_missing=true

if [[ -n "$gateway_container" ]] &&
   docker exec "$gateway_container" \
       test -f /srv/django-static/admin/css/base.css; then
    static_missing=false
fi

# Git может атомарно заменить bind-mounted Caddyfile новым inode. В этом
# случае запущенный контейнер продолжает видеть старую версию файла.
if [[ -n "$gateway_container" ]]; then
    host_caddy_checksum="$(
        sha256sum "$deploy_dir/Caddyfile" | awk '{print $1}'
    )"
    container_caddy_checksum="$(
        docker exec "$gateway_container" \
            sha256sum /etc/caddy/Caddyfile 2>/dev/null |
            awk '{print $1}' || true
    )"

    if [[ "$host_caddy_checksum" != "$container_caddy_checksum" ]]; then
        caddy_mount_stale=true
    fi
fi

# Сравниваем запущенные и загруженные версии образов.
if [[ "$backend_before" != "$backend_after" ]];then
    backend_changed=true
fi
if [[ "$frontend_before" != "$frontend_after" ]]; then
    frontend_changed=true
fi

# Проверяем изменения deployment-конфигурации между ревизиями Git.
if ! git diff --quiet "$old_revision" "$new_revision" -- deploy; then
    config_changed=true
fi
if ! git diff --quiet "$old_revision" "$new_revision" -- deploy/Caddyfile; then
    caddy_changed=true
fi
if ! git diff --quiet "$old_revision" "$new_revision" -- deploy/monitoring; then
    monitoring_changed=true
fi

# Поднимаем остановленные сервисы и перечитываем bind-mounted конфигурацию.
if [[ "$monitoring_changed" == true ]]; then
    "${monitoring_compose[@]}" pull
fi
"${monitoring_compose[@]}" up -d --remove-orphans \
    --wait --wait-timeout 120
"${monitoring_compose[@]}" exec -T prometheus \
    wget -q -O /dev/null --post-data='' http://localhost:9090/-/reload
"${monitoring_compose[@]}" exec -T prometheus \
    wget -q -O /dev/null --post-data='' http://alertmanager:9093/-/reload

# Завершаемся раньше, если обновлять нечего.
if [[ "$backend_changed" == false &&
      "$frontend_changed" == false &&
      "$monitoring_changed" == false &&
      "$static_missing" == false &&
      "$config_changed" == false &&
      "$caddy_changed" == false &&
      "$caddy_mount_stale" == false ]]; then
    reload_caddy
    echo "Production is already up to date."
    exit 0
fi

# Поднимаем БД и применяем миграции новым backend image.
"${compose[@]}" up -d --wait --wait-timeout 120 postgres
if [[ "$backend_changed" == true ]]; then
    echo "applying backend migrations"
    "${compose[@]}" run --rm --no-deps backend \
        python manage.py migrate --noinput
fi
if [[ "$backend_changed" == true || "$static_missing" == true ]]; then
    echo "collecting django static files"
    "${compose[@]}" run --rm --no-deps backend \
        python manage.py collectstatic --noinput
fi

if [[ "$caddy_changed" == true || "$caddy_mount_stale" == true ]]; then
    echo "validating Caddy configuration"
    "${compose[@]}" run --rm --no-deps gateway \
        caddy validate \
        --config /etc/caddy/Caddyfile \
        --adapter caddyfile
fi

# Синхронизируем все сервисы с актуальными image и конфигурацией.
"${compose[@]}" up -d --remove-orphans --wait --wait-timeout 120

if [[ "$caddy_changed" == true || "$caddy_mount_stale" == true ]]; then
    echo "recreating gateway to refresh the Caddyfile bind mount"
    "${compose[@]}" up -d --force-recreate --no-deps \
        --wait --wait-timeout 120 gateway
fi

reload_caddy
"$deploy_dir/scripts/smoke-test.sh"

echo "Production reconciliation completed."
"${compose[@]}" ps
"${monitoring_compose[@]}" ps
