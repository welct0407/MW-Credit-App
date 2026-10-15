-- Read-only evidence query, run in the dedicated POC database after UI tests.
-- AppSheet same-sync observation must be captured BEFORE manually syncing again.
SELECT s.id, s.input_value, s.revision,
       p.applied_revision, p.derived_value,
       (SELECT count(*) FROM public.poc_events e WHERE e.source_id=s.id) AS event_count,
       (p.applied_revision=s.revision AND p.derived_value=s.input_value::bigint*2)
         AS projection_matches
FROM public.poc_source s
JOIN public.poc_projection p ON p.id=s.id
ORDER BY s.id;
SELECT id, source_id, revision, input_value, derived_value
FROM public.poc_events ORDER BY source_id, revision;
