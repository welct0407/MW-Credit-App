#!/usr/bin/env bash
# Azure sign-in for Linux cloud sessions signed in to GCP as codex-cloud: Terraform
# authenticates as mw-credit-unattended-admin through the federated credential in
# infrastructure/unattended-admin, using a Google ID token (valid one hour).
# Nothing secret is stored; the token file lives outside the repository.
#
#   scripts/azure-cloud-session.sh <command> [args...]  run one command with a fresh token
#   scripts/azure-cloud-session.sh --session-start      SessionStart hook: export ARM_* via $CLAUDE_ENV_FILE
#   scripts/azure-cloud-session.sh --refresh            PreToolUse hook: renew the token file when stale
set -euo pipefail

account=codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com
token_file="${MW_AZURE_TOKEN_FILE:-$HOME/.config/mw-azure/oidc-token}"
metadata="$(dirname "$0")/../infrastructure/unattended-admin/operator.json"

refresh_token() { # $1 = maximum age in minutes before renewal
  if [ -s "$token_file" ] && [ -z "$(find "$token_file" -mmin +"$1" 2>/dev/null)" ]; then return 0; fi
  [ "$(gcloud config get-value account 2>/dev/null)" = "$account" ] || return 1
  mkdir -p "$(dirname "$token_file")" && chmod 700 "$(dirname "$token_file")"
  local tmp; tmp="$(mktemp "$token_file.XXXXXX")"
  if gcloud auth print-identity-token --audiences=api://AzureADTokenExchange >"$tmp" 2>/dev/null && [ -s "$tmp" ]; then
    mv -f "$tmp" "$token_file"
  else
    rm -f "$tmp"; return 1
  fi
}

arm_settings() {
  python3 -c '
import json, sys
m = json.load(open(sys.argv[1]))
for env, key in (("ARM_CLIENT_ID", "azure_client_id"), ("ARM_TENANT_ID", "azure_tenant_id"), ("ARM_SUBSCRIPTION_ID", "azure_subscription_id")):
    print(env + "=" + m[key])' "$metadata"
  printf 'ARM_USE_OIDC=true\nARM_USE_CLI=false\nARM_USE_MSI=false\nARM_OIDC_TOKEN_FILE_PATH=%s\n' "$token_file"
}

case "${1:-}" in
  --session-start|--refresh)
    # Hooks never block a session: outside a codex-cloud cloud session they do nothing.
    [ "${CLAUDE_CODE_REMOTE:-}" = true ] || exit 0
    refresh_token 45 || { echo "Azure sign-in unavailable: could not mint a codex-cloud Google ID token." >&2; exit 0; }
    if [ "$1" = --session-start ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
      arm_settings | sed 's/^/export /' >>"$CLAUDE_ENV_FILE"
    fi
    exit 0 ;;
  "") echo "usage: $0 <command> [args...] | --session-start | --refresh" >&2; exit 2 ;;
esac

refresh_token 0 || { echo "could not mint a Google ID token as $account" >&2; exit 1; }
while IFS= read -r setting; do export "$setting"; done < <(arm_settings)
unset ARM_OIDC_TOKEN ARM_CLIENT_SECRET ARM_CLIENT_CERTIFICATE_PATH ARM_CLIENT_CERTIFICATE_PASSWORD
exec "$@"
