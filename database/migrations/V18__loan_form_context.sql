-- R002 owner-requested one-row, read-only context for the OLTP new-loan form.
-- Current pool ratios use the same all-date population as Current Pool Share.
-- Historical repayment/expense allocation formulas remain unchanged.
CREATE VIEW public."Loan Form Context" AS
WITH capital AS (
 SELECT coalesce(sum(CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END),0) AS total,
 coalesce(sum(CASE WHEN p."Partner Role"='A' THEN CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END ELSE 0 END),0) AS a,
 coalesce(sum(CASE WHEN p."Partner Role"='B' THEN CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END ELSE 0 END),0) AS b
 FROM public."Cash Pool Contributions" c LEFT JOIN public."Partners" p ON p."Row ID"=c."Ref Partner"
), principal AS (
 SELECT coalesce(sum(l."Principal Amount"::numeric),0) - coalesce((SELECT sum(r."Principal Paid"::numeric) FROM public."Repayments" r JOIN public."Loans" x ON x."Row ID"=r."Ref Loans"),0) AS outstanding
 FROM public."Loans" l
)
SELECT 'cashpool'::text AS "Row ID", capital.total::money AS "Contributed Capital",
 principal.outstanding::money AS "Outstanding Principal",
 (capital.total-principal.outstanding)::money AS "Available Cashpool",
 CASE WHEN capital.total>0 THEN capital.a/capital.total ELSE 0 END AS "Partner A Profit Share",
 CASE WHEN capital.total>0 THEN capital.b/capital.total ELSE 0 END AS "Partner B Profit Share"
FROM capital CROSS JOIN principal;
