# Verification — 8 September 2026

Passed independent local business scenarios: due-only Receive All/Lump Sum; individual future Full/Partial eligibility; no plan charges due September 8; September/October fixed profit split 11,413/3,587; zero-rate generator exclusion with positive-rate control; no closure with interest remaining; current repayment and pending KPI arithmetic. These are independent model checks, not AppSheet execution tests.

Live read-back: 72 native rows match all planned date/principal/interest/note values. Exact key population has 24 retained and 48 new keys. No extra RP20260908 rows observed. Original and new loan reference checks were performed through the native UI. Manual tests of receipt allocation, retry, permission, rollover and scheduled-bot execution remain outstanding.
