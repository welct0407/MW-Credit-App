"""Fixed SELECT-only receipt masters. Row contents stay in private memory/state."""
from .cash_statement import read_query


def masters(config):
    return read_query(config, '''SELECT json_build_object(
      'borrowers',(SELECT coalesce(json_agg(t),'[]'::json) FROM (
        SELECT "Row ID" id,"Instagram Username" username,"AI Collection Enabled" enabled,
        coalesce("Description","Borrower Name",'') name_en,
        coalesce("Borrower Name","Description",'') name_th FROM public."Borrowers") t),
      'accounts',(SELECT coalesce(json_agg(t),'[]'::json) FROM (
        SELECT "Row ID" id,"Account Label" label,"Active" active,
        "Account Number" number,"Alternative Account Number" alternative FROM public."Cash Accounts") t),
      'reviewer_ids',(SELECT coalesce(json_agg("Row ID"),'[]'::json)
        FROM public."Partners" WHERE "AI Reviewer" IS TRUE),
      'partners',(SELECT coalesce(json_agg(t),'[]'::json) FROM (
        SELECT "Row ID" id,"Email" email,"Language Preference" language,
        "Instagram Username" username,"IG Integration Enabled" enabled FROM public."Partners") t));''')
