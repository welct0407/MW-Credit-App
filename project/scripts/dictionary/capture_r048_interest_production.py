"""R048 targeted PROD catalog readback; no business rows or writes."""
import json
import capture_postgresql as capture

if __name__ == '__main__':
    queries = capture.QUERIES
    relations = "('Loans','olap_loans_analytics','reporting_forecast_inputs_v1')"
    capture.QUERIES = {
        'extensions': 'SELECT extname AS name FROM pg_extension WHERE false',
        'relations': 'SELECT * FROM (' + queries['relations'] + ") q WHERE schema='public' AND name IN " + relations,
        'columns': 'SELECT * FROM (' + queries['columns'] + ") q WHERE schema='public' AND relation IN " + relations,
        'constraints': 'SELECT * FROM (' + queries['constraints'] + ") q WHERE schema='public' AND relation='Loans'",
        'routines': 'SELECT * FROM (' + queries['routines'] + ") q WHERE schema='public' AND name IN ('original_daily_interest_rate','apply_principal_daily_interest','forecast_schedule_v1')",
    }
    destination = capture.PRIVATE / 'r048-loan-interest-production/production-model-closure.json'
    capture.capture('production', destination)
    data = json.loads(destination.read_text(encoding='utf8'))
    out = capture.REPO / 'outputs/r048-loan-interest-production/postgresql-affected-definitions.json'
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
