# Change notes — receipt reader Claude Opus 5.5 and slip QR reference (R142), 11 November 2026

## Purpose
A borrower slip on 11 November 2026 was held as PAYER_UNRESOLVED because the current reader (Gemini 3.5 Flash-Lite, thinking low) misread the payer name. R142 moves the receipt reader to Claude Opus 5.5 and adds the slip QR reference, DEV first. Owner instruction (11 November 2026, Bangkok): "include the QR reference and build it in DEV, follow your recommendation plan. engage 6 members team." Authority is DEV build and DEV activation only. PROD activation (the PROD caller and the Instagram receipt cycle) stays on Gemini until a separate owner approval. No PROD data write; no new tables or columns expected.

## Scope
- New receipt provider Claude Opus 5.5 (`claude-opus-5-5`), adaptive thinking, effort low, the shared `SCHEMA` and `PROMPT`, the same 1600 px prepared image.
- Keyless Anthropic workload identity federation, as the chat relay does.
- Gemini stays the automatic fallback when Claude is unavailable (timeout, 5xx, refusal, invalid shape).
- Invisible format characters (Unicode category Cf, for example U+200B) are stripped from model text fields before the shape check.
- The reference is read from the slip QR when present and CRC-valid; precedence against the OCR reference and any recognizer contract change are Archie's decisions.
- DEV caller routed to the new reader; PROD caller and the Instagram receipt cycle unchanged.
- Out of scope unless Archie finds it necessary: I/l folding in duplicate checks, a bank verification API, payer-name data fixes.

## Evidence
Aggregate results only; no slip images, names, accounts or references are kept in Git.
- Bake-off on 318 posted slips of the last 30 days, with the production prompt, schema and 1600 px preparation. Truth is the unanimous readings plus image adjudication of 106 disputed slips.
- Current reader: 23 reference errors, 37 payer errors, 258 of 318 slips fully correct.
- Haiku 5.5 adaptive low: 6 and 4, 308 correct. Gemini 3.8 Flash low: 16 and 16, 289 correct with 3 failed calls. Sonnet 5.5: 55 to 56 reference errors, 252 to 254 correct (zero-width spaces and digit errors).
- Opus 5.5 adaptive low: 7 reference errors, 1 payer error, 309 correct; about 0.0146 USD per slip; latency p50 2.8 s, p90 3.5 s.
- No model error in amount, date or receiving account. Remaining reference errors are mostly SCB mixed-case references where printed `l` and `I` look the same.
- Slip QR decoded locally on 304 of 319 slips, all CRC16-valid. It carries a sending bank code and the transaction reference only. The QR reference equals the printed reference on 300 of 304; 4 SCB slips differed and are not investigated. The QR does not prove authenticity.
- Cost of the evaluation: about 10.80 USD Anthropic (DEV federated route) and about 0.40 USD Gemini.
- Decision: keep `MAX_SIDE` 1600 and the current preparation. A full-resolution test on 61 larger slips gave no material gain.

## Changes
Placeholders, filled as the work lands.
- Design (Archie): pending.
- Implementation (Byte): pending.
- Infrastructure (Forge): pending (federation rule and audience for receipts, VM runtime).
- Records (Dewey): this note and `project/Documents/Release_Tracker.md` now; other evolving documents after implementation (see Remaining work).

## DEV activation
Pending.

## PROD
Pending owner approval. Not requested; the PROD caller and the Instagram receipt cycle stay on Gemini.

## Checks
| Command | Result |
| --- | --- |
| | |

## Not run
Pending.

## Recovery
Pending. Expected: the Git baseline, and routing the DEV caller back to Gemini by configuration.

## Open questions
- PROD activation of the new reader, when the owner has reviewed DEV.
- Bank or third-party slip verification is a later owner decision.

## Remaining work
Implementation, DEV activation and checks. Then update, as affected: `integration-agent/docs/RECEIPTS.md`, `integration-agent/README.md` Current state, `integration-agent/SERVICE_CATALOGUE.md` and `service-catalogue.json`, `integration-agent/config.example.json` notes, `project/Documents/Environment_Inventory.md` (federation rule, DEV caller routing, VM version), `project/Documents/Solution_Design.md` Current state if receipt reading is described there, `project/Documents/Development_Changes.md` (active scope), the Data Dictionary only if the recognizer contract changes, and `project/Documents/Service_Account_Browser_Mapping.md` only if an identity changes.
