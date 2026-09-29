# Bell2 combined 2 October charges — 29 September 2026

## Scope and result

The owner agreed to combine Bell2's unpaid ฿2,100 due on 29 September with the regular ฿2,100 due on 2 October, while keeping automatic charge generation enabled and avoiding a missing-today-charge dashboard action. Bell2 had five active daily-interest loans on a three-day cycle. Their five 29 September charges were unpaid, unallocated and totaled ฿2,100; no 2 October charge had yet been recorded.

The five existing charges were moved to 2 October and doubled: three ฿1,000 loans have ฿600 interest each and two ฿2,000 loans have ฿1,200 interest each. All five loans now use 29 September as their Interest Schedule Anchor Date, retain the three-day interval and have Auto Charge Enabled true. The five 2 October charges total ฿4,200 and remain unpaid. Their notes document the agreed deferral. The next ordinary scheduled charge is 5 October, totaling ฿2,100 at unchanged current daily interest rates. No payment or principal record changed.

## Target, rollback and checks

- Target: `appsheet-pg-prod-20260914` / `34.21.174.215` / `loan_manager_prod`; production OLTP app `93844270-6aa5-420b-a960-bcdf08abd357`. Starting repository checkpoint: `64e92dd1b17fc656cbead26fa99e94bc94425de6`. No app definition, database schema, migration or model configuration changed.
- Private pre-write backup: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917/bell2-deferral-20260929-before.dump`, SHA-256 `7E22BEE45C4C74C94F0AC477170C8DBC28C9125F2AA40800662C9A9E40F547CA`. A local restore and normalized schema comparison passed; its checker accounts for one PostgreSQL view-parenthesis formatting difference.
- Private guarded SQL: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/bell2-deferral-20260929.sql`. The exact transaction was rehearsed with rollback, then committed with borrower, business-date, loan, charge and allocation preconditions. It updated five anchors and five charges, preserving charge IDs and audit triggers.
- Independent production readback found zero Bell2 charges dated 29 September and five pending 2 October charges with ฿4,200 remaining, no payment children, and all five loan auto-charge flags true with three-day intervals. The maintained analytics procedure refreshed 29 September (one day).
- In the production AppSheet GUI, Bell2 is absent from today's collection list. Upcoming Charges shows ฿4,200 recorded on 2 October and ฿2,100 projected on 5 October. The synced Dashboard does not show Generate All Today's Charges. That dashboard action is global, so future missing charges for other borrowers can make it appear independently of Bell2.

Status: production data, affected analytics and AppSheet readback verified. For rollback, reconcile any intervening financial writes and use a targeted auditable correction; a full backup restore over later transactions would discard them.
