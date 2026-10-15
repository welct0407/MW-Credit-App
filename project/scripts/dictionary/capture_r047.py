"""R047 targeted read-only production catalog evidence; no business rows or writes."""
import json
from pathlib import Path
import capture_postgresql as capture

if __name__ == '__main__':
    queries = capture.QUERIES
    capture.QUERIES = {
        'extensions': "SELECT extname AS name FROM pg_extension WHERE false",
        'columns': 'SELECT * FROM (' + queries['columns'] + ') q WHERE schema=\'public\' AND relation=\'Payments\'',
        'triggers': 'SELECT * FROM (' + queries['triggers'] + ') q WHERE schema=\'public\' AND relation=\'Payments\'',
        'routines': 'SELECT * FROM (' + queries['routines'] + ") q WHERE schema='public' AND name IN ('selected_charge_ids','guard_selected_charge_scope','payment_charge_balances','post_payment','payment_receipt_upload_stamp')",
    }
    destination = capture.PRIVATE / 'r047-production/production-model-closure.json'
    capture.capture('production', destination)
    data = json.loads(destination.read_text(encoding='utf8'))
    out = capture.REPO / 'outputs/r047-production/postgresql-affected-definitions.json'
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
