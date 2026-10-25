"""Fixed SELECT-only receipt masters. Row contents stay in private memory/state.

R095: "Communication Name" is the borrower's payer name (the sender name printed on their slips).
"""
from .audit import reference
from .cash_statement import read_query

MASTERS_SQL = '''SELECT json_build_object(
      'borrowers',(SELECT coalesce(json_agg(t),'[]'::json) FROM (
        SELECT "Row ID" id,"Instagram Username" username,"AI Collection Enabled" enabled,
        coalesce("Description","Borrower Name",'') name_en,
        coalesce("Borrower Name","Description",'') name_th,
        "Communication Name" payer FROM public."Borrowers") t),
      'accounts',(SELECT coalesce(json_agg(t),'[]'::json) FROM (
        SELECT "Row ID" id,"Account Label" label,"Active" active,
        "Account Number" number,"Alternative Account Number" alternative FROM public."Cash Accounts") t),
      'reviewer_ids',(SELECT coalesce(json_agg("Row ID"),'[]'::json)
        FROM public."Partners" WHERE "AI Reviewer" IS TRUE),
      'partners',(SELECT coalesce(json_agg(t),'[]'::json) FROM (
        SELECT "Row ID" id,"Email" email,"Language Preference" language,
        "Instagram Username" username,"IG Integration Enabled" enabled FROM public."Partners") t));'''


def masters(config):
    # Inside a job this routine reference read is summarised on the cycle's JOB record (digest and
    # row counts) instead of writing its own READ operation tree; elsewhere it stays an audited READ.
    return reference('receipt_masters', read_query, config, MASTERS_SQL)
