# Independent reader and native receipt verification

Agent C, 11 October 2026. DEV checkpoint evidence only. Starting supplied application commit: `a9e7da96`; tested working changes on `codex/r052-review-shell`, before final publication. This is synthetic/local proof, not diagnosis or resolution of the historical live reader incident. Existing unrelated dirty files were preserved.

## Result

71 focused checks passed, zero failed/skipped. Five additional independent integration checks live in `tests/unit/phase6-independent.test.mjs`. No product defect found or product source changed by C.

- Actual local HTTP server: both exact code-less installed-driver timeout messages produce fixed categories; unknown/private text remains unclassified. HTTP503 body remains `{ok:false,code:read_unavailable}`. Response X-Request-ID matches completion logging. Logs contain only fixed allowlisted fields; SQL/token/error causes/search text remain absent. Auth rejection performs no checkout.
- Stateful startup pool: failed transport check disposes once; subsequent explicit checks acquire then reuse the fresh healthy client. Existing stateful affected regression verifies failed read/failed rollback recovery, mapping-denial rollback disposal, fatal errors despite successful rollback, ordinary57014 reuse and sanitized cleanup errors.
- Two receipt names that collide under space/hyphen-to-underscore normalization resolve to distinct arbitrary catalog keys and exact generations. Actual Sharp decodes returned synthetic media. Unauthorized principal and absent Partner mapping cause zero storage calls.
- Configured malformed/empty/PROD/oversized catalog aborts command configuration. Missing optional catalog retains the two legacy descriptors. Affected parser/transport checks cover duplicate reference/key and conflicting legacy pins, traversal/unsupported paths, unknown reference, changed metadata generation/MIME/size and altered content; metadata mismatches prevent download and content mismatch prevents decode. Generated and agent source tests pass unchanged.
- Actual CLI subprocesses produce byte-identical catalogs and sanitized reports regardless of capture entry order. Input/output within repositories is rejected; malformed captures emit only fixed rejection text. Synthetic private paths/reference/key/row strings are absent from evidence/stdout/errors. Report explicitly states the offline tool does not authenticate capture provenance. Successful synthetic assertions therefore do not establish real AppSheet/SQL/GCS provenance.

## Command

Dot-source `scripts/Enter-Dev.ps1`, then:

```text
node --test tests/unit/phase6-independent.test.mjs tests/unit/read-recovery.test.mjs tests/unit/read-stage-diagnostics.test.mjs tests/unit/dev-read-boundary.test.mjs tests/unit/loan-read.test.mjs tests/unit/collection-read.test.mjs tests/unit/native-catalog.test.mjs tests/unit/source-receipts.test.mjs tests/unit/source-receipts-independent.test.mjs
```

Node24.21.0. Final result:71 passed,0 failed,0 skipped. Windows sandbox virtual TEMP permits file creation but `realpath` returned EPERM during initial CLI proof. The same synthetic-only focused run passed with approved execution outside that sandbox; this was a tooling limitation, not evidence of a product failure. Temporary synthetic media/captures/catalogs were removed by the test finally block.

No full CI, full browser suite, live storage upload, financial write, schema change, timeout/limit increase, production operation or deployment occurred in this verification. The coordinator retains the one consolidated CI checkpoint and changed-service DEV delivery/readback, live known-two receipt coverage, final source pinning and physical-device owner acceptance. No additional live native receipt is claimed: A's bounded inventory found six total references (four generated, two known native, zero additional).

## Recovery and publication

C added only the independent test file and this evidence document. Rollback is removal/reversion of those two additions; B/F own product/runtime rollback. Root owns the coherent batch change log, commit/push and final evidence pin. This working-tree proof must be linked to the eventual published source before claiming checkpoint closure.

## Corrected CLI portability checkpoint

Consolidated CI38104425262 failed before browser execution because its checkout lacked the sibling AppSheet-Loan-Project repository. The CLI's original unconditional `realpath` for that protected root raised ENOENT. The earlier Windows-local pass did not cover this Linux checkout shape.

B corrected blocked-root resolution to preserve a missing root's reserved subtree through its nearest existing canonical ancestor. Existing paths still use realpath; errors other than ENOENT still propagate fail closed. C added a sixth independent regression covering absent nested sibling roots, private sibling-prefix paths, existing protected paths, input/output paths through a junction (a symlink on Linux), and missing protected components beneath an aliased parent which later materialize. Relative inputs remain forbidden. Code review confirmed only ENOENT permits ancestor fallback; actual Windows sandbox EPERM remained a separate fail-closed observation.

Focused corrected retest: `node --test tests/unit/phase6-independent.test.mjs tests/unit/native-catalog.test.mjs` —12 passed,0 failed/skipped. Actual CLI subprocess deterministic catalog/report and repository refusals passed again. No full local suite or CI rerun was dispatched by C. Root/D own publication and the corrected consolidated checkpoint; CI38104425262 remains failed and is not green evidence.

B also corrected the containment predicate to treat only the actual `..` parent component as outside; an internal filename beginning `..` must remain protected. C added input/output rejection assertions for `..private.json` within protected roots and repeated the same12 focused checks successfully after that correction.
