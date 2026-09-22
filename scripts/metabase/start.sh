#!/bin/bash
set -Eeuo pipefail

: "${CSQL_PROXY_INSTANCE_CONNECTION_NAME:?Cloud SQL instance name is required}"
: "${CSQL_PROXY_JSON_CREDENTIALS:?Dedicated Cloud SQL credentials are required}"
: "${MB_ENCRYPTION_SECRET_KEY:?Preserved Metabase encryption key is required}"

proxy_pid=''
metabase_pid=''
cleanup() {
    trap - EXIT TERM INT
    [[ -z "$metabase_pid" ]] || kill -TERM "$metabase_pid" 2>/dev/null || true
    [[ -z "$proxy_pid" ]] || kill -TERM "$proxy_pid" 2>/dev/null || true
    wait || true
}
trap cleanup EXIT
trap 'exit 0' TERM INT

/usr/local/bin/cloud-sql-proxy \
    --address=127.0.0.1 --port=5432 \
    --health-check --http-address=127.0.0.1 --http-port=9090 \
    --structured-logs --run-connection-test &
proxy_pid=$!

ready=false
for ((attempt=0; attempt<60; attempt++)); do
    if ! kill -0 "$proxy_pid" 2>/dev/null; then
        echo 'Cloud SQL proxy exited before readiness.' >&2
        exit 1
    fi
    if curl --silent --fail --max-time 2 http://127.0.0.1:9090/readiness >/dev/null; then
        ready=true
        break
    fi
    sleep 1
done
if [[ "$ready" != true ]]; then
    echo 'Cloud SQL proxy readiness timed out.' >&2
    exit 1
fi

# Metabase needs the PostgreSQL login, not the proxy's service-account key.
env -u CSQL_PROXY_JSON_CREDENTIALS /app/run_metabase.sh "$@" &
metabase_pid=$!

# Restart the container if either component fails; do not leave half a service.
set +e
wait -n "$proxy_pid" "$metabase_pid"
status=$?
set -e
[[ "$status" -ne 0 ]] || status=1
exit "$status"
