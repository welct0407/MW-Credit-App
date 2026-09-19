# R010 DEV test evidence

| ID / behavior | Environment | Expected | Actual | Status / limitation |
| --- | --- | --- | --- | --- |
| R010-GUI-01 blank direct receipt | DEV OLTP 1.000035 | Form blocks Save and identifies missing borrower and amount | `Payments Form` stayed open; Thai required-field messages appeared for both fields; cancelled | Pass; no write |
| R010-GUI-02 unchanged Posted receipt | DEV OLTP 1.000036 | Existing valid receipt opens without correction error | 18 Sep synthetic receipt opened with no custom Notes error | Pass |
| R010-GUI-03 Posted account correction without reason | DEV OLTP 1.000036 | Form blocks Save and explains appended-note rule | Dad account changed to Lisa; Save stayed in form and bilingual custom error appeared; discarded | Pass; no write |
| R010-GUI-04 quick-command stale eligibility | DEV OLTP 1.000036 saved editor | Charge/borrower/loan fields return no account for zero/ineligible current state and expose guidance | Saved expressions and messages read back for all three command fields | Pass by definition readback; no concurrent stale write fabricated |
| R010-ED-01 final diagnostics/version | DEV OLTP 1.000036 | Zero warnings/errors; Deployed | `No issues found`; Manage > Versions showed 1.000036 | Pass |
| R010-DOC-01 model workbook | Repository | Exact DEV overlay preserved without changing PROD inventory | `Dev Differences` A2790:E2811 exported, reopened, value-compared and rendered | Pass |

The selected tests cover the changed visible inputs and the Posted-correction regression found during implementation. They intentionally avoid financial writes and notification delivery. RC mapping, initial RC deployment and PROD validation remain future promotion work.
