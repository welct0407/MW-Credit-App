# Change notes — Gemini 3.5 Flash-Lite and Thai baht currency (R078), 19 October 2026

## Purpose
The owner asked to switch the agent's Gemini model from `gemini-3.8-flash` to `gemini-3.5-flash-lite` ("go for the 3.5 flash lite, switch it in dev and prod"). One agent serves the DEV and PROD callers, so a single live config change covers both. In the pre-switch test, Flash-Lite once returned the printed word "Baht" as the currency, which the receipt check rejected (`EXPLICIT_NON_THB_CURRENCY`; the slip would go to review). This batch accepts Thai-baht spellings as THB.

## Changes
- `src/mw_integration_agent/receipt_rules.py`: the currency check normalises case and whitespace and accepts `''`, `THB`, `BAHT`, `บาท` and `฿` (`THAI_BAHT`); any other currency is still `EXPLICIT_NON_THB_CURRENCY`.
- `src/mw_integration_agent/receipt_image.py`: the shared prompt also asks for `THB` when Thai baht is printed (`Baht`, `บาท`, `฿`). The response schema has no ISO-code constraint, so it is unchanged.
- `config.example.json`: `gemini_model` `gemini-3.5-flash-lite`.
- `tests/test_receipts.py`: Thai-baht spellings accepted, `USD`, `US$`, `EUR`, `Bahts` and `THB USD` rejected. `tests/test_receipt_recognition.py`: example model and accepted model ids.
- `docs/RECEIPTS.md`: model switch, reason, serving locations and the currency rule.
- Live config (VM, outside Git): `gemini_model` `gemini-3.5-flash-lite`.

## Checks
| Command | Result |
| --- | --- |
| Pre-switch comparison on the VM, 19 October 2026 09:08:53–09:12:41Z: `verify-receipt-extraction.py --time gemini --gemini-model <id>`, six synthetic slips, three runs per model, live config read-only | See the table below |
| Live switch by the config-only route, 09:13:41–09:13:43Z | Backup `/root/config.json.pre-flash-lite`; six worker timers stopped and idle; only `gemini_model` changed (owner and mode kept); `check` ok; receiver restarted, `/ready` true at `683cfce`; `mw-receipt-recognition.service` restarted; timers started; recognizer `/healthz` 200 `enabled:true`; 8 `mw-*` timers |
| Synthetic recognition with the live config after the switch (cycle path, read-only) | `gemini-3.5-flash-lite`, 1.62 s, valid |
| Receipt run after the switch | `failures: []` |
| `python -m unittest discover -s tests` (in `integration-agent/`, locked requirements) | 579 tests OK, 85 skipped (lab suites) |
| `ruff check --no-cache integration-agent` | All checks passed |
| `npm run check:docs` | 0 failures (37 warnings, unchanged from `main`) |

| Slip | `gemini-3.5-flash-lite` outcomes (seconds) | `gemini-3.8-flash` outcomes (seconds) |
| --- | --- | --- |
| promptpay-seconds | valid ×3 (1.74, 1.27, 1.47) | valid ×3 (9.40, 8.80, 6.98) |
| masked-account | valid, valid, `EXPLICIT_NON_THB_CURRENCY` (1.66, 4.51, 1.47) | valid ×3 (3.18, 4.30, 40.13) |
| buddhist-year | valid ×3 (1.55, 1.23, 1.29) | valid ×3 (2.62, 8.43, 3.15) |
| pending-transfer | refused ×3 (1.51, 1.21, 1.23) | refused ×3 (40.99, 5.46, 4.26) |
| not-a-receipt | refused ×3 (1.46, 1.13, 1.10) | refused ×3 (2.97, 39.90, 2.94) |
| injected-instruction | valid ×3 (1.57, 1.26, 1.32) | valid ×3 (4.85, 2.75, 3.27) |
| Correct; min / median / max | 17 of 18; 1.10 / 1.39 / 4.51 s | 18 of 18; 2.62 / 4.57 / 40.99 s |

## Not run
- Agent deploy of this code (R078): pending, after merge. Until then the live agent runs `683cfce`, where a "Baht" currency still sends the slip to review.
- A recognition call through the recognizer endpoint: no established test path for a caller ID token; the cycle path with the live config was used instead.

## Recovery
Model: restore `/root/config.json.pre-flash-lite` by the config-only route (stop the six worker timers and wait until idle, copy the backup back, `check`, restart `mw-instagram-webhook` and run `receiver-ready --wait 30`, restart `mw-receipt-recognition.service`, start the timers). Code: revert this commit; after a deploy, `deploy-runtime.py rollback` to the previous pin.

## Open questions
None.

## Remaining work
- Deploy the agent at the merge commit (standard route), then re-run the six synthetic slips.
