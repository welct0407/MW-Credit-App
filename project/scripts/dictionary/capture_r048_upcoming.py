"""R048 upcoming-charge adapters: targeted read-only DEV catalog capture."""
import json
import capture_postgresql as capture

if __name__ == '__main__':
    queries = capture.QUERIES
    relations = "('oltp_upcoming_charge_events_v1','oltp_upcoming_charge_coverage_v1','oltp_upcoming_charge_context_v1')"
    capture.QUERIES = {
        'extensions': 'SELECT extname AS name FROM pg_extension WHERE false',
        'relations': 'SELECT * FROM (' + queries['relations'] + ") q WHERE schema='public' AND name IN " + relations,
        'columns': 'SELECT * FROM (' + queries['columns'] + ") q WHERE schema='public' AND relation IN " + relations,
    }
    destination = capture.PRIVATE / 'r048-upcoming-charges/development-model-closure.json'
    capture.capture('development', destination)
    data = json.loads(destination.read_text(encoding='utf8'))
    out = capture.REPO / 'outputs/r048-upcoming-charges/postgresql-affected-definitions.json'
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
