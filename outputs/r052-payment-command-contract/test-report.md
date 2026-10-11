# R052 checkpoint 4C independent contract verification

8 October 2026. Pure functions only; no database, schema, runtime wiring, storage calls or credentials.

C added six adversarial cases covering UTF8 byte ordering (including astral/BMP order), malformed/sparse selected arrays, exact Notes/Unicode composition, strict object/version/byte limits, every business/actor/receipt identity component, immutable outcome copies, unresolved semantics, rehashed noncanonical JSON and invalid final outcome timestamps. B owns five complementary focused cases.

Initial independent run:5/6 passed. A sparse selectedChargeIds array was accepted because Array.map skipped holes, yielding a canonical JSON list containing null. This violates the nonempty-ID contract and fails later identity round-trip. B was notified; final fix/run status follows below.

## Design review

The saved proposal explicitly requires current authentication/mapping before replay, one transaction-scoped UUID lock before lookup, atomic Payment+journal commit, typed savepoint rollback before durable rejection, and retained immutable identity without Payment FK/TTL. Unknown SQL/commit outcomes cannot become final rejection. These address the identified design risks; no further proposal blocker was found.

These pure tests do NOT establish durable retention, database permissions, concurrency, crash recovery, payment correctness or AppSheet compatibility. A future approved migration must prove those on full history. Original outcomes are immutable values in these tests, not persisted tombstones. Actor strings and receipt descriptors are trusted-adapter inputs, not verified identity or ownership.

Manual receipt paths remain opaque; this module performs no SQL-reference/GCS normalization. Generated-key ownership, private object generation/hash, authorized retrieval and actual AppSheet manual-image roundtrip remain adapter verification gaps. V50 agent mapping is not assumed. GCS upload cannot be atomic with SQL; unavailable images must stay separate from financial outcomes. The journal retains exact Notes/actor/receipt metadata, so future access and retention protection are required; no ordinary reader or AppSheet table exposure is proposed.

No DB/browser/broad regression suite was run for this pure-module slice. D owns publication and any triggered CI. No new table or migration is implemented by this checkpoint.

## Final result

B changed selected-array validation to visit holes and added a bounded canonical JSON input check before hashing/parsing. C independently reran the complete focused suite:11/11 passed (B5+C6), including sparse-array rejection and oversized identity rejection. Diff check passed. C files frozen: tests/unit/payment-command-independent.test.mjs and this report. No remaining concrete pure-contract blocker; durable runtime/receipt compatibility remain the explicit future checks above.
