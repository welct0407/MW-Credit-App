"""Fresh database authority; conversational identity cannot grant reviewer access."""
from .config import ConfigurationError


def require_reviewer(config, partner_id):
    from .cash_statement import read_query
    if not isinstance(partner_id, str) or not partner_id:
        raise ConfigurationError('AUTHENTICATED_REVIEWER_REQUIRED')
    pid = "'" + partner_id.replace("'", "''") + "'"
    rows = read_query(config, "SELECT coalesce(json_agg(\"Login Email\"), '[]'::json) "
                      'FROM public."Partners" WHERE "AI Reviewer" IS TRUE AND "Row ID"=' + pid + ';')
    if len(rows) != 1 or not isinstance(rows[0], str) or '@' not in rows[0]:
        raise ConfigurationError('CURRENT_AI_REVIEWER_REQUIRED')
    return rows[0]
