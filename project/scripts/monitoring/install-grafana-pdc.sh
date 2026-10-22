#!/bin/sh
# R090: install the Grafana Private Data Source Connect agent on the Debian agent VM, so the Cost page's
# PostgreSQL datasource (mw-agent-questions) reaches the Cloud SQL proxy's password listener at
# localhost:5432. Run as root from the repository checkout:
#   printf '%s' "$TOKEN" | sudo sh project/scripts/monitoring/install-grafana-pdc.sh <cluster> <hosted-grafana-id>
# The token (Secret Manager mw-grafana-pdc-token) is read from stdin and written only to the root-only
# environment file. The release archive is pinned by SHA-256. Rollback: systemctl disable --now
# mw-grafana-pdc; remove /etc/systemd/system/mw-grafana-pdc.service, /etc/mw-grafana-pdc, /opt/mw-grafana-pdc.
set -eu
[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }
[ $# -eq 2 ] || { echo "usage: install-grafana-pdc.sh <cluster> <hosted-grafana-id>" >&2; exit 2; }
cluster=$1 hosted=$2
case "$cluster" in *[!a-z0-9-]*|'') echo "invalid cluster" >&2; exit 2;; esac
case "$hosted" in *[!0-9]*|'') echo "invalid hosted Grafana ID" >&2; exit 2;; esac
IFS= read -r token || true
[ -n "$token" ] || { echo "token required on stdin" >&2; exit 2; }

VERSION=v0.0.66
SHA256=10e0bdc6cf373cf5809b1fb77e734d5024d5f62834983c9405058d5bab106878
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
curl -fsSL -o "$work/pdc.tar.gz" "https://github.com/grafana/pdc-agent/releases/download/$VERSION/pdc-agent_Linux_x86_64.tar.gz"
echo "$SHA256  $work/pdc.tar.gz" | sha256sum -c -
tar -xzf "$work/pdc.tar.gz" -C "$work"
install -d -m 0755 /opt/mw-grafana-pdc
install -m 0755 "$work/pdc-agent_Linux_x86_64/pdc" /opt/mw-grafana-pdc/pdc

id mwpdc >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /var/lib/mw-grafana-pdc --shell /usr/sbin/nologin mwpdc
install -d -m 0700 /etc/mw-grafana-pdc
( umask 077
  printf 'GCLOUD_PDC_SIGNING_TOKEN=%s\nGCLOUD_PDC_CLUSTER=%s\nGCLOUD_HOSTED_GRAFANA_ID=%s\n' "$token" "$cluster" "$hosted" > /etc/mw-grafana-pdc/pdc.env )
unset token
install -m 0644 "$here/mw-grafana-pdc.service" /etc/systemd/system/mw-grafana-pdc.service
systemctl daemon-reload
systemctl enable --now mw-grafana-pdc.service
sleep 5
systemctl is-active mw-grafana-pdc.service
