"""R049: read-only DEV metadata capture for the additive summary provider."""
import json
import capture_postgresql as capture

if __name__ == '__main__':
    queries = capture.QUERIES
    capture.QUERIES = {
        'extensions': 'SELECT extname AS name FROM pg_extension WHERE false',
        'relations': 'SELECT * FROM (' + queries['relations'] + ") q WHERE schema='public' AND name IN ('oltp_upcoming_charge_summary_v1','oltp_upcoming_charge_summary_v2')",
        'columns': 'SELECT * FROM (' + queries['columns'] + ") q WHERE schema='public' AND relation IN ('oltp_upcoming_charge_summary_v1','oltp_upcoming_charge_summary_v2')",
    }
    destination = capture.PRIVATE / 'r049-upcoming-summary/development-model.json'
    capture.capture('development', destination)
    data = json.loads(destination.read_text(encoding='utf8'))
    out = capture.REPO / 'outputs/r049-upcoming-summary/postgresql-affected-definitions.json'
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
