#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "run as root" >&2
  exit 1
fi

if [ ! -r /etc/os-release ]; then
  echo "Debian 13 is required" >&2
  exit 1
fi
. /etc/os-release
if [ "${ID:-}" != "debian" ] || [ "${VERSION_ID:-}" != "13" ]; then
  echo "Debian 13 is required" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl git jq openssh-client python3 python3-pip python3-venv sqlite3 sudo xz-utils

if ! id mwagent >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /var/lib/mw-integration-agent \
    --shell /usr/sbin/nologin mwagent
fi

install -d -o mwagent -g mwagent -m 0750 /var/lib/mw-integration-agent
install -d -o root -g mwagent -m 0750 /etc/mw-integration-agent

installer="$(mktemp)"
trap 'rm -f "$installer"' EXIT
curl -fsSL https://chatgpt.com/codex/install.sh -o "$installer"
chown mwagent:mwagent "$installer"
sudo -u mwagent -H sh "$installer"

codex_path=/var/lib/mw-integration-agent/.local/bin/codex
if [ ! -x "$codex_path" ]; then
  echo "Codex installer completed but expected executable is missing: $codex_path" >&2
  exit 1
fi

"$codex_path" --version
echo "Host prerequisites installed. No service was enabled or started."
