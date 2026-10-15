#!/usr/bin/env bash
# Claude Code cloud environment setup for MW Credit development.
# Paste this file's contents into the environment's Setup script (environment
# menu > Edit). It runs as root on Ubuntu 24.04 when the environment cache is
# built (its result is snapshotted for later sessions), and is
# safe to re-run. It serves the single MW-Credit-App repository, checked out at
# /home/user/MW-Credit-App: the PWA/API, SQL and infrastructure at the root,
# project management under project/ and the Debian integration runtime under
# integration-agent/. Versions follow the repository's pins: .nvmrc,
# database/toolchain.json and infrastructure required_version.
set -euo pipefail

NODE_VERSION=24.21.0
FLYWAY_VERSION=13.6.0
FLYWAY_SHA256=7c94a0d27025b9d18d414c90efeb0ac6c3d3cdade82ab41471b3c1c31781331e
POSTGRES_MAJOR=18
TERRAFORM_VERSION=1.16.5
PWSH_VERSION=7.5.4        # Path pinned by Test-MigrationsCloud.py
PSYCOPG_VERSION=3.3.6
PYYAML_VERSION=6.0.2      # project/scripts/dictionary/requirements.txt
PLAYWRIGHT_VERSION=1.63.0 # package-lock.json @playwright/test
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

# PostgreSQL 18 server binaries (PGDG) and the OpenSSH client (database tunnel).
add_apt_repo pgdg https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  "https://apt.postgresql.org/pub/repos/apt noble-pgdg main"
if [ "$apt_repos_changed" = 1 ] || [ ! -x /usr/lib/postgresql/$POSTGRES_MAJOR/bin/initdb ] || ! command -v ssh >/dev/null; then
  apt-get update -qq
  apt-get install -y -qq "postgresql-$POSTGRES_MAJOR" unzip openssh-client >/dev/null
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

# Python PostgreSQL driver for the repository's database scripts (Linux counterpart
# of VM-01's AppSheetLoanTools/python-deps).
if [ ! -d "$SETUP/python-deps/psycopg" ]; then
  python3 -m pip install -q --disable-pip-version-check --target "$SETUP/python-deps" "psycopg[binary]==$PSYCOPG_VERSION"
fi

# Pinned PyYAML for the Data Dictionary helper, at the default package path
# project/scripts/dictionary/runtime.py reads (the image's system PyYAML is older).
DICTIONARY_DEPS=/root/Documents/ChatGPT/AppSheet-Loan-Project/tools/dictionary-python
if ! PYTHONPATH="$DICTIONARY_DEPS" python3 -c "import yaml,sys; sys.exit(yaml.__version__!='$PYYAML_VERSION')" 2>/dev/null; then
  python3 -m pip install -q --disable-pip-version-check --upgrade --target "$DICTIONARY_DEPS" "PyYAML==$PYYAML_VERSION"
fi

# Terraform (pinned to infrastructure required_version).
if ! terraform version 2>/dev/null | grep -q "v$TERRAFORM_VERSION"; then
  curl -fsSL -o "$tmp/terraform.zip" \
    "https://releases.hashicorp.com/terraform/$TERRAFORM_VERSION/terraform_${TERRAFORM_VERSION}_linux_amd64.zip"
  unzip -oq "$tmp/terraform.zip" terraform -d /usr/local/bin
fi

# Node pinned by the repository's .nvmrc, installed beside the system Node.
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

# Chromium build matching the repository's pinned Playwright, beside the image's
# own (older) build in PLAYWRIGHT_BROWSERS_PATH, so `npx playwright test` runs.
# Already-installed builds are skipped, so re-running is cheap.
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx -y "playwright@$PLAYWRIGHT_VERSION" install chromium >/dev/null

# PostgreSQL refuses to run as root, so database checks run as the postgres
# user; let that user read the tools.
chmod -R a+rX "$SETUP"
cat > /usr/local/bin/mw-db-ci <<EOF
#!/usr/bin/env bash
# Run the repository's database CI (scripts/database/Test-CI.ps1) as postgres.
set -euo pipefail
cd "\${1:-\${MW_CREDIT_APP_ROOT:-$WORK/MW-Credit-App}}"
exec runuser -u postgres -- env HOME=/tmp \\
  PATH="$SETUP/node-v$NODE_VERSION-linux-x64/bin:\$PATH" \\
  "$SETUP/powershell-$PWSH_VERSION/pwsh" -NoProfile -File scripts/database/Test-CI.ps1
EOF
chmod 755 /usr/local/bin/mw-db-ci

# SSH to the Debian integration host (vm-mw-credit-agent) through IAP: for
# integration-agent/ deploys (`sudo scripts/update-from-github.sh` in
# /opt/mw-integration-agent-src) and administration. Uses the instance-level
# `codex-cloud` key from Secret Manager and the pinned host key (same as
# scripts/database/debian-host-key.pub).
cat > /usr/local/bin/mw-debian-ssh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
dir="${MW_PRIVATE_ROOT:-$HOME/.mw-private}/ssh"
mkdir -p "$dir"; chmod 700 "$dir"
if [ ! -s "$dir/codex-cloud" ]; then
  (umask 077; gcloud secrets versions access 1 --secret=mw-credit-cloud-operator-ssh-key \
     --project=clever-oasis-508610-n7 > "$dir/codex-cloud")
fi
echo 'vm-mw-credit-agent ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAID4J/lXUyG77dsIwR0MNsrXD11/qdaajYMLz7w26CI8i' > "$dir/known_hosts"
exec ssh -o User=codex-cloud -o IdentityFile="$dir/codex-cloud" -o IdentitiesOnly=yes \
  -o UserKnownHostsFile="$dir/known_hosts" -o StrictHostKeyChecking=yes \
  -o ProxyCommand="gcloud compute start-iap-tunnel vm-mw-credit-agent 22 --listen-on-stdin --zone=asia-southeast1-a --project=clever-oasis-508610-n7 --verbosity=error" \
  vm-mw-credit-agent "$@"
EOF
chmod 755 /usr/local/bin/mw-debian-ssh

# The repository is not cloned here: this script's result is snapshotted and
# reused for about a week, while the repository selected when a session starts
# is cloned fresh (with push access) into /home/user/MW-Credit-App.
# Run `npm ci` at the repository root when a session needs it.
#
# Google Cloud sign-in from GCP_SA_KEY_B64 (the service-account key file,
# base64-encoded on one line; GCP_SA_KEY_JSON with raw JSON is a fallback),
# an environment variable. The key is written per session, outside every
# repository, readable by root only, and never frozen into the snapshot. It is
# also installed as Application Default Credentials for Terraform and the Node
# Google libraries.
#
# The image presets a placeholder CLOUDSDK_AUTH_ACCESS_TOKEN that gcloud uses
# instead of any signed-in account, and Claude's command runner re-applies it
# after shell profiles run. So gcloud, bq and gsutil are wrapped (in
# /root/.local/bin, ahead of /usr/local/bin on PATH) to clear it whenever a key
# is configured; without a key they behave exactly as before.
mkdir -p /usr/local/lib
cat > /usr/local/lib/mw-gcp-auth.sh <<'EOF'
if [ -n "${GCP_SA_KEY_B64:-}${GCP_SA_KEY_JSON:-}" ]; then
  unset CLOUDSDK_AUTH_ACCESS_TOKEN
  mw_key=/root/.config/gcloud/mw-sa-key.json
  export GOOGLE_APPLICATION_CREDENTIALS="$mw_key"
  if [ ! -s "$mw_key" ]; then
    mkdir -p /root/.config/gcloud
    (umask 077
     if [ -n "${GCP_SA_KEY_B64:-}" ]; then printf '%s' "$GCP_SA_KEY_B64" | tr -d ' \r\n' | base64 -d
     else printf '%s' "$GCP_SA_KEY_JSON"; fi > "$mw_key") 2>/dev/null
    if /opt/google-cloud-sdk/bin/gcloud auth activate-service-account --key-file="$mw_key" --quiet >/dev/null 2>&1; then
      /opt/google-cloud-sdk/bin/gcloud config set project clever-oasis-508610-n7 --quiet >/dev/null 2>&1
    else
      echo "mw-credit: the service-account key was not accepted by gcloud" >&2
      rm -f "$mw_key"
    fi
  fi
  mw_adc=/root/.config/gcloud/application_default_credentials.json
  if [ -s "$mw_key" ] && ! cmp -s "$mw_key" "$mw_adc"; then
    (umask 077; cp "$mw_key" "$mw_adc")
  fi
  unset mw_key mw_adc
fi
EOF
mkdir -p /root/.local/bin
for tool in gcloud bq gsutil; do
  printf '#!/usr/bin/env bash\n. /usr/local/lib/mw-gcp-auth.sh\nexec /opt/google-cloud-sdk/bin/%s "$@"\n' "$tool" \
    > "/root/.local/bin/$tool"
  chmod 755 "/root/.local/bin/$tool"
done

# Per-shell profile: locate the repository root for its tooling
# (project/scripts/database_location.py) and prepare the Google sign-in early.
cat > /etc/profile.d/mw-credit.sh <<'EOF'
for d in /home/user/MW-Credit-App /home/user/mw-credit-app; do
  if [ -d "$d/.git" ]; then export MW_CREDIT_APP_ROOT="$d"; break; fi
done
. /usr/local/lib/mw-gcp-auth.sh
EOF
grep -q 'profile.d/mw-credit.sh' /root/.bashrc 2>/dev/null \
  || echo '. /etc/profile.d/mw-credit.sh' >> /root/.bashrc

echo "setup: node $(node --version), $(pwsh --version), $(terraform version | head -1), flyway $FLYWAY_VERSION, postgres $POSTGRES_MAJOR"
