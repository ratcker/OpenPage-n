#!/usr/bin/env bash
set -Eeuo pipefail

domain="xn--e1aamodgc0e.xn--p1ai"
base_url="https://${domain}"
target_ip="${SMOKE_TARGET_IP:-127.0.0.1}"
curl_options=(
    --fail
    --silent
    --show-error
    --location
    --max-time 15
    --resolve "${domain}:443:${target_ip}"
)

echo "Checking frontend"
curl "${curl_options[@]}" "${base_url}/" >/dev/null

echo "checking backend"
health="$(
    curl "${curl_options[@]}" \
        -H "Accept: application/json" \
        "${base_url}/api/health/"
)"

if [[ "$health" != *'"status":"ok"'* &&
    "$health" != *'"status": "ok"'* ]]; then
    echo "Unexpected health response: $health" >&2
    exit 1
fi

echo "Checking that public API documentation is hidden"
private_paths=(
    /api/docs/
    /api/schema/
    /api/redoc/
)

for path in "${private_paths[@]}"; do
    status="$(
        curl \
            --silent \
            --show-error \
            --output /dev/null \
            --write-out '%{http_code}' \
            --max-time 15 \
            --resolve "${domain}:443:${target_ip}" \
            "${base_url}${path}"
    )"

    if [[ "$status" != "404" ]]; then
        echo "Expected 404 for ${path}, got ${status}" >&2
        exit 1
    fi
done

echo "Smoke tests passed"
