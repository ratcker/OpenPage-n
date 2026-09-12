#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
backup_dir="${OPENPAGE_BACKUP_DIR:-/var/backups/openpage}"
retention_days="${BACKUP_RETENTION_DAYS:-7}"
docker_bin="${OPENPAGE_DOCKER_BIN:-docker}"
compose=(
    "$docker_bin" compose
    --env-file "$deploy_dir/.env.prod"
    -f "$deploy_dir/compose.yml"
)

timestamp="$(date -u +'%Y-%m-%dT%H-%M-%SZ')"
generation="$backup_dir/$timestamp"
generation_tmp="$backup_dir/.incomplete-$timestamp"

cleanup() {
    if [[ -d "$generation_tmp" ]]; then
        rm -rf -- "$generation_tmp"
    fi
}
trap cleanup EXIT

mkdir -p "$backup_dir"
if [[ -e "$generation" || -e "$generation_tmp" ]]; then
    echo "Backup generation already exists: $timestamp" >&2
    exit 1
fi
mkdir "$generation_tmp"
mkdir "$generation_tmp/minio"

echo "Creating PostgreSQL backup"
"${compose[@]}" exec -T postgres \
    sh -c 'pg_dump \
        --username "$POSTGRES_USER" \
        --dbname "$POSTGRES_DB" \
        --format=custom' > "$generation_tmp/postgres.dump"
if [[ ! -s "$generation_tmp/postgres.dump" ]]; then
    echo "PostgreSQL backup is empty." >&2
    exit 1
fi
"${compose[@]}" exec -T postgres \
    pg_restore --list < "$generation_tmp/postgres.dump" >/dev/null

echo "Mirroring MinIO objects"
"${compose[@]}" run --rm --no-deps \
    --user "$(id -u):$(id -g)" \
    --env MC_CONFIG_DIR=/tmp/mc \
    --volume "$generation_tmp/minio:/backup" \
    --entrypoint /bin/sh \
    minio-init \
    -c '
        set -eu
        mc alias set backup-source \
            "$S3_ENDPOINT_URL" \
            "$S3_ACCESS_KEY_ID" \
            "$S3_SECRET_ACCESS_KEY" >/dev/null
        mc mirror --overwrite "backup-source/$S3_BUCKET_NAME" /backup
    '

postgres_bytes="$(stat -c '%s' "$generation_tmp/postgres.dump")"
minio_objects="$(find "$generation_tmp/minio" -type f -printf '.' | wc -c | tr -d ' ')"
minio_bytes="$(
    find "$generation_tmp/minio" -type f -printf '%s\n' |
        awk '{ total += $1 } END { print total + 0 }'
)"

printf '%s\n' \
    "created_at_utc=$timestamp" \
    "postgres_bytes=$postgres_bytes" \
    "minio_objects=$minio_objects" \
    "minio_bytes=$minio_bytes" \
    > "$generation_tmp/manifest.txt"

(
    cd "$generation_tmp"
    sha256sum postgres.dump
    sha256sum manifest.txt
    find minio -type f -print0 | sort -z | xargs -0 -r sha256sum
) > "$generation_tmp/SHA256SUMS"
(
    cd "$generation_tmp"
    sha256sum --check SHA256SUMS >/dev/null
)

mv "$generation_tmp" "$generation"
trap - EXIT

find "$backup_dir" \
    -mindepth 1 \
    -maxdepth 1 \
    -type d \
    -name '20??-??-??T??-??-??Z' \
    ! -path "$generation" \
    -mtime "+$retention_days" \
    -exec rm -rf -- {} +
find "$backup_dir" \
    -mindepth 1 \
    -maxdepth 1 \
    -type f \
    -name 'openpage-*.dump' \
    -mtime "+$retention_days" \
    -delete

echo "Backup completed: $generation"
echo "PostgreSQL: $postgres_bytes bytes"
echo "MinIO: $minio_objects objects, $minio_bytes bytes"
