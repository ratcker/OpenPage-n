#!/usr/bin/env bash
set -Eeuo pipefail

deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(dirname "$deploy_dir")"

cd "$repo_dir"

old_revision="$(git rev-parse HEAD)"
git pull --ff-only origin main
new_revision="$(git rev-parse HEAD)"

env_tmp="$(mktemp "$deploy_dir/.env.prod.XXXXXX")" #создание нового файла .env.prod без перезаписывания старого
chmod 600 "$env_tmp"
cleanup() {
    rm -f "$env_tmp"
}
trap cleanup EXIT
#дешифровка секретов из гит
sops decrypt \
    --input-type dotenv \
    --output-type dotenv \
    "$deploy_dir/.env.prod.sops" > "$env_tmp"
mv -f "$env_tmp" "$deploy_dir/.env.prod"
trap - EXIT


compose=(
    docker compose
    --env-file "$deploy_dir/.env.prod"
    -f "$deploy_dir/compose.yml"
)

backend_container="$("${compose[@]}" ps -q backend)"
frontend_container="$("${compose[@]}" ps -q frontend)"

backend_before=""
frontend_before=""

if [[ -n "$backend_container" ]]; then
    backend_before="$(docker inspect --format '{{.Image}}' "$backend_container")"
fi

if [[ -n "$frontend_container" ]]; then
    frontend_before="$(docker inspect --format '{{.Image}}' "$frontend_container")"
fi

"${compose[@]}" pull backend frontend
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

if [[ "$backend_before" != "$backend_after" ]];then
    backend_changed=true
fi
if [[ "$frontend_before" != "$frontend_after" ]]; then
    frontend_changed=true
fi
if ! git diff --quiet "$old_revision" "$new_revision" -- deploy; then
    config_changed=true
fi
if ! git diff --quiet "$old_revision" "$new_revision" -- deploy/Caddyfile; then
    caddy_changed=true
fi

if [[ "$backend_changed" == false && "$frontend_changed" == false && "$config_changed" == false && "$caddy_changed" == false ]]; then
    echo "Production is already up to date."
    exit 0
fi

"${compose[@]}" up -d --wait --wait-timeout 120 postgres
if [[ "$backend_changed" == true ]]; then
    "${compose[@]}" run --rm --no-deps backend \
        python manage.py migrate --noinput
fi

"${compose[@]}" up -d --remove-orphans --wait --wait-timeout 120

if [[ "$caddy_changed" == true ]]; then
    "${compose[@]}" up \
    -d \
    --force-recreate \
    --wait \
    --wait-timeout 120 \
    gateway
fi

echo "Production reconciliation completed."
"${compose[@]}" ps
