-- R177 item D (owner, 20 November 2026: daily first-time-right % on the Grafana Agent & Receipts page, history from the
-- start of the data). monitoring.receipt_ftr_daily_v1() is the only object the dashboard role may use in this database:
-- SECURITY DEFINER, STABLE, read-only, one row per Bangkok day of slip arrival (runtime.receipt_jobs.created_at) from the
-- first receipt job (21 September 2026). Each job has exactly one outcome, the first rule that holds:
--   excluded (not in the % at all): job IGNORED (not a receipt, a sender not enabled, our own outgoing transfer R177
--     OUTGOING_TRANSFER) or DUPLICATE (an already processed slip), or one of the 17 outgoing transfers of a partner's own
--     cash account found read-only on 20 November 2026 before that rule existed (holder's name on the slip, 30 October to
--     19 November; opaque job ids, no personal data). Slips before about 30 October stored no payer name and cannot be
--     identified; outgoing slips between 20 November and the activation of R177 B count as rejected or held;
--   in progress (not in the %): job PENDING, PREPARED or VALIDATED, or its review APPROVED, POSTING or UNKNOWN;
--   auto_first_pass (the numerator): review POSTED under OWNER_AUTHORIZED_AUTO_PAYMENT, with no superseded review
--     generation (partner_reviews.job_id '<job>:superseded:<review>') and no receipt_reconsiderations row;
--   after_review: any other POSTED (a reviewer approval, a pay-forward choice, a loan close, or automatic only after a
--     recheck or reconsideration);
--   manual_in_app: review MANUAL_REQUIRED, STALE or EXPIRED (the agent handed the slip to the app);
--   rejected_or_held: everything else (review REJECTED or PENDING, job held REVIEW or a dismissed hold REJECTED).
-- genuine = auto_first_pass + after_review + manual_in_app + rejected_or_held; ftr_percent = 100 * auto_first_pass /
-- genuine, one decimal, NULL on a day without a genuine slip. Counts only: no borrower, amount, account or slip text.
-- Grants: mw_agent_dashboard (the Grafana login mw_grafana_reader is a member) gets USAGE on the schema, EXECUTE on the
-- function and CONNECT on mw_agent again (V11 revoked it with the conversation questions); its read-only and 10 s
-- settings for mw_agent are bootstrap.sql's. No table, column, trigger or data change. Immutable after application.
SET LOCAL ROLE mw_agent_owner;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='mw_agent_dashboard') THEN
  RAISE EXCEPTION 'V15 requires role mw_agent_dashboard: create it as postgres first (database/setup/bootstrap.sql)';
 END IF;
END $$;

CREATE SCHEMA monitoring;
REVOKE ALL ON SCHEMA monitoring FROM PUBLIC;

CREATE FUNCTION monitoring.receipt_ftr_daily_v1()
RETURNS TABLE (day date, auto_first_pass integer, after_review integer, manual_in_app integer, rejected_or_held integer,
               in_progress integer, genuine integer, ftr_percent numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
 WITH jobs AS (
  SELECT (to_timestamp(j.created_at) AT TIME ZONE 'Asia/Bangkok')::date AS day, j.status, v.state, v.detail AS review_detail,
         EXISTS (SELECT 1 FROM runtime.partner_reviews s WHERE s.job_id LIKE j.id || ':superseded:%')
          OR EXISTS (SELECT 1 FROM runtime.receipt_reconsiderations c WHERE c.job_id = j.id) AS repeated,
         j.id = ANY (ARRAY['781769e1c5e43ce6aadcc3e7010407c3d8835da5b4b80386104b40db53e76bcd','1fce54567df76ee1d59a711f6c2320873eab1d01bd776cd910aca22e7d3d4e80','2ef5b1ebf49a19b794adfdf5cdae1031b585d8649e2d26feb7c01f8b9fa1e99e','2922780e71c163353d7afd95939f96b33f777725f640734f37a8a051881018a6','2c06199ec127063a2ddc476a446a6590e91696c8e98b3d8c6c39f97dcd387859','342d849def4f6598ce3c02abe2e867381ab19a187e0abcb367e03fb2ed457c42','659afa5c6bd1155eb47959f39d3d99817860cef5c67ece1a881d6eb14f85d4f6','ad44e0739ca2ad435d095015d0a4a84d9a026e926b6ab45c63a909dd77496aa0','27604b348c66e3bdf3c2917b59cbc3ba80c4ae0e4330bf5cabe2da84ca861b48','d1bf3e2789dfd5133e720770f1ddf7165320f79059e02ebeff88bb462cb4b43d','8ccd3a559f5915028b264565e277768698381fe1789cc0341006558277b3d181','c1f9f99bf354ed27f727482afaf1db99304f7119bb94d5b2ca2823c43fd78872','ed9d7c7f1173e855f648f916bd19fa58596dd43ae6991c754fdef5ed6c319ac2','d15e821605090eae78c306571d5c79110589be240915420d3c20c1b95f9135ce','8ab90c08c515bb6fc0ed0663af60c860a26d3e8d7f2c7881ace1d627249fe637','b5261329dd520ecef980546ea55c59c07318953bfbb3228919cb58bfd049866f','ccc1e3e85eb5ff9ea9d5a4e78c1d7d303bd50bf05ef5b5a1ac8165556181f666']) AS outgoing
  FROM runtime.receipt_jobs j LEFT JOIN runtime.partner_reviews v ON v.job_id = j.id),
 classed AS (
  SELECT day, CASE
    WHEN status IN ('IGNORED','DUPLICATE') OR outgoing THEN 'excluded'
    WHEN status IN ('PENDING','PREPARED','VALIDATED') OR state IN ('APPROVED','POSTING','UNKNOWN') THEN 'in_progress'
    WHEN state = 'POSTED' AND review_detail LIKE 'OWNER_AUTHORIZED_AUTO_PAYMENT%' AND NOT repeated THEN 'auto'
    WHEN state = 'POSTED' THEN 'reviewed'
    WHEN state IN ('MANUAL_REQUIRED','STALE','EXPIRED') THEN 'manual'
    ELSE 'held' END AS outcome
  FROM jobs)
 SELECT day,
        (count(*) FILTER (WHERE outcome = 'auto'))::integer,
        (count(*) FILTER (WHERE outcome = 'reviewed'))::integer,
        (count(*) FILTER (WHERE outcome = 'manual'))::integer,
        (count(*) FILTER (WHERE outcome = 'held'))::integer,
        (count(*) FILTER (WHERE outcome = 'in_progress'))::integer,
        (count(*) FILTER (WHERE outcome NOT IN ('excluded','in_progress')))::integer,
        round(100.0 * count(*) FILTER (WHERE outcome = 'auto')
              / nullif(count(*) FILTER (WHERE outcome NOT IN ('excluded','in_progress')), 0), 1)
 FROM classed GROUP BY day ORDER BY day
$$;

REVOKE ALL ON FUNCTION monitoring.receipt_ftr_daily_v1() FROM PUBLIC;
GRANT USAGE ON SCHEMA monitoring TO mw_agent_dashboard;
GRANT EXECUTE ON FUNCTION monitoring.receipt_ftr_daily_v1() TO mw_agent_dashboard;
GRANT CONNECT ON DATABASE mw_agent TO mw_agent_dashboard;
