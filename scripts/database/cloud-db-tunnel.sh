#!/usr/bin/env bash
# Open (or reuse) the Cloud SQL tunnel for Linux cloud sessions:
#   127.0.0.1:${MW_DB_TUNNEL_PORT:-15432} -> IAP SSH -> vm-mw-credit-agent -> its
#   loopback Cloud SQL Auth Proxy (127.0.0.1:5432) -> appsheet-pg-prod-20260914.
# The session's egress is HTTPS-only and Cloud SQL's authorized networks admit
# only the VM-01 workstation, so the IAP tunnel to the Debian host is the route.
# SSH uses instance-level key `codex-cloud` (private key in Secret Manager
# mw-credit-cloud-operator-ssh-key) and the committed pinned host key.
set -euo pipefail
port="${MW_DB_TUNNEL_PORT:-15432}"
project=clever-oasis-508610-n7
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dir="${MW_PRIVATE_ROOT:-$HOME/.mw-private}/ssh"

if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
  echo "tunnel already listening on 127.0.0.1:$port"; exit 0
fi
mkdir -p "$dir"; chmod 700 "$dir"
if [ ! -s "$dir/codex-cloud" ]; then
  (umask 077; gcloud secrets versions access 1 --secret=mw-credit-cloud-operator-ssh-key \
     --project="$project" > "$dir/codex-cloud")
fi
printf 'vm-mw-credit-agent %s\n' "$(cat "$here/debian-host-key.pub")" > "$dir/known_hosts"
ssh -f -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
  -o User=codex-cloud -o IdentityFile="$dir/codex-cloud" -o IdentitiesOnly=yes \
  -o UserKnownHostsFile="$dir/known_hosts" -o StrictHostKeyChecking=yes \
  -o ProxyCommand="gcloud compute start-iap-tunnel vm-mw-credit-agent 22 --listen-on-stdin --zone=asia-southeast1-a --project=$project --verbosity=error" \
  -L "127.0.0.1:$port:127.0.0.1:5432" vm-mw-credit-agent </dev/null >/dev/null 2>&1
for _ in $(seq 20); do
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then echo "tunnel ready on 127.0.0.1:$port"; exit 0; fi
  sleep 1
done
echo "tunnel did not start" >&2; exit 1
