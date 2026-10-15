# Hold dismissal monitoring semantics — 25 September 2026

Owner authorized rejecting held receipts through direct IG replies and reserved all direct replies for review actions. Integration Agent revision22 is deployed at `dcb8443087d16eedc69bd1c990fd7406bb107a66`. This repository only updates Resource_Monitoring.md and its visual guide: rejected holds leave active counts; existing failed_notifications includes missing/undelivered acknowledgement to the deciding reviewer. No dashboard/rule/collector, AppSheet or database change; R036 remains Open.

Rollback is the prior documentation commit `40e599386d9db5c1c049b55e875366bbd6279055`. Checked wording against installed worker functions and fresh numeric inspection; retained POSTED19, held2 pending owner replies, failed notifications0. Preserve unrelated Risks/r026 work. Source implementation/deployment/test evidence remains in the Integration Agent change log. Publication under standing authorization.
