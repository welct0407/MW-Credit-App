#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "run as root" >&2
  exit 1
fi

version=2026.10.3
sha256=053b80b0a23031a038fdbf3c073f59f82b8f1f152aa67971d7383ffafc0dbab0
url="https://github.com/cloudflare/cloudflared/releases/download/${version}/cloudflared-linux-amd64"
download=$(mktemp)
trap 'rm -f "$download"' EXIT

curl -fsSL "$url" -o "$download"
printf '%s  %s\n' "$sha256" "$download" | sha256sum -c -
install -o root -g root -m 0755 "$download" /usr/local/bin/cloudflared
/usr/local/bin/cloudflared --version
