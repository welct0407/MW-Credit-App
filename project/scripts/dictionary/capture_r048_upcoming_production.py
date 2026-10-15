"""Targeted read-only production capture of the four R048 upcoming-charge views."""
import json
import capture_postgresql as capture

if __name__ == '__main__':
    queries = capture.QUERIES
    names = "('oltp_upcoming_charge_events_v1','oltp_upcoming_charge_coverage_v1','oltp_upcoming_charge_context_v1','oltp_upcoming_charge_summary_v1')"
    capture.QUERIES = {
        'extensions': 'SELECT extname AS name FROM pg_extension WHERE false',
        'relations': 'SELECT * FROM (' + queries['relations'] + ") q WHERE schema='public' AND name IN " + names,
        'columns': 'SELECT * FROM (' + queries['columns'] + ") q WHERE schema='public' AND relation IN " + names,
    }
    destination = capture.PRIVATE / 'r048-production/production-model-closure.json'
    capture.capture('production', destination)
    data = json.loads(destination.read_text(encoding='utf8'))
    assert len(data['sections']['relations']) == 4
    (capture.REPO / 'outputs/r048-production/postgresql-affected-definitions.json').write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
