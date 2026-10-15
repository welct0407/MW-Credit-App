#!/usr/bin/env bash
# Claude Code cloud environment setup for MW Credit development.
# Paste this file's contents into the environment's Setup script (environment
# menu > Edit). It runs once per new container, as root on Ubuntu 24.04, and is
# safe to re-run. Versions follow MW-Credit-App's pins: .nvmrc,
# database/toolchain.json and infrastructure required_version.
set -euo pipefail

NODE_VERSION=24.21.0
FLYWAY_VERSION=13.6.0
FLYWAY_SHA256=7c94a0d27025b9d18d414c90efeb0ac6c3d3cdade82ab41471b3c1c31781331e
POSTGRES_MAJOR=18
TERRAFORM_VERSION=1.16.5
PWSH_VERSION=7.5.4        # Path pinned by Test-MigrationsCloud.py
SETUP=/workspace/.setup   # Path expected by scripts/database/Test-MigrationsCloud.py
WORK=/home/user

export DEBIAN_FRONTEND=noninteractive
mkdir -p "$SETUP"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

apt_repos_changed=0
add_apt_repo() { # name key-url repo-line
  local keyring=/usr/share/keyrings/$1.gpg
  if [ ! -f "/etc/apt/sources.list.d/$1.list" ]; then
    curl -fsSL "$2" | gpg --dearmor --yes -o "$keyring"
    echo "deb [signed-by=$keyring] $3" > "/etc/apt/sources.list.d/$1.list"
    apt_repos_changed=1
  fi
}

# PostgreSQL 18 server binaries (PGDG).
add_apt_repo pgdg https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  "https://apt.postgresql.org/pub/repos/apt noble-pgdg main"
if [ "$apt_repos_changed" = 1 ] || [ ! -x /usr/lib/postgresql/$POSTGRES_MAJOR/bin/initdb ]; then
  apt-get update -qq
  apt-get install -y -qq "postgresql-$POSTGRES_MAJOR" unzip >/dev/null
fi
# Test-MigrationsCloud.py expects postgresql-18.6/bin under $SETUP.
ln -sfn "/usr/lib/postgresql/$POSTGRES_MAJOR" "$SETUP/postgresql-18.6"

# PowerShell (pinned release tarball).
if [ ! -x "$SETUP/powershell-$PWSH_VERSION/pwsh" ]; then
  curl -fsSL -o "$tmp/pwsh.tgz" \
    "https://github.com/PowerShell/PowerShell/releases/download/v$PWSH_VERSION/powershell-$PWSH_VERSION-linux-x64.tar.gz"
  mkdir -p "$SETUP/powershell-$PWSH_VERSION"
  tar -xzf "$tmp/pwsh.tgz" -C "$SETUP/powershell-$PWSH_VERSION"
  chmod 755 "$SETUP/powershell-$PWSH_VERSION/pwsh"
fi

# Flyway CLI (pinned and checksum-verified, matching database/toolchain.json).
if [ ! -x "$SETUP/flyway-$FLYWAY_VERSION/flyway" ]; then
  curl -fsSL -o "$tmp/flyway.tgz" \
    "https://github.com/flyway/flyway/releases/download/flyway-$FLYWAY_VERSION/flyway-commandline-$FLYWAY_VERSION-linux-x64.tar.gz"
  echo "$FLYWAY_SHA256  $tmp/flyway.tgz" | sha256sum -c - >/dev/null
  tar -xzf "$tmp/flyway.tgz" -C "$SETUP"
fi
ln -sfn "$SETUP/flyway-$FLYWAY_VERSION/flyway" /usr/local/bin/flyway

# Terraform (pinned to infrastructure required_version).
if ! terraform version 2>/dev/null | grep -q "v$TERRAFORM_VERSION"; then
  curl -fsSL -o "$tmp/terraform.zip" \
    "https://releases.hashicorp.com/terraform/$TERRAFORM_VERSION/terraform_${TERRAFORM_VERSION}_linux_amd64.zip"
  unzip -oq "$tmp/terraform.zip" terraform -d /usr/local/bin
fi

# Node pinned by MW-Credit-App/.nvmrc, installed beside the system Node.
if [ ! -x "$SETUP/node-v$NODE_VERSION-linux-x64/bin/node" ]; then
  curl -fsSL -o "$tmp/node.tar.xz" \
    "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz"
  tar -xJf "$tmp/node.tar.xz" -C "$SETUP"
fi
# /root/.local/bin precedes the image's /opt/node22/bin on PATH.
mkdir -p /root/.local/bin
for bin in node npm npx; do
  rm -f "/usr/local/bin/$bin"
  ln -sfn "$SETUP/node-v$NODE_VERSION-linux-x64/bin/$bin" "/root/.local/bin/$bin"
done
ln -sfn "$SETUP/powershell-$PWSH_VERSION/pwsh" /root/.local/bin/pwsh
export PATH="/root/.local/bin:$PATH"
hash -r

# PostgreSQL refuses to run as root, so database checks run as the postgres
# user; let that user read the tools.
chmod -R a+rX "$SETUP"
cat > /usr/local/bin/mw-db-ci <<EOF
#!/usr/bin/env bash
# Run MW-Credit-App's database CI (scripts/database/Test-CI.ps1) as postgres.
set -euo pipefail
cd "\${1:-$WORK/mw-credit-app}"
exec runuser -u postgres -- env HOME=/tmp \\
  PATH="$SETUP/node-v$NODE_VERSION-linux-x64/bin:\$PATH" \\
  "$SETUP/powershell-$PWSH_VERSION/pwsh" -NoProfile -File scripts/database/Test-CI.ps1
EOF
chmod 755 /usr/local/bin/mw-db-ci

# Sibling repositories. They must also be attached to the session (add_repo)
# before pushing; a missing clone is skipped, not fatal.
for repo in mw-credit-app mw-integration-agent; do
  if [ ! -d "$WORK/$repo/.git" ]; then
    git clone --depth 1 "https://github.com/welct0407/$repo" "$WORK/$repo" \
      || echo "setup: could not clone $repo; attach it in the session" >&2
  fi
done
# This repo's tooling (scripts/database_location.py) expects ../MW-Credit-App.
[ -e "$WORK/MW-Credit-App" ] || ln -s mw-credit-app "$WORK/MW-Credit-App"
if [ -f "$WORK/mw-credit-app/package-lock.json" ]; then
  (cd "$WORK/mw-credit-app" && npm ci --no-audit --no-fund >/dev/null)
fi

# Google Cloud: a service-account key stored in the environment as
# GCP_SA_KEY_JSON (the JSON text) signs gcloud in for the DEV project.
if [ -n "${GCP_SA_KEY_JSON:-}" ]; then
  # Kept outside every repository, readable by root only; also used as
  # Application Default Credentials by the Node Google client libraries.
  key=/root/.config/gcloud/mw-sa-key.json
  mkdir -p "$(dirname "$key")"
  (umask 077; printf '%s' "$GCP_SA_KEY_JSON" > "$key")
  unset CLOUDSDK_AUTH_ACCESS_TOKEN
  gcloud auth activate-service-account --key-file="$key" --quiet \
    || echo "setup: GCP_SA_KEY_JSON was not accepted by gcloud" >&2
  gcloud config set project clever-oasis-508610-n7 --quiet
  # The image presets a placeholder CLOUDSDK_AUTH_ACCESS_TOKEN that gcloud would
  # use instead of the activated account; clear it in new shells.
  if ! grep -q 'mw-sa-key.json' /root/.bashrc 2>/dev/null; then
    printf '%s\n' 'unset CLOUDSDK_AUTH_ACCESS_TOKEN' \
      "export GOOGLE_APPLICATION_CREDENTIALS=$key" >> /root/.bashrc
  fi
fi

echo "setup: node $(node --version), $(pwsh --version), $(terraform version | head -1), flyway $FLYWAY_VERSION, postgres $POSTGRES_MAJOR"
