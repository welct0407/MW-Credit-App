# Loan Delete while defaulted — local V69 proof

Historical V69 proof: the subsequent [V70 local candidate](default-repayment-v70-plan.md) closes the independent repayment UPDATE/DELETE gap. It is not applied to DEV. The local runner now defaults to V70; use `--expected-version 69` explicitly to reproduce the historical behavior below.

The saved OLTP177 predicate, reported by the parent and matching the recorded [Loan Delete action](../../Documents/Data%20Dictionary/systems/appsheet/oltp/actions/loans-delete-e039a9a5.yaml), only checks that the loan has no payment allocations. That is insufficient for a defaulted loan with an independent legacy repayment. This task made no live database or app changes.

Proposed minimal replacement, retaining any separate existing authorization condition and confirmation:

```appsheet
AND(
  NOT([Defaulted] = TRUE),
  COUNT(
    SELECT(
      Payment Allocations[Row ID],
      [Ref Charge].[Ref Loans] = [_THISROW].[Row ID]
    )
  ) = 0
)
```

Preserve all Ref/IsAPartOf relationships. This hides native Loan Delete while defaulted; after Undo, the existing allocation restriction continues to govern availability. The proposal is not saved or GUI-accepted. Hidden actions and client data are not database authorization, and this does not establish atomicity across separately submitted requests.

## What the isolated tests establish

- For the current DEFAULT fixture shape, with no independent legacy repayment, V69 rejects direct parent deletion, original charge deletion and generated loss-child deletion without changing any table fingerprint.
- For a partially paid defaulted loan, a legacy repayment can have no payment allocation. The test starts with principal100, received principal10 and outstanding90. Default records loss90. A separately committed legacy repayment DELETE succeeds; later protected child/parent DELETE requests fail. The earlier deletion remains and outstanding becomes10 while defaulted. Undo then leaves outstanding100, not the original90: it cannot reconstruct a deleted independent payment.
- A nondefault unpaid loan still supports the tested child-first charge deletion followed by parent deletion, including removal of its owned cash projection.

These are simulated independently committed SQL requests, not observed AppSheet dispatch order. The risk is concrete, but no actual GUI partial deletion is claimed. Direct independent repayment deletion while defaulted remains a backend consistency boundary outside this no-migration task; the proposed parent predicate prevents initiating this normal UI cascade path.

## Correct Default setup validation

The canonical maintained assertion is `validate_defaulted` in [Test-DefaultInspectionLocal.py](../../scripts/database/Test-DefaultInspectionLocal.py). It verifies the actor in `Loans.Closed By`, the original charge restoration JSON and `Repayments.Created By`. The generated loss charge note is a generic zero-cash description, not an actor field. The failed private commit runner is retained only as historical evidence and is not a supported execution path; it was not retried or reauthorized here.

The local runner proves normal enable → Default → disable in one transaction, with an independent observer seeing auto=false before and after commit. It verifies source/cash restoration after Undo and a complete setup/Undo transaction rollback with all26 fingerprints identical. Separate committed Undo preserves all nonanalytics tables and all financial snapshot values; only `Generated At` changes in two daily and54 account snapshot rows. The temporary database is dropped and the original local database's26 fingerprints remain unchanged.

## Repeatable checks and recovery

Run the standalone local proof only against an explicitly prepared localhost V69 database. It verifies loopback, exact data directory and checksum245428688, creates a temporary database copy, and removes that copy in `finally`. It contains no DEV transport or live write mode. The exact tested command, private recovery reference, file hashes and logs are in [validation evidence](default-inspection-local-validation.json).

```sh
python scripts/database/Test-DefaultInspectionLocal.py \
  --port 55469 \
  --expected-version 69 \
  --data-directory /workspace/r051-dev-recovery-bptrxi2l/data \
  --output /tmp/r051-default-inspection-maintained.json
pwsh -NoProfile -File scripts/database/Test-CI.ps1
```

The local server was stopped after testing. The SQL test is included in the maintained statement batch and all three CI routes passed; the separate-request Python proof was run separately locally. This is the local-validation checkpoint; [PR15 checks](https://github.com/welct0407/AppSheet-Loan-Project/pull/15/checks) records remote results for the exact published revision. The proposed predicate remains unapplied and actual GUI validation is pending. R051 stays Open; DEV V69 and PROD V58 are unchanged.
