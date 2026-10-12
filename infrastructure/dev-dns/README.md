# DEV DNS stack

This stack owns only dev-lm.mw-credit.com CNAME and its Firebase-supplied ACME TXT record in the verified mw-credit.com zone. The DNS-only CNAME preserves Firebase certificate termination. All other zone records are externally owned and must remain unchanged.

Run scripts/Invoke-DevDns.ps1 -Command init|validate|plan|apply. The runner injects Secret Manager mw-credit-app-dev-cloudflare-dns-token version1 into CLOUDFLARE_API_TOKEN transiently and clears it in finally. Never pass the token as a Terraform variable or store it in a file/state. Token rotation adds a private Secret Manager version and updates the explicit runner pin after verification; do not create account-wide permissions.

State uses the existing protected GCS bucket under development-dns, separate from the Google DEV stack. Plans/data/logs remain in the established private Terraform directory. Inspect each saved plan before apply: only these two records are authorized. Firebase certificate challenge values are public DNS values; refresh from the actual Hosting API if it rotates, never invent them.

Rollback: restore the old private DNS snapshot if a conflicting pre-existing target ever exists. This initial batch found neither target; removing only the two introduced records restores prior DNS while retaining web.app. Never delete the zone or normalize unrelated records. API image/environment recovery is separate and paired as described in docs/Development_Read_Service.md.
