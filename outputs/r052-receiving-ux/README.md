# Compact receiving UX

Implemented, tested and deployed in DEV; owner visual/hands-on acceptance remains open. [Exact delivery manifest](delivery-manifest.json) · [Independent tests](independent-verification.md) · [Read-only deployed smoke](live-readonly-smoke.md) · [Single batch](batch.md).

Open Collection, select charges using the header master control or individual rows, then use the receive icon. Master selection covers eligible due charges across pages; the existing single-full rule covers a future charge. Choose Bank Transfer, Cash or Net-off at Disbursement. Review fetches current records before confirmation. Successful posting returns to Collection; uncertain results preserve recovery. All loading uses the orange header indicator; ready views refresh through the header and errors retain Retry.

Drafts save quietly until discard, posting or sign-out. Authorized offline access/viewed snapshots last up to24 hours; retained drafts do not extend access. Offline financial posting is disabled and reconnect never submits automatically. Receipts support PNG/JPEG, not HEIC. Notifications remain Phase8.

Core source f937bff, corrected test source cde2ec7 and final frontend d0581b3 are separately pinned. Full Development/Database CI, maintained database checks, container smoke and actual DEV V81 exact privilege restoration passed. [Timing](review-timings.json) does not establish a speed improvement. [Fresh private recovery verification](recovery-verification.json) is retained; do not blindly restore over subsequent owner payments. The unchanged V80 nonsuperuser maintenance lifecycle proof is reused explicitly.

No live financial write/upload/CAS was made by this UX batch; prior Phase4 synthetic proof remains prior evidence. PROD V77, AppSheet/reader, IAM and notification resources are unchanged.
