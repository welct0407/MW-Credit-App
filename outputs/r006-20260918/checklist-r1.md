# R006 release delta — revision 1

Generated from the JSON record; edit that source and regenerate. Exact targets remain in JSON. This is a configuration checklist, not release approval or proof of unrecorded-change coverage.

Candidate SHA-256: `d2814e156a81f89c5d7bb245012edb7a70ad1e96027fc2baf07c8e8b03f4c262`

## Continue here

- versions: DEV OLTP 1.000134; OLAP 1.000129 observed, no R006 edits; SQL V21 unchanged. Rollback OLTP 1.000131.
- done: Four App formulas saved and independently read back in the reloaded current editor; six payment methods and collection parity checked. See DEV_REPORT.md.
- next: Owner DEV acceptance and scoped production authorization; fresh PROD identity/drift/rollback review before any promotion.
- decisions: DEV implementation only authorized. Both DEV apps remain Prototype. No production writes authorized.
- evidence: Change Logs/CHANGE_NOTES_R006_2026-09-18.md; outputs/r006-20260918/DEV_REPORT.md, benchmark.json, saved-editor-observations.json, fixture-readback.jsonl.

## Checklist

| ID | App | Object / property | Operation | DEV target | PROD target |
| --- | --- | --- | --- | --- | --- |
| APP-001 | OLTP | Payments.Eligible Charges / App formula | change | {"state":"value","value":"IF(IN([Status], LIST(\"Processing\", \"Error\")), SELECT(Charges[Row ID], AND([Ref Loans].[Ref Borrowers] = [_THISROW].[Ref Borrower], [Amount Remaining] &gt; 0, IFS(IN([_THISROW].[Allocation Method], LIST(\"Single Full\", \"Single Partial\", \"First-day Auto\")), [Row ID] = [_THISROW].[Ref Target Charge], [_THISROW].[Allocation Method] = \"Loan Close\", [Ref Loans] = [_THISROW].[Ref Target Charge].[Ref Loans], IN([_THISROW].[Allocation Method], LIST(\"Receive All\", \"Lump Sum\")), [Charge Date] &lt;= [_THISROW].[Payment Date], TRUE, FALSE))), LIST())"} | {"state":"value","value":"IF(IN([Status], LIST(\"Processing\", \"Error\")), SELECT(Charges[Row ID], AND([Ref Loans].[Ref Borrowers] = [_THISROW].[Ref Borrower], [Amount Remaining] &gt; 0, IFS(IN([_THISROW].[Allocation Method], LIST(\"Single Full\", \"Single Partial\", \"First-day Auto\")), [Row ID] = [_THISROW].[Ref Target Charge], [_THISROW].[Allocation Method] = \"Loan Close\", [Ref Loans] = [_THISROW].[Ref Target Charge].[Ref Loans], IN([_THISROW].[Allocation Method], LIST(\"Receive All\", \"Lump Sum\")), [Charge Date] &lt;= [_THISROW].[Payment Date], TRUE, FALSE))), LIST())"} |
| APP-002 | OLTP | Payments.Eligible Outstanding / App formula | change | {"state":"value","value":"IF(IN([Status], LIST(\"Processing\", \"Error\")), SUM([Eligible Charges][Amount Remaining]), 0)"} | {"state":"value","value":"IF(IN([Status], LIST(\"Processing\", \"Error\")), SUM([Eligible Charges][Amount Remaining]), 0)"} |
| APP-003 | OLTP | Payments.Visible Allocations / App formula | change | {"state":"value","value":"SELECT([Related Payment Allocations][Row ID], [Allocated Amount] &gt; 0)"} | {"state":"value","value":"SELECT([Related Payment Allocations][Row ID], [Allocated Amount] &gt; 0)"} |
| APP-004 | OLTP | Borrowers.Daily Collection Status / App formula | change | {"state":"value","value":"IFS( COUNT([Todays Collection Charges]) = 0, \"\", COUNT( SELECT( [Todays Collection Charges][Row ID], AND( [Charge Date] &lt; TODAY(), [Payment Status] &lt;&gt; \"ชำระแล้ว\" ) ) ) &gt; 0, \"Overdue\", AND( NOT(IN(\"รอชำระ\", [Todays Collection Charges][Payment Status])), NOT(IN(\"ชำระบางส่วน\", [Todays Collection Charges][Payment Status])) ), \"Fully Paid\", OR( IN(\"ชำระบางส่วน\", [Todays Collection Charges][Payment Status]), AND( IN(\"ชำระแล้ว\", [Todays Collection Charges][Payment Status]), IN(\"รอชำระ\", [Todays Collection Charges][Payment Status]) ) ), \"Partially Paid\", TRUE, \"Not Paid\")"} | {"state":"value","value":"IFS( COUNT([Todays Collection Charges]) = 0, \"\", COUNT( SELECT( [Todays Collection Charges][Row ID], AND( [Charge Date] &lt; TODAY(), [Payment Status] &lt;&gt; \"ชำระแล้ว\" ) ) ) &gt; 0, \"Overdue\", AND( NOT(IN(\"รอชำระ\", [Todays Collection Charges][Payment Status])), NOT(IN(\"ชำระบางส่วน\", [Todays Collection Charges][Payment Status])) ), \"Fully Paid\", OR( IN(\"ชำระบางส่วน\", [Todays Collection Charges][Payment Status]), AND( IN(\"ชำระแล้ว\", [Todays Collection Charges][Payment Status]), IN(\"รอชำระ\", [Todays Collection Charges][Payment Status]) ) ), \"Partially Paid\", TRUE, \"Not Paid\")"} |

Compare saved readbacks separately for DEV and PROD; missing observations remain Pending. Readiness also requires the workflow tests, warning gate, complete edit-record reconciliation and applicable approvals in the release log.
