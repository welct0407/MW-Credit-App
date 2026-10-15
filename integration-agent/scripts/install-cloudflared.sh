#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "run as root" >&2
  exit 1
fi

version=2026.9.1
sha256=03f1f25d1cc93b9ad6c60569d44060bc4f17ed97075760ed8cfca4b12dcd68cc
url="https://github.com/cloudflare/cloudflared/releases/download/${version}/cloudflared-linux-amd64"
download=$(mktemp)
trap 'rm -f "$download"' EXIT

curl -fsSL "$url" -o "$download"
printf '%s  %s\n' "$sha256" "$download" | sha256sum -c -
install -o root -g root -m 0755 "$download" /usr/local/bin/cloudflared
/usr/local/bin/cloudflared --version
