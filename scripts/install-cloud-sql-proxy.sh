#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "run as root" >&2
  exit 1
fi

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
version=2.25.4
sha256=b780c0d2c445ffd5d2fdba0925f2722c19fcd0d2c27c538e85713732698561f2
url="https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v${version}/cloud-sql-proxy.linux.amd64"

download=$(mktemp)
trap 'rm -f "$download"' EXIT
curl -fsSL "$url" -o "$download"
printf '%s  %s\n' "$sha256" "$download" | sha256sum -c -
install -o root -g root -m 0755 "$download" /usr/local/bin/cloud-sql-proxy
install -o root -g root -m 0644 \
  "$project_root/systemd/cloud-sql-auth-proxy.service" \
  /etc/systemd/system/cloud-sql-auth-proxy.service
systemctl daemon-reload
systemctl enable --now cloud-sql-auth-proxy.service

/usr/local/bin/cloud-sql-proxy --version
systemctl --no-pager --full status cloud-sql-auth-proxy.service
