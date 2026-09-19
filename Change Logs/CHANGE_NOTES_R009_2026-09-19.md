# R009 — Payment notification fixes

Owner request: fix both diagnosed notification issues in DEV as R009. Production promotion is not authorized. Starting Git commit `acbdc4fd492b2087ded27223a2841a36b61e5e5c`; working tree clean.

Scope: R008 Receive All Confirmed, R008 Single Full Confirmed and R008 Loan Close Confirmed. Correct creator exclusion by explicitly referencing the originating command row inside Partner recipient selection. Move Send closure summary into the Yes branch of Notify payment-closed loans so zero closures send no closure message. DEV notification recipient settings remain directly owner-only; record corrected production expressions for RC substitution and verify their logic separately.

Target DEV OLTP: `500b27b6-884a-41e8-a9ec-df801b0110ad`, internal name `MW-OLTP-DEV-20260919-578763613`. Companion DEV OLAP: `9f3422be-bc87-4a5a-a42a-67528ee80393`. SQL V24 unchanged. Live restorable versions and tests pending inspection.

Status: In development. No PROD edit, financial write or notification is authorized by this reservation. Reviewed synthetic DEV workflow tests and owner-only DEV notification delivery are covered by standing project authorization.
