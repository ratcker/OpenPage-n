#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
backup_script="$(cd "$script_dir/.." && pwd)/backup.sh"
work_dir="$(mktemp -d)"

cleanup() {
    rm -rf -- "$work_dir"
}
trap cleanup EXIT

fake_docker="$work_dir/docker"
cat > "$fake_docker" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

arguments=" $* "
if [[ "$arguments" == *" exec -T postgres pg_restore --list "* ]]; then
    cat >/dev/null
    exit 0
fi
if [[ "$arguments" == *" exec -T postgres sh -c "* ]]; then
    if [[ "${TEST_FAIL_POSTGRES:-0}" == "1" ]]; then
        echo "simulated PostgreSQL failure" >&2
        exit 31
    fi
    printf 'test-postgresql-dump'
    exit 0
fi
if [[ "$arguments" == *" run --rm --no-deps "* ]]; then
    if [[ "${TEST_FAIL_MINIO:-0}" == "1" ]]; then
        echo "simulated MinIO failure" >&2
        exit 32
    fi

    volume=""
    previous=""
    for argument in "$@"; do
        if [[ "$previous" == "--volume" ]]; then
            volume="$argument"
            break
        fi
        previous="$argument"
    done
    destination="${volume%%:*}"
    cp -a "${TEST_MINIO_FIXTURE:?}"/. "$destination/"
    exit 0
fi

echo "unexpected docker invocation: $*" >&2
exit 33
EOF
chmod +x "$fake_docker"

fixture="$work_dir/minio-source"
mkdir -p "$fixture/books" "$fixture/profiles"
printf 'book' > "$fixture/books/example.epub"
printf 'avatar' > "$fixture/profiles/avatar.jpg"

run_backup() {
    local destination="$1"
    shift
    env \
        OPENPAGE_BACKUP_DIR="$destination" \
        OPENPAGE_DOCKER_BIN="$fake_docker" \
        TEST_MINIO_FIXTURE="$fixture" \
        "$@" \
        "$backup_script"
}

assert_empty_backup_dir() {
    local destination="$1"
    if find "$destination" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
        echo "failed backup left a partial generation in $destination" >&2
        exit 1
    fi
}

postgres_failure="$work_dir/postgres-failure"
if run_backup "$postgres_failure" TEST_FAIL_POSTGRES=1; then
    echo "PostgreSQL failure was reported as success" >&2
    exit 1
fi
assert_empty_backup_dir "$postgres_failure"

minio_failure="$work_dir/minio-failure"
if run_backup "$minio_failure" TEST_FAIL_MINIO=1; then
    echo "MinIO failure was reported as success" >&2
    exit 1
fi
assert_empty_backup_dir "$minio_failure"

success="$work_dir/success"
run_backup "$success"
generation="$(find "$success" -mindepth 1 -maxdepth 1 -type d -name '20??-*' -print -quit)"
test -n "$generation"
test -s "$generation/postgres.dump"
test -f "$generation/minio/books/example.epub"
test -f "$generation/minio/profiles/avatar.jpg"
test -s "$generation/SHA256SUMS"
test -s "$generation/manifest.txt"
(
    cd "$generation"
    sha256sum --check SHA256SUMS >/dev/null
)
grep -q '^minio_objects=2$' "$generation/manifest.txt"

empty_fixture="$work_dir/empty-minio-source"
empty_backup="$work_dir/empty-minio"
mkdir "$empty_fixture"
run_backup "$empty_backup" TEST_MINIO_FIXTURE="$empty_fixture"
empty_generation="$(
    find "$empty_backup" -mindepth 1 -maxdepth 1 -type d -name '20??-*' -print -quit
)"
grep -q '^minio_objects=0$' "$empty_generation/manifest.txt"
grep -q '^minio_bytes=0$' "$empty_generation/manifest.txt"

rotation="$work_dir/rotation"
old_generation="$rotation/2020-01-01T00-00-00Z"
active_generation="$rotation/.incomplete-running"
mkdir -p "$old_generation" "$active_generation"
touch -d '10 days ago' "$old_generation"
run_backup "$rotation" BACKUP_RETENTION_DAYS=7
test ! -e "$old_generation"
test -d "$active_generation"
current_count="$(
    find "$rotation" -mindepth 1 -maxdepth 1 -type d -name '20??-*' -print |
        wc -l |
        tr -d ' '
)"
test "$current_count" = "1"

echo "backup script tests passed"
