"""VM-01 adapter for exact R051 fixtures at validated DEV V72.

Only REIMBURSE may be seeded; the six existing batches cannot be reseeded.
Cleanup delegates to the maintained exact-inventory/foreign-link guards.
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, r'C:\Users\MWCredit\AppData\Local\AppSheetLoanTools\python-deps')
import psycopg
import R051UiAdditionalFixtures as fixtures

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('mode', choices=['seed', 'cleanup'])
p.add_argument('batch', choices=fixtures.BATCHES)
p.add_argument('--inventory', type=Path)
p.add_argument('--containment-reference', required=True)
p.add_argument('--window-reference', required=True)
args = p.parse_args()
if args.mode == 'seed' and args.batch != 'REIMBURSE':
    p.error('Existing six batches must not be reseeded')
if args.mode == 'cleanup' and not args.inventory:
    p.error('Fresh reviewed private inventory required')
repo = Path(__file__).resolve().parents[2]
target = json.loads((repo / 'database/environments.json').read_text())['development']
assert (target['instance'], target['host'], target['database']) == ('appsheet-pg-prod-20260914', '34.21.174.215', 'loan_manager_dev')
backup = json.loads((repo / 'outputs/r051-receipt-corrections/vm01-development-backup.json').read_text())
assert backup['restored_fingerprints_match'] and Path(backup['backup_file']).is_file()
folder = Path(backup['backup_file']).parent
state_path = folder / ('vm01-' + args.mode + '-' + args.batch + '.json')
assert not state_path.exists(), 'Prior attempt exists; reconcile before retry'
state = {'at': datetime.now(timezone.utc).isoformat(), 'mode': args.mode, 'batch': args.batch, 'outcome': 'pending', 'window_reference': args.window_reference, 'containment_reference': args.containment_reference}
with psycopg.connect(host=target['host'], port=target['port'], dbname=target['database'], user=target['user'], password=Path(target['passwordFile']).read_text().strip(), sslmode='require', connect_timeout=15) as c:
    fixtures.setup(c)
    assert c.execute('SELECT current_database(),host(inet_server_addr()),session_user').fetchone() == ('loan_manager_dev', target['host'], 'postgres')
    assert c.execute('SELECT version,checksum FROM public.flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone() == ('72', -1995290851)
    state['before'] = fixtures.readback(c, args.batch)
    state_path.write_text(json.dumps(state, indent=2, default=str), encoding='utf-8')
    if args.mode == 'seed':
        result = fixtures.seed(c, args.batch)
    else:
        assert fixtures.private_state_path_allowed(args.inventory)
        captured = json.loads(args.inventory.read_text(encoding='utf-8'))
        fixtures.cleanup(c, args.batch, {t: fixtures.keys(captured, t) for t in captured})
        result = fixtures.readback(c, args.batch)
    state['after'] = result
    state_path.write_text(json.dumps(state, indent=2, default=str), encoding='utf-8')
    c.commit()
    state['outcome'] = 'committed'
    state_path.write_text(json.dumps(state, indent=2, default=str), encoding='utf-8')
    print(json.dumps({'mode': args.mode, 'batch': args.batch, 'outcome': 'committed', 'keys': {t: fixtures.keys(result, t) for t in result if result[t]}}))
