#!/usr/bin/env bash
set -Eeuo pipefail

deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="${OPENPAGE_SYSTEMD_SOURCE_DIR:-$deploy_dir/systemd}"
target_dir="${OPENPAGE_SYSTEMD_DIR:-/etc/systemd/system}"
systemctl_bin="${OPENPAGE_SYSTEMCTL_BIN:-/usr/bin/systemctl}"
sudo_bin="${OPENPAGE_SUDO_BIN:-/usr/bin/sudo}"
direct="${OPENPAGE_SYSTEMD_DIRECT:-false}"
mode="${1:---apply}"

if [[ "$mode" != "--check" && "$mode" != "--apply" ]]; then
    echo "Usage: $0 [--check|--apply]" >&2
    exit 2
fi

run_privileged() {
    if [[ "$direct" == true || "$EUID" -eq 0 ]]; then
        "$@"
    else
        "$sudo_bin" -n "$@"
    fi
}

shopt -s nullglob
unit_sources=(
    "$source_dir"/openpage-*.service
    "$source_dir"/openpage-*.timer
)
shopt -u nullglob

if [[ "${#unit_sources[@]}" -eq 0 ]]; then
    echo "No OpenPage systemd units found in $source_dir." >&2
    exit 2
fi

timer_names=()
for source in "${unit_sources[@]}"; do
    name="${source##*/}"
    if [[ "$name" == *.timer ]]; then
        timer_names+=("$name")
    fi
done

check_state() {
    local drift=false
    local source name target timer

    for source in "${unit_sources[@]}"; do
        name="${source##*/}"
        target="$target_dir/$name"
        if [[ ! -f "$target" ]] || ! cmp -s "$source" "$target"; then
            echo "Systemd unit is missing or outdated: $name"
            drift=true
        fi
    done

    for timer in "${timer_names[@]}"; do
        if ! "$systemctl_bin" is-enabled --quiet "$timer"; then
            echo "Systemd timer is not enabled: $timer"
            drift=true
        fi
        if ! "$systemctl_bin" is-active --quiet "$timer"; then
            echo "Systemd timer is not active: $timer"
            drift=true
        fi
    done

    if [[ "$drift" == true ]]; then
        return 1
    fi
}

if [[ "$mode" == "--check" ]]; then
    check_state
    exit 0
fi

run_privileged install -d -m 0755 "$target_dir"

units_changed=false
changed_timers=()
for source in "${unit_sources[@]}"; do
    name="${source##*/}"
    target="$target_dir/$name"
    if [[ ! -f "$target" ]] || ! cmp -s "$source" "$target"; then
        echo "Installing systemd unit: $name"
        run_privileged install -m 0644 "$source" "$target"
        units_changed=true
        if [[ "$name" == *.timer ]]; then
            changed_timers+=("$name")
        fi
    fi
done

if [[ "$units_changed" == true ]]; then
    run_privileged "$systemctl_bin" daemon-reload
fi

for timer in "${timer_names[@]}"; do
    enabled=true
    active=true
    changed=false

    if ! "$systemctl_bin" is-enabled --quiet "$timer"; then
        enabled=false
    fi
    if ! "$systemctl_bin" is-active --quiet "$timer"; then
        active=false
    fi
    for changed_timer in "${changed_timers[@]}"; do
        if [[ "$changed_timer" == "$timer" ]]; then
            changed=true
            break
        fi
    done

    if [[ "$enabled" == false ]]; then
        echo "Enabling systemd timer: $timer"
        run_privileged "$systemctl_bin" enable "$timer"
    fi
    if [[ "$changed" == true && "$active" == true ]]; then
        echo "Restarting updated systemd timer: $timer"
        run_privileged "$systemctl_bin" restart "$timer"
    elif [[ "$active" == false ]]; then
        echo "Starting systemd timer: $timer"
        run_privileged "$systemctl_bin" start "$timer"
    fi
done

if ! check_state; then
    echo "OpenPage systemd reconciliation did not converge." >&2
    exit 1
fi

echo "OpenPage systemd units and timers are up to date."
