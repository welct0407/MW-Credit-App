# Borrower matrix simulation tools

These scripts perform scoped read-only capture and offline analysis for the [24 September owner review](../../outputs/borrower-matrix-simulation-20260924/README.md). They do not apply migrations, modify apps/reports, send messages or post payments.

Use the bundled Python runtime from `load_workspace_dependencies`. Capture reuses the existing project-managed **psycopg 3.2.9** under `%LOCALAPPDATA%/AppSheetLoanTools/python-deps`; all other tooling uses the Python standard library. No package installation or output-local dependencies are required. See the root [scripts guide](../README.md).

## Commands

```powershell
# Set $pythonExe to the bundled Python executable returned by the dependency tool.
& $pythonExe scripts/analysis/borrower_matrix_capture.py
& $pythonExe scripts/analysis/borrower_matrix_capture.py --rows

# Use the exact private snapshot printed by capture, not a guessed latest file.
& $pythonExe scripts/analysis/borrower_matrix_simulate.py 'C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/borrower-matrix-20260924/snapshot-TIMESTAMP.json'
& $pythonExe scripts/analysis/borrower_reliability_compare.py 'C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/borrower-matrix-20260924/snapshot-TIMESTAMP.json'
& $pythonExe scripts/analysis/borrower_matrix_review.py 'C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/borrower-matrix-20260924'
& $pythonExe -m unittest discover -s scripts/analysis -p test_borrower_matrix.py
```

Capture validates the instance/host/database tuple using existing config, then forces read-only repeatable-read with a statement timeout. Credentials are read from the existing external file and never printed. No arbitrary SQL argument is accepted. Only allowlisted tables/fields are captured. View definitions and source rows remain private. A new timestamped capture never overwrites the prior source snapshot.

Simulation/renderer overwrite their derived private files and sanitized aggregate summaries; copy a review checkpoint before intentionally comparing a different source snapshot. `simulation-summary.json` includes the source SHA-256 and capture timestamp. Named rows, money, identities and private HTML/CSV stay under Documents/ChatGPT. Publish only the aggregate summaries and methodology. The scripts assert private input/output locations for borrower-level data. No contacts, addresses, notes, bank references or authentication values are needed by the simulation.

`RECOMMENDED` in the simulator selects candidate D: 45/15/15/25 with average obligation-delay grade. The comparison script retains A–E as explicit alternatives, not a search optimizer. Historical checks are restated reconstructions, not point-in-time audited backtests. The methodology documents remaining default-history and data-timing limits.
