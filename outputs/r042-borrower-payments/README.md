# R042 — borrower Payments and loan profit

Owner authorized Payments between Charges and Repayments, lifetime interest/original principal with red below100%, orange100–200% inclusive, green above200%, and interest trend bars. Owner explicitly requested all payment details, including bank reference/notes/creator; database access remains through the existing reporting identity. No AppSheet edits.

Starting Git b2bdc441bbe678c5406cc2c46b6843f293336dc8. Scope frozen 2026-09-26T14:50:14.099736+00:00; R043 sole Open release. V46 only adds a receipt-grain read-only view and scoped reporting SELECT. No operational data/function/trigger changes. DEV V46 validated, migration-chain rebuild/no-op/checksum checks passed; three report queries tested against two DEV borrowers; existing public relations match PROD baseline. Both private DEV/PROD dumps restored with all table fingerprints matching. Package plan.json is pinned with V46. Live publication/closure pending.
