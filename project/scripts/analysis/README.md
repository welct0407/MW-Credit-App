# Borrower matrix simulation tools

These scripts perform scoped read-only capture and offline analysis for the [24 September owner review](../../outputs/borrower-matrix-simulation-20260924/README.md). They do not apply migrations, modify apps/reports, send messages or post payments.

Use the bundled Python runtime from `load_workspace_dependencies`. All tooling uses the Python standard library. No package installation or output-local dependencies are required. See the root [scripts guide](../README.md).

## Commands

```powershell
# Set $pythonExe to the bundled Python executable returned by the dependency tool.

# Use the exact private snapshot printed by capture, not a guessed latest file.
& $pythonExe scripts/analysis/borrower_matrix_simulate.py 'C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/borrower-matrix-20260924/snapshot-TIMESTAMP.json'
& $pythonExe scripts/analysis/borrower_reliability_compare.py 'C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/borrower-matrix-20260924/snapshot-TIMESTAMP.json'
& $pythonExe scripts/analysis/borrower_matrix_review.py 'C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/borrower-matrix-20260924'
& $pythonExe -m unittest discover -s scripts/analysis -p test_borrower_matrix.py
```

The live capture script (`borrower_matrix_capture.py`) was deleted on 17 October 2026 (DB-ACCESS-07, direct route retired; Git history keeps it); the tools below work on an existing private snapshot.

Simulation/renderer overwrite their derived private files and sanitized aggregate summaries; copy a review checkpoint before intentionally comparing a different source snapshot. `simulation-summary.json` includes the source SHA-256 and capture timestamp. Named rows, money, identities and private HTML/CSV stay under Documents/ChatGPT. Publish only the aggregate summaries and methodology. The scripts assert private input/output locations for borrower-level data. No contacts, addresses, notes, bank references or authentication values are needed by the simulation.

`RECOMMENDED` in the simulator selects candidate D: 45/15/15/25 with average obligation-delay grade. The comparison script retains A–E as explicit alternatives, not a search optimizer. Historical checks are restated reconstructions, not point-in-time audited backtests. The methodology documents remaining default-history and data-timing limits.

## R027 SQL implementation verification

`validate_payment_health_sql.py` rehearses V41 against a private restored loopback DEV database and the fixed private production snapshot, compares all borrower scores/categories/value/arrears, and rolls back. Review its explicit private paths before reuse. It does not deploy to production. The direct-route live checker `verify_payment_health_dev.py` was deleted on 17 October 2026 (DB-ACCESS-07).
