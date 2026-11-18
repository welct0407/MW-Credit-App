-- Owner request of 18 November 2026 ("Index the agent's audit event lookup"). The receipt health collector reads the
-- acknowledged optional notices every two minutes (receipt_health.acknowledged:
-- SELECT payload->>'notice_id' FROM audit.events WHERE event_kind='optional_notification_acknowledged'). Without an
-- index on event_kind each call read the whole table: on PROD on 18 November 2026, 114,759 rows (129 MB) for 2 matches,
-- about 16,500 buffers and 64 ms per call; 18,161 calls since 16 October made it the largest I/O consumer on the shared
-- Cloud SQL instance. A plain btree on event_kind turns it into an index lookup. No table, column, grant, trigger or
-- data change; the append-only trigger and the retention function (V5) are unaffected (an index needs no grant).
-- CREATE INDEX (not CONCURRENTLY: the runner applies each version in one transaction) holds a SHARE lock on audit.events
-- while it builds, which blocks audit inserts for the build time only (well under a second at this size); apply it in
-- the deployment window with the workers paused. Immutable after application.
SET LOCAL ROLE mw_agent_owner;

CREATE INDEX events_kind_idx ON audit.events(event_kind);
