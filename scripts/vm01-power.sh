#!/usr/bin/env bash
# VM-01 power (ALL-INFRA-07): mints an Azure token for this one command only
# (scripts/azure-cloud-session.sh) and runs the reviewed Terraform action in
# infrastructure/ecosystem-azure-metadata/power.tf.
#   scripts/vm01-power.sh start|deallocate|restart [extra terraform apply args]
set -euo pipefail
case "${1:-}" in
  start|deallocate|restart) action="$1"; shift ;;
  *) echo "usage: $0 start|deallocate|restart" >&2; exit 2 ;;
esac
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$here/azure-cloud-session.sh" terraform -chdir="$here/../infrastructure/ecosystem-azure-metadata" \
  apply -invoke="action.azapi_resource_action.vm01_$action" "$@"
