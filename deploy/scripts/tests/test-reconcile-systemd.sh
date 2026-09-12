#!/usr/bin/env bash
set -Eeuo pipefail

fake_systemctl() {
    local command="$1"
    shift
    local unit="${*: -1}"
    local state_dir="${OPENPAGE_FAKE_SYSTEMD_STATE:?not set}"

    case "$command" in
        is-enabled)
            [[ -f "$state_dir/enabled/$unit" ]]
            ;;
        is-active)
            [[ -f "$state_dir/active/$unit" ]]
            ;;
        enable)
            touch "$state_dir/enabled/$unit"
            ;;
        start | restart)
            touch "$state_dir/active/$unit"
            ;;
        daemon-reload)
            touch "$state_dir/daemon-reloaded"
            ;;
        *)
            echo "Unexpected fake systemctl command: $command" >&2
            return 2
            ;;
    esac
}

case "${1:-}" in
    is-enabled | is-active | enable | start | restart | daemon-reload)
        fake_systemctl "$@"
        exit
        ;;
esac

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
reconcile="$repo_dir/deploy/scripts/reconcile-systemd.sh"
source_dir="$repo_dir/deploy/systemd"
test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT

mkdir -p "$test_root/systemd" "$test_root/state/enabled" "$test_root/state/active"
export OPENPAGE_SYSTEMD_SOURCE_DIR="$source_dir"
export OPENPAGE_SYSTEMD_DIR="$test_root/systemd"
export OPENPAGE_SYSTEMCTL_BIN="$0"
export OPENPAGE_SYSTEMD_DIRECT=true
export OPENPAGE_FAKE_SYSTEMD_STATE="$test_root/state"

if "$reconcile" --check; then
    echo "Initial systemd check unexpectedly succeeded." >&2
    exit 1
elif [[ "$?" -ne 1 ]]; then
    echo "Initial systemd check returned an unexpected status." >&2
    exit 1
fi

"$reconcile" --apply
"$reconcile" --check

for source in "$source_dir"/openpage-*.service "$source_dir"/openpage-*.timer; do
    cmp "$source" "$test_root/systemd/${source##*/}"
done
for timer in "$source_dir"/openpage-*.timer; do
    name="${timer##*/}"
    [[ -f "$test_root/state/enabled/$name" ]]
    [[ -f "$test_root/state/active/$name" ]]
done
[[ -f "$test_root/state/daemon-reloaded" ]]

printf '\n# simulated drift\n' >> "$test_root/systemd/openpage-backup.timer"
rm -f "$test_root/state/active/openpage-storage-cleanup.timer"
"$reconcile" --apply
"$reconcile" --check
cmp \
    "$source_dir/openpage-backup.timer" \
    "$test_root/systemd/openpage-backup.timer"
[[ -f "$test_root/state/active/openpage-storage-cleanup.timer" ]]

echo "systemd reconciliation tests passed"
