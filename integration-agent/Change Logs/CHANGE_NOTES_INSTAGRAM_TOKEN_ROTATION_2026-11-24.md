# Change notes — Instagram token rotation after the account move, 24 November 2026

## Purpose
Owner request of 24 November 2026: the business Instagram account was moved to another Meta account, the conversation poll failed and receipts stopped. Restore the token and account for the outage window.

## Incident
- Cause: moving the Instagram account to a new Meta account revoked the access token and removed the account from the Meta app's "Generate access tokens" list. The last good poll finished at 19:37:03 Bangkok; from 19:38:05 to 21:11:55 every `mw-conversation-poll` run exited 2 with `Instagram REJECTED (HTTP 401, code 190, subcode 0)`. Timers, the webhook receiver and the tunnel kept running.
- Owner steps (Meta dashboard, outside the agent): the existing app "MW Collection Agent" (app ID 1334267208592324; Instagram app "MW Collection Agent-IG", Instagram app ID 1012458355175678) was kept. The owner's new Facebook account was added as an app Administrator. Instagram account `tttlll8709` (ID 17841432882176626) was re-added under "API setup with Instagram login" through an Instagram Tester invite, with Webhook Subscription on and the callback URL unchanged. A new token was generated and added by hand as Secret Manager `mw-instagram-access-token` version 3 (created 14:09:08Z, 21:09:08 Bangkok).

## Changes
- Live, owner instruction of 24 November 2026: `sudo systemctl start mw-instagram-token-refresh.service` at 21:12:28 Bangkok installed version 3 into `/etc/mw-integration-agent/secrets/instagram-access-token.txt` (`{"status": "ok", "action": "synced", "version": 3, "file_age_days": 0.0}`; root:mwagent 0640). No deploy, configuration, catalogue or unit change.
- `docs/OPERATIONS.md`: the token renewal section gains the steps for an account moved to another Meta account, the held-slip follow-up and the note that `ig_token` does not detect a revoked token.

## Checks
| Command | Result |
| --- | --- |
| `gcloud secrets versions list mw-instagram-access-token` (metadata only) | Version 3 enabled, created 2026-11-24T14:09:08Z; versions 1 and 2 still enabled |
| `instagram_account_id` in the live `config.json` compared with 17841432882176626 | Equal |
| `mw-integration-agent instagram-probe` at 21:12:38 | `authenticated` true, the expected username, 25 conversations on the page |
| `journalctl -u mw-conversation-poll.service` | Last failure 21:11:55; first success 21:13:15 (run started 21:12:55), then 21:14:34 and 21:15:50: 47 conversations, 43 eligible, 0 new messages, 0 failed; no 401 after the install |
| `curl http://127.0.0.1:8000/ready` | `ready` true, release R181, commit `5042366b` |
| `GET <account id>/subscribed_apps` through the agent's Instagram client (audited read) | One app, `subscribed_fields` `messages` |
| `mw-resource-health` run of 14:14:09Z | `polling` 1 (0 until 14:12:02Z), `ig_token` 1, `receipts` 2 (see below) |

## Outage window (19:37:03 to 21:12:28 Bangkok)
- Instagram holds 3 messages in the window across all 47 conversations (one read of the conversation list, newest 20 messages each, no conversation truncated inside the window): 3 images in one direct conversation at 20:04:55, 20:18:00 and 20:26:28. No group message and no text.
- All 3 were delivered by webhook during the outage (deliveries at 20:04:56, 20:18:01, 20:26:29) and each became a receipt job. So nothing was missed at capture.
- All 3 jobs ended `REVIEW` with `RECEIPT_PROCESSING_UNAVAILABLE` after 3 attempts (no stored image, no extraction, no Partner review, nothing posted). Their 3 hold notices are `IG_PREFLIGHT_FAILED` and were not delivered. Held receipts are not re-run automatically.
- The monitor reads `receipts` 2 (Degraded) with `held_receipts` 3 and `unnotified_holds` 3 for this reason.

## Not run
- No inbound webhook has been observed since the re-link: no message arrived between 20:26:29 and the checks. The subscription is confirmed by the API read above only.
- No Meta renewal of the new token: it is due when the file is 7 days old, on the daily run of 2 December 2026.

## Recovery
Versions 1 and 2 are older tokens and version 2 is the revoked one, so there is no rollback to them. If the new token fails, generate another in the Meta dashboard, add it as a new secret version and start `mw-instagram-token-refresh.service`.

## Open questions
None.

## Remaining work
None. Watch for the first inbound webhook after the re-link and the first Meta renewal on 2 December 2026.

## Reconsideration of the held slips (owner go, 24 November 2026, 21:18 Bangkok)
| Step | Result |
| --- | --- |
| Readback before | Exactly 3 jobs created in the window, all `REVIEW` / `RECEIPT_PROCESSING_UNAVAILABLE` |
| `mw-integration-agent receipt-reconsider --job-id <id>`, once per job, 21:18:04 to 21:18:16 | 3 times `RECONSIDERATION_QUEUED`, `prior_review_superseded` false; the first waited twice for `receipt-worker.lock` |
| Receipt cycle, 21:18:34 to 21:19:14 | Each job read its image again and was validated; 3 reviews `APPROVED` then `POSTED` under `OWNER_AUTHORIZED_AUTO_PAYMENT`, each with a payment id |
| Partner notices | 6 notices accepted by Instagram after 21:18; the 3 earlier hold notices stay `IG_PREFLIGHT_FAILED` (undelivered, superseded by the posting) |
| `mw-resource-health` run of 14:20:33Z | All components 1; `receipts` 1, `held_receipts` 0, `stalled_jobs` 0, `completed_payments` 438 (435 before) |
