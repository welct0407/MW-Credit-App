# Checkpoint 4E verification

8 October 2026 (Asia/Bangkok). Final local candidate passed **22/22 API cases**: 19 independent C cases and 3 B cases. Pure contracts passed 5/5 once and were reused unchanged: **27 unique named cases**, without accumulating retests. Maintained disposable database CI passed separately once, exit 0. All owned test clusters stopped.

[Independent verification and frozen hashes](independent-verification.json) records expected/actual cases, test seams and resolved findings. [Database check](database-ci.json) records D's separate maintained regression. The final candidate hashes match saved files; V78 remains SHA256 `8ea5009d29bf8c78fadcdaa478680defd3f161ef2a7e22e7999c2a2aa7170c30` with no migration diff.

The retests closed media-type 415, receipt outage 503 versus binding 422, uncertain connection quarantine and current mapping denial 403 after confirmed rollback. Failed rollback remains unavailable and discards the client.

Authentication uses an injected synthetic cryptographic-verifier dependency. Posting/rollback/replay/source correction and deletion use actual owned disposable V78 PostgreSQL. COMMIT acknowledgement loss, guard/query-result failures and receipt resolution are labelled injected seams; real Firebase sessions, live roles/IAM, GCS/AppSheet rendering and physical network failure are unproved. Prior 4D restart evidence is retained separately, not counted as a 4E restart.

No browser/preview/live service, financial endpoint activation, schema/grant, receipt storage or notification changed. Local verification is complete for owner review; runtime authority, manual receipt roundtrip and committed-event delivery remain future scoped work.
