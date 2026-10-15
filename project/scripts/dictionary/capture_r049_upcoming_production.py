"""Read-only PROD metadata capture for the R049 summary provider."""
import json
import capture_postgresql as capture


if __name__ == '__main__':
    queries = capture.QUERIES
    names = "('oltp_upcoming_charge_summary_v2')"
    capture.QUERIES = {
        'extensions': 'SELECT extname AS name FROM pg_extension WHERE false',
        'relations': 'SELECT * FROM (' + queries['relations'] + ") q WHERE schema='public' AND name IN " + names,
        'columns': 'SELECT * FROM (' + queries['columns'] + ") q WHERE schema='public' AND relation IN " + names,
    }
    destination = capture.PRIVATE / 'r049-production/after/production-model.json'
    capture.capture('production', destination)
    data = json.loads(destination.read_text(encoding='utf8'))
    assert [r['name'] for r in data['sections']['relations']] == ['oltp_upcoming_charge_summary_v2']
    out = capture.REPO / 'outputs/r049-production/postgresql-affected-definitions.json'
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
