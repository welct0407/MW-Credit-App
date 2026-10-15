# Approved power-test handoff — 2 October 2026 UTC

Scope: one controller Deallocate (the approved stop), then one Start, then one Restart. The parent cloud browser performs these actions only after this VM executor has ended and recovery is verified. User confirmed work is saved and interruption is safe. Custom domain is deferred; use https://vm01-controller-50f792fa.azurewebsites.net with the accepted MW Credit session. No VM power action was sent by the activation executor.

## Required independent recovery

The controller is hosted outside VM-01, so its cloud-browser session survives deallocation. That session alone is not emergency recovery if the controller fails or retains an unresolved latch. Parent has separately opened Azure portal in the cloud browser as MW Credit and sees VM01 Running with Stop/Restart enabled, but IAM role/deny reads were unavailable; direct Start authorization remains unproven. Parent is obtaining confirmation that the owner has independent administrator Azure access capable of starting VM-01. **Do not deallocate until that path is confirmed or equivalent effective Start permission is demonstrated.** This VM's Azure CLI is not an independent recovery route. No extra MW Credit permission was requested or granted.

## Work-admission hold

Before the first action, the parent stops dispatching new work to VM-01, confirms existing VM tasks have completed/saved/published and records the hold. Keep the hold through all three actions and final reconnection checks. The dialog's “admission held” confirmation refers to this external work hold. It does not mean disabling controller ledger admission: ledger admission must remain enabled to issue the approved commands. The controller's active-request latch separately serializes operations.

The exact confirmation labels are **“Work is saved and interruption is authorized.”** and **“New VM work is held until this action is resolved.”** Check both only after those commitments are true. Enter `owner-20261002-controls-test-approval` in **Approval reference**, then click **Confirm action** once. The field permits1–128 characters, starts with an alphanumeric character, and otherwise permits letters, digits, `_ . : / -`. Start has no interruption-confirmation dialog. The visible stop button is **Stop - deallocate**.

## Execute exactly once per action

1. After the VM activation task has ended and independent recovery is confirmed, refresh status in the existing cloud-browser tab. Require fresh running/Succeeded status with no error and actionable controls. Keep that same tab/session and its stored request; do not clear session storage or navigate away during an uncertain request.
2. Click **Stop - deallocate** once. Confirm saved work and the external work hold using the fields above. Record UTC start time and the visible operation phase. The UI does not display request IDs: they are preserved automatically in the pending browser request and server ledger; collect them through authorized ledger readback after testing, without DevTools or session/token inspection. Wait for terminal completion and deallocated/Succeeded with the pending receipt cleared before proceeding. The UI normally refreshes every15 seconds while visible. An accepted response or VM disconnect alone is not completion.
3. Click Start once from a fresh deallocated snapshot. Wait for terminal completion and running/Succeeded. Verify VM-01 reconnects using the existing remote-executor connection or owner session; running is not executor readiness. Keep the work hold and do not dispatch a new VM task yet.
4. Refresh status, click Restart once and complete the same confirmation. Require terminal operation completion, then fresh running/Succeeded and independent reconnection. `accepted unverified`, `unknown`, a permission error or a merely running VM is not restart completion.
5. Record all three action outcomes/request IDs/timestamps and reconnection checks. Release the external work hold only after the final safe state is confirmed. The approved controls remain enabled unless the owner directs otherwise.

## Failure and admission closure

Stop the sequence on any failure, missing tracking evidence, `operation read not authorized`, persistent accepted/unknown state or sign-in/controller failure. Preserve the original request and receipt. Do not repeat a power action with a new ID, click another action to “unstick” it, or clear the ledger. A same-ID retry is for the saved request only and must not become an automatic replay loop. If RBAC propagation causes a403, status may retry the same operation later without another power POST.

With polling enabled, expect **completed** after ARM terminal success and a fresh target-state observation; **accepted**, **accepted unverified** and **unknown** are nonterminal and retain the latch. During a pending request, controls stay disabled and **Retry saved request** may appear. Completion clears the pending request, hides that retry button and allows controls appropriate to the new state. A later refresh can remove the completed operation text because there is no longer an active request. **Rejected** is terminal failure: stop the sequence rather than proceed.

The visible-tab automatic refresh stops after15 minutes of waiting. That is a UI polling limit, not proof of failure or permission to replay. Record the phase/error, keep the tab/pending request intact and stop further power commands. Clicking **Refresh status** resumes GET-only observation and resets the UI wait timer; it does not resubmit the power action. An uncertain operation has no automatic safe time after which a new request is allowed. Consult the independent recovery operator and retain the ledger evidence.

An authorized operator can close controller admission using the current—not cached—generation:

```text
node dist/scripts/admin-ledger.js admission --approved --evidence <incident-reference> --expected-generation <current-generation> --enable false
```

Use the existing public VM01 configuration and authorized operator CLI identity. Closing admission increments generation. Also set `VM01_ENABLE_MUTATIONS=false` when needed to prevent new requests; this does not prove already-dispatched operations stopped. Preserve operation polling/evidence. If VM-01 is off, use the verified independent Azure operator recovery path to restore it; do not depend on this command running on the stopped VM.

Manual reconciliation requires the exact active request ID, disabled ledger admission, documented Function-worker fencing and authoritative ARM terminal/non-dispatch evidence. Follow `docs/operations.md`; never attest worker fencing merely because VM-01 is stopped. Reconciliation leaves admission disabled and advances generation. Do not restore the pre-test ledger: it would discard deduplication evidence. Any recovery outside the approved three normal actions must be recorded and handled under the parent's recovery authority.

## Verification boundary

The separate role's definition/assignment and enabled switches are configuration proof. Successful managed-identity GET of an approved operation's real status URL remains to be demonstrated by the live test; no synthetic or new VM action was created for permission probing. URLs remain constrained by existing controller code. Direct ChatGPT tool/MCP authentication is a separate parent-owned design; no credential or adapter was created here.
