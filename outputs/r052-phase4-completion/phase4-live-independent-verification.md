# R052 Phase 4 independent live DEV verification

Observed 8 October 2026 using the existing mapped Chrome owner session at `https://dev-lm.mw-credit.com/`. This is agent hands-on verification, not owner acceptance or production readiness.

## Pinned deployed candidate

- Source: `4b49a3fd1b4ec2df293f4160e22838b9d54a4745` (D handoff).
- Hosting version: `5ebf508fe6a817e4`; release `1791454844351000` (D handoff).
- Actual DOM script observed: `/assets/index-DXi-J9TB.js`.
- DEV Flyway 80 and command revision `00002-vrx` are D's independently verified deployment evidence.
- Existing real Firebase owner sign-in survived update/reload and later normal reload. No authentication bypass, token inspection, or new login was performed.

## Single controlled synthetic payment

Only `R052-P4-B` / `R052-P4-L` was used. Two due charges of one baht each were selected, receiving account was the dedicated nondefault `R052 P4 synthetic only`, amount was two baht, and multiline Thai Notes were entered. The maintained GUI showed fresh online review with two allocations and the correct account before one Confirm.

The approved private synthetic PNG was attached using the browser file chooser. Original and authenticated current receipt images both rendered at 640 by 360 pixels. D owns object/hash verification; no sensitive URLs or credentials were exported.

- One Confirm returned **Posted**, request `8551f1fc-c72f-4c11-9eea-4afba285e51b`.
- Original recorded timestamp: `2026-10-08T10:27:12.394Z`.
- Processed timestamp shown: `2026-10-08 17:27:13.258021`.
- Original amount: two baht; two principal allocations of one baht, zero interest; two repayments of one baht; one Payment Receipt cash movement of two baht to the dedicated account.
- Current financial source showed Matches original payment.
- One approved Notes-only metadata save appended `ตรวจสอบ Notes หลัง Posted`. Original Posted Notes remained unchanged; current Notes showed the append. Receipt still rendered, financial results remained unchanged.
- Normal borrower search/history after reload showed the fixture inactive with zero principal, its loan Closed with zero principal, and one Posted two-baht payment with current Notes and manual receipt attached.
- No second Confirm, ordinary borrower mutation, notification, or receipt replacement was performed. D's final DB/GCS fingerprints establish database-level counts, reconciliation and journal immutability.

The review screen does not expose its request UUID before Confirm; it became visible on the Posted result and was immediately supplied to D. No retry was required.

## Actual deployed offline/reconnect observations

Before posting, a two-charge draft with dedicated account and multiline Thai Notes was saved online. Offline shell reload retained owner Sign out. The initial snapshot showed Connection required while account/storage loading settled; explicit reconnect recovered the saved selected charges, account and exact Notes, without a payment dispatch. Fresh review and the one authorized Confirm followed.

After posting, a deliberate settled offline repeat showed Saved on this device under Connection required. Selecting the fixture opened Offline saved copy — not current. Review was disabled. A new unsent draft on this already-paid fixture (zero remaining charges) was saved offline with multiline Thai Notes, then survived another offline reload with owner Sign out present and Review disabled. Explicit Reconnect restored online access; Saved payment drafts reopened the exact Notes and no additional Confirm was performed. The zero-charge scope is stated explicitly: this second cycle proves offline storage/restart and reconnect, not a new payment selection or posting.

The first blocked view was initially reported as a possible defect and subsequently withdrawn after settled observation. On the second restart the test waited for the saved fixture control rather than treating early auth/lease loading as final state. B is independently checking the actual SDK boot regression.

One separate navigation issue was reported to B: while online Saved payment drafts is open, Borrowers navigation leaves the saved workspace visible until normal reload. This does not authorize a payment and did not affect the recorded financial result; source assessment remains with B.

Per-tab offline emulation was restored online. The existing owner tab remains available with the retained synthetic unsent draft, no pending financial command.

## Evidence

- `phase4-live-posted.jpg`: synthetic Posted result and receipt viewport before metadata edit.
- `phase4-live-offline-draft.jpg`: synthetic stale snapshot/unsent offline draft with Review disabled.

Notifications remain deferred to Phase 8. No notification implementation, delivery, production deployment, or owner acceptance is claimed.

## Final corrected frontend deployed smoke

After D deployed clean frontend source `e88d1ea438f81e6f8bc3cb3c493406425142fc83`, Hosting version `ab4f267f8f0d1534`, release `1791456290051000`, C observed `/assets/index-5Zjk-2dk.js` online and after an actual offline reload. Backend source `4b49a3f`, command image c840/revision00002-vrx and DEV80 were unchanged per D handoff.

Read-only normal owner smoke passed: Saved payment drafts then same-view Borrowers returned to Borrower directory with the saved heading absent. Saved fixture payment panel while Collection was the selected workspace then same-view Collection returned to Collection borrowers with Selected charges absent. Thus the prior navigation issue is fixed in the actual deployed GUI.

After activating the waiting update through Update and reload, offline reload retained real Firebase owner Sign out and the existing synthetic Thai draft. The saved fixture appeared within the bounded20-second wait (the complete reload/open/check call took2.5seconds), the DOM script matched the corrected bundle, exact multiline Notes remained, and Review stayed disabled. Explicit Reconnect restored online access; reopening the retained draft showed the same Notes and disabled Review on the already-paid fixture. Collection navigation then left the normal Collection workspace visible.

No upload, Confirm, metadata save, new financial command or ordinary borrower write occurred in this smoke. D owns the final database count/fingerprint verification of no additional payment. Per-tab offline emulation is restored online. `phase4-live-final-offline.jpg` records the actual corrected offline view; C independently verified the corresponding actual SDK synthetic regression1/1 before deployment. This closes the reported saved-workspace navigation issue and the corrected frontend read-only smoke. It does not change the original controlled payment's evidence or imply owner acceptance.
