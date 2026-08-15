#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
backup_dir="${OPENPAGE_BACKUP_DIR:-/var/backups/openpage}"
retention_days="${BACKUP_RETENTION_DAYS:-7}"
compose=(
    docker compose
    --env-file "$deploy_dir/.env.prod"
    -f "$deploy_dir/compose.yml"
)

timestamp="$(date -u +'%Y-%m-%dT%H-%M-%SZ')"
backup="$backup_dir/openpage-$timestamp.dump"
backup_tmp="$backup.tmp"

cleanup() {
    rm -f "$backup_tmp"
}
trap cleanup EXIT

mkdir -p "$backup_dir"
echo "Creating PostgreSQL backup"
"${compose[@]}" exec -T postgres \
    sh -c 'pg_dump \
        --username "$POSTGRES_USER" \
        --dbname "$POSTGRES_DB" \
        --format=custom' > "$backup_tmp"
if [[ ! -s "$backup_tmp" ]]; then
    echo "Backup is empty." >&2
    exit 1
fi

"${compose[@]}" exec -T postgres \
    pg_restore --list < "$backup_tmp" >/dev/null

mv "$backup_tmp" "$backup"
trap - EXIT

find "$backup_dir" \
    -type f \
    -name 'openpage-*.dump' \
    -mtime "+$retention_days" \
    -delete
echo "Backup created: $backup"