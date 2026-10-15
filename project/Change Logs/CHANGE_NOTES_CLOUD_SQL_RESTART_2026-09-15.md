# Cloud SQL connection recovery — 15 September 2026

Owner explicitly requested a reboot after recurring PostgreSQL 53300 connection exhaustion. Restart submitted in Google Cloud console at 10:12:39 Bangkok for appsheet-pg-prod-20260914, project clever-oasis-508610-n7. The console confirms Instance is being restarted.

Scope: restart only. No database flags, machine size, credentials, network access, schema or app version changed. Existing automated backups and point-in-time recovery were shown enabled before restart. No data restoration or backup replay is involved. Restart terminates connections and interrupts running operations; committed data persists. There is no separate rollback for an operational restart.

Previously observed max_connections=25, superuser_reserved_connections=3, reserved_connections=0. Connection exhaustion is established; abandoned/zombie sessions as the source are not established. Restart is recovery, not proof of a permanent capacity fix.

Completed: Google Cloud reports Restart finished at 10:13:00 Bangkok, 21 seconds after submission. A normal sync in the new OLAP test interface succeeded afterward. Proposed amount 2000 and original eligible date 6 October 2026 returned; pending calculation message cleared and Refresh Assessment remains absent. This also completes the prior task's input restoration verification. Production OLTP and OLAP client sessions were not independently retested in this restart task. Owner should sync those sessions to confirm recovery on their devices. No permanent connection-capacity remediation was applied.
