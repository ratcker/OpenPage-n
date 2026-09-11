#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
generation="${1:-}"
confirmation="${2:-}"
docker_bin="${OPENPAGE_DOCKER_BIN:-docker}"

if [[ -z "$generation" || "$confirmation" != "--confirm-restore" ]]; then
    echo "Usage: $0 BACKUP_GENERATION --confirm-restore" >&2
    exit 2
fi
if [[ "${OPENPAGE_RESTORE_CONFIRM:-}" != "restore-local-openpage-backup" ]]; then
    echo "Set OPENPAGE_RESTORE_CONFIRM=restore-local-openpage-backup to continue." >&2
    exit 2
fi

generation="$(cd "$generation" && pwd)"
for required in postgres.dump minio SHA256SUMS manifest.txt; do
    if [[ ! -e "$generation/$required" ]]; then
        echo "Backup generation is incomplete: missing $required" >&2
        exit 1
    fi
done

compose=(
    "$docker_bin" compose
    --env-file "$deploy_dir/.env.prod"
    -f "$deploy_dir/compose.yml"
)

echo "Checking backup integrity"
(
    cd "$generation"
    sha256sum --check SHA256SUMS
)
"${compose[@]}" exec -T postgres \
    pg_restore --list < "$generation/postgres.dump" >/dev/null

echo "Restoring MinIO objects"
"${compose[@]}" run --rm --no-deps \
    --user "$(id -u):$(id -g)" \
    --env MC_CONFIG_DIR=/tmp/mc \
    --volume "$generation/minio:/restore:ro" \
    --entrypoint /bin/sh \
    minio-init \
    -c '
        set -eu
        mc alias set restore-target \
            "$S3_ENDPOINT_URL" \
            "$S3_ACCESS_KEY_ID" \
            "$S3_SECRET_ACCESS_KEY" >/dev/null
        mc mirror --overwrite /restore "restore-target/$S3_BUCKET_NAME"
    '

echo "Restoring PostgreSQL in one transaction"
"${compose[@]}" exec -T postgres \
    sh -c 'pg_restore \
        --username "$POSTGRES_USER" \
        --dbname "$POSTGRES_DB" \
        --clean \
        --if-exists \
        --single-transaction \
        --exit-on-error' \
    < "$generation/postgres.dump"

echo "Restore completed from: $generation"
echo "Run the Knowledge smoke checks before returning the application to users."
