# R057 infrastructure adoption evidence

Six isolated Terraform roots adopt existing resources while preserving current behavior. The machine-readable [import results](import-results.json) record exact resource IDs, ownership boundaries, saved-plan hashes and refreshed post-import results. The initial ownership check covered nine existing states and 186 managed instances, including R055 Grafana/access and the paused Phase2 operational secret container; none of these imports overlaps those owners.

Each applied batch used an independently reviewed saved plan containing only imports, with zero additions, updates or deletions, followed by an ordinary refreshed no-change plan. This verifies control-plane configuration preservation; no application/DB workload tests, restarts, financial writes or forced notifications were required or performed.

The three narrow lifecycle exceptions preserve existing provider-unrepresentable metadata: SQL API-unset maintenance window, ephemeral gcloud Debian SSH public keys, and disabled/unset IAP firewall logging. Other settings remain checked. Azure VM/alerts use AzAPI to preserve exact current metadata without dummy credentials or replacement. Shared Azure backup vault/policy, IAM grants, secret payloads, database contents, receipt objects, Azure storage accounts and the VM controller remain excluded as recorded in the matrix.

Private plans and diagnostics are retained at C:/Users/ideaadmin/Documents/ChatGPT/MW-Credit-App/terraform/r057-adoption for review on 2026-10-20. They are not publication artifacts. Recovery means correcting Terraform ownership against the versioned protected backend; never deleting or replacing live resources.

A subsequent owner-authorized [Cloudflare tunnel/Tailscale extension](network-extension-access.md) is blocked on administrative access; zero additional imports. This supersedes their earlier out-of-scope classification only, without changing the original45 import evidence.
