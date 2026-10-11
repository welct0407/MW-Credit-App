# Local Notes/manual receipt rehearsal — checkpoint 4B

Verified: 15 unique full-V77 cases (final affected receipt3/3 rerun plus prior12 unchanged reused), six HTTP/browser scenarios and the maintained Test-CI passed. Parent visual and architecture reviews passed; owner review pending. This is separate from the live DEV app and uses synthetic payments/files only.

From C:/GitHub/MW-Credit-App run:

```powershell
pwsh -NoProfile -File tests/integration/Run-PaymentRehearsal.ps1 -Serve
```

Use the printed loopback URL on this computer. A fresh run creates full-V77 disposable PostgreSQL and synthetic fixtures. Notes and manual image entry are optional; supporting them is required payment parity. Use only synthetic PNG/JPEG files, at most5MiB and20MP for this local rehearsal. These are technical bounds, not AppSheet business limits. HEIC/direct iPhone camera support is not established.

Review selected charges, account, exact Notes and initial image before confirmation. Posted receipt replacement/removal is a metadata operation and must not post money again. Unknown financial outcomes remain status-check-only; this memory journal does not establish durable safe retry. Failed attachment must preserve the committed payment and prior current image.

Ctrl+C in the owning runner stops its server/database. Files stay in that runner's random temporary receipts directory, outside PostgreSQL data and repositories, for controlled cleanup. Do not reuse file paths after restart: ownership descriptors are memory-only. Do not recursively delete broad temporary directories. No live GCS/API, schema, permissions or cloud deployment is involved.

Future GCS integration must prove authenticated DEV access, byte/object identity, SQL-relative/AppSheet-reference compatibility and upload/attachment recovery. Existing manual/agent ownership remains separate; no automatic replacement-object deletion or OCR is introduced.
