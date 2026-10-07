# Application branding

Owner direction: 7 October 2026. Use AppSheet OLTP branding for the replacement app, including desktop OLAP screens.

| Presentation | AppSheet theme | Primary accent |
| --- | --- | --- |
| Development | White / light | #e8710a |
| Production | White / light | #d81b60 |

Recorded sources: AppSheet-Loan-Project Documents/Environment_Inventory.md canonical environment table; current development dictionary theme/brand selected values; outputs/r051-production/source-mapping-validation.json branding.OLTP. No fresh AppSheet theme audit or live change was performed for this preview revision. Neutral supporting PWA colors are implementation choices, not claimed exact AppSheet palette values.

## Logo

apps/pwa/src/assets/loan-manager-logo.png is an unchanged copy of AppSheet-Loan-Project resources/Loan Manager App Logo.png. SHA256: 5808EE79D5B6E843C8ED648E8507678EA349297D1CC687A97021C5D396DD2A8D.

Use this pink OLTP asset unchanged in both environments at the owner's request. Do not recolor it to match DEV orange or substitute the OLAP logo.

## Current visual review

The synthetic preview defaults to DEV colors independently of Vite's production build mode. The DEV/PROD selector and ?theme=prod query parameter affect CSS presentation only. They never select an API, identity, database, credential or deployment target. Runtime environment wiring is future infrastructure/application work; a PROD color preview is not a production deployment.

Summary cards share a white background and their text backgrounds are transparent. The earlier off-white/pale-green featured-card contrast has been removed. The portfolio outstanding-principal summary is omitted; per-borrower and per-loan principal context remains.
