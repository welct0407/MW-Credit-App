# Unattended receipt reliability review — 25 September 2026

Owner requested an end-to-end review and fixes from group scanning through posting, including explicit visibility of anything stuck. Owner directed reuse of existing Grafana/IRM where useful. Baseline: clean 2e34e93a99647029bca093b72272de9046d5436c; installed source a0861cc831192bcd636f42891358d283b5c0dd74. Runtime package/configuration rollback must be captured before deployment. Integration runtime work is separate from AppSheet app/database promotion; monitoring source belongs to AppSheet-Loan-Project (current open release R036).

Confirmed gaps and implementation in progress:

- Unexpected per-group, proposal, reply, execution, result or delivery exceptions could stop later independent work. Isolate items and report aggregate safe failures as a nonzero service exit for the existing monitor.
- A readback outage after Add left POSTING outside result notification processing. Persist UNKNOWN, notify reconciliation, and retain readback-only recovery; never repeat Add.
- Image attempt counts were saved only on handled failure, so interrupted extraction could repeat indefinitely. Persist each attempt before work, bound to three, retain successful extraction across transient downstream failures, and clear it only for explicit reconsideration. Limit extraction to one image per cycle so other actions are not behind ten model calls.
- The master shortcut treated any reference row, including unposted/conflicting Payments, as a completed duplicate. Use only the shared fresh bank-reference guard. Remove repeated full payment-reference scans from master reads.
- A crash after proposal reservation could loop forever when facts later changed. Preserve the immutable proposal and report STALE rather than silently retrying reservation.
- Previously excluded historical internal holds can remain unknown to reviewers. Surface unresolved holds once without reopening financial decisions or posting them.
- Service success alone does not prove pipeline health. Add read-only queue/delivery assessment to the existing independent Grafana collector: aged queues, missing/undelivered reviews, overdue decisions, unknown posting outcomes and failed Partner result delivery. No parallel monitoring daemon or new notification channel.
- Normalize validated transfer time to the owner's minute precision consistently; retain raw image extraction privately. Bound journal SQL/lock waits.

Owner refinement: this task owns worker review/fixes and the [monitoring implementation handover](../docs/MONITORING_IMPLEMENTATION_HANDOVER.md). Another model will configure Grafana. The numeric interface and collector source patch are prepared; no collector installation, dashboard/rule change or new metric export has occurred.

Verification before deployment: full candidate suite on Debian Python 3.13, 242 tests total, 212 passed and 30 separate PostgreSQL-lab tests skipped (lab not configured). The initial isolated test bundle omitted fixture JSON/logo files; repackaging the maintained fixtures resolved those packaging errors. Targeted Windows review/polling/receipt/health tests passed; local PostgreSQL module tests lack psycopg and were covered by the Debian import/suite plus live read-only verification. Diagram IDs/edges and Git whitespace checks pass. No financial production test or historical payment replay.

Documentation: catalogue revision 21, receipt/review/polling operating references and five affected drawio nodes updated; historical generator/PNG limitations labelled. Deployment/rollback and natural-cycle readback remain to be recorded below. Existing owner policies remain: ordinary charges automatic, overpayment by linked approval, closure manual, reference/image/job deduplication, IG-first Partner success notices, no group sends, no browser Instagram access, and no replay of uncertain writes.
