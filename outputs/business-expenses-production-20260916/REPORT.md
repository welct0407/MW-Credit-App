# Business expenses and referral rebates — production release

16 September 2026. Owner authorized promotion after accepting the DEV implementation and the later deck/dashboard refinements.

Before release: production V14 / OLTP 3.000108 / OLAP 1.100090. The normalized production schema matched the reviewed DEV V14 checkpoint. Fresh private backup SHA-256: `756FCA2BAF1FD17A8EC2F1F3F6E8CEB95CD05F2CC10C774BC91E2837E44D1D60`. A disposable restore matched all 14 business-table fingerprints and normalized schema.

Production promotion completed at **Flyway V16 / OLTP 3.000117 / OLAP 1.100098**. Flyway validated all 17 migrations. The 43 rebuilt Daily Analytics dates had zero mismatches for expenses, net profit and net unsettled profit. Production contained zero Business Expenses rows, which confirms that the release did not backfill historical referral rebates.

OLTP now exposes the consolidated expense ledger as the configured deck, with bilingual categories and red/green amount formatting. Its dashboard shows Total Net Profit and an Income Statement MTD section after Outstanding Loans. OLAP consumes the ledger read only, shows the same dashboard section, keeps the Cash Pool section concise and preserves the existing Partner card format while sourcing Total Profit and Available to Settle from net partner values. Settlement entry is capped at Net Available to Settle.

The latest SQL audit during the release reported partner A gross/net 65,447 and settlements 30,960, and partner B gross/net 127,854 and settlements 84,510. These values can continue changing with live payments. Gross equals net at this checkpoint only because the expense ledger is empty; future allocated expenses reduce partner net profit and available-to-settle values.

No production financial fixture, loan close, notification or Looker Studio change was made. Automatic referral and historical-allocation behavior were accepted in DEV and validated structurally in production. The production acceptance output is in `production-acceptance.txt`.

Rollback requires coordinated restoration of OLTP 3.000108, OLAP 1.100090 and the private pre-release dump when SQL rollback is required. Prefer a reviewed higher Flyway forward fix after new production writes. The dump path and checksum are recorded above; credentials and the dump remain outside Git.
