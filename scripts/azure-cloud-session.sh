#!/usr/bin/env bash
# Run a command as the mw-credit-unattended-admin Azure identity from a
# Linux cloud session signed in to GCP as codex-cloud. A fresh Google ID
# token (valid one hour) is exchanged by the Azure providers; nothing is stored.
# Usage: scripts/azure-cloud-session.sh terraform -chdir=infrastructure/<root> plan
set -euo pipefail
[ $# -gt 0 ] || { echo "usage: $0 <command> [args...]" >&2; exit 2; }

metadata="$(dirname "$0")/../infrastructure/unattended-admin/operator.json"
read -r client_id tenant_id subscription_id < <(python3 -c '
import json, sys
m = json.load(open(sys.argv[1]))
print(m["azure_client_id"], m["azure_tenant_id"], m["azure_subscription_id"])' "$metadata")

token="$(gcloud auth print-identity-token --audiences=api://AzureADTokenExchange)"
[ -n "$token" ] || { echo "could not mint a Google ID token" >&2; exit 1; }

export ARM_CLIENT_ID="$client_id" ARM_TENANT_ID="$tenant_id" ARM_SUBSCRIPTION_ID="$subscription_id"
export ARM_USE_OIDC=true ARM_OIDC_TOKEN="$token" ARM_USE_CLI=false ARM_USE_MSI=false
unset ARM_CLIENT_SECRET ARM_CLIENT_CERTIFICATE_PATH ARM_CLIENT_CERTIFICATE_PASSWORD ARM_OIDC_TOKEN_FILE_PATH
exec "$@"
