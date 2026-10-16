#!/usr/bin/env bash
# Azure sign-in on demand for Linux cloud sessions signed in to GCP as codex-cloud:
# Terraform authenticates as mw-credit-unattended-admin through the federated
# credential in infrastructure/unattended-admin, using a Google ID token (valid one
# hour) minted for this one command. Nothing secret is stored: the token lives in a
# private temporary file that is removed when the command ends. No session hooks.
#
#   scripts/azure-cloud-session.sh <command> [args...]
#   e.g. scripts/azure-cloud-session.sh terraform -chdir=infrastructure/unattended-admin plan
#   VM-01 power: scripts/vm01-power.sh start|deallocate|restart
set -euo pipefail

account=codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com
metadata="$(dirname "$0")/../infrastructure/unattended-admin/operator.json"

[ $# -gt 0 ] || { echo "usage: $0 <command> [args...]" >&2; exit 2; }
[ "$(gcloud config get-value account 2>/dev/null)" = "$account" ] || { echo "gcloud is not signed in as $account" >&2; exit 1; }

token_file="$(mktemp "${TMPDIR:-/tmp}/mw-azure-oidc.XXXXXX")"
trap 'rm -f "$token_file"' EXIT
chmod 600 "$token_file"
gcloud auth print-identity-token --audiences=api://AzureADTokenExchange >"$token_file" 2>/dev/null && [ -s "$token_file" ] \
  || { echo "could not mint a Google ID token as $account" >&2; exit 1; }

while IFS= read -r setting; do export "$setting"; done < <(python3 -c '
import json, sys
m = json.load(open(sys.argv[1]))
for env, key in (("ARM_CLIENT_ID", "azure_client_id"), ("ARM_TENANT_ID", "azure_tenant_id"), ("ARM_SUBSCRIPTION_ID", "azure_subscription_id")):
    print(env + "=" + m[key])' "$metadata")
export ARM_USE_OIDC=true ARM_USE_CLI=false ARM_USE_MSI=false ARM_OIDC_TOKEN_FILE_PATH="$token_file"
unset ARM_OIDC_TOKEN ARM_CLIENT_SECRET ARM_CLIENT_CERTIFICATE_PATH ARM_CLIENT_CERTIFICATE_PASSWORD

status=0
"$@" || status=$?
exit "$status"
