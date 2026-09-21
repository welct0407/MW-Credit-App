"""Inspected Borrowers data edits; no financial or application-definition API."""
import hashlib
import json
import urllib.request

from .config import ConfigurationError, load_secret


def dispatch_edit(config, row):
    if config.get('conversation_writes_enabled') is not True:
        raise ConfigurationError('CONVERSATION_WRITES_DISABLED')
    if config.get('appsheet_app_id') != '93844270-6aa5-420b-a960-bcdf08abd357':
        raise ConfigurationError('WRONG_OPERATIONAL_APP')
    request = urllib.request.Request(
        'https://www.appsheet.com/api/v2/apps/' + config['appsheet_app_id'] + '/tables/Borrowers/Action',
        data=json.dumps({'Action': 'Edit', 'Properties': {'Locale': 'en-US', 'Timezone': 'Asia/Bangkok'},
                         'Rows': [row]}).encode(),
        headers={'Content-Type': 'application/json', 'ApplicationAccessKey': load_secret(config, 'appsheet_key_file')},
        method='POST')
    with urllib.request.urlopen(request, timeout=60) as response:
        response.read()


def edit_record(bridge, args, writer=dispatch_edit):
    from .conversation_tools import EDITABLE, literal
    config = bridge.authorize()
    if config.get('conversation_writes_enabled') is not True:
        raise ConfigurationError('CONVERSATION_WRITES_DISABLED')
    if bridge.possible_write:
        raise ConfigurationError('ONE_EDIT_PER_MESSAGE_INSPECT_PRIOR_RESULT')
    quote = args['instruction_quote']
    if not isinstance(quote, str) or not quote.strip() or quote not in bridge.instruction:
        raise ConfigurationError('CURRENT_PARTNER_INSTRUCTION_REQUIRED')
    observation = bridge.observations.get(args['observation'])
    if not observation or observation.get('table') != 'Borrowers':
        raise ConfigurationError('OBSERVED_BORROWER_REQUIRED')
    rows = [r for r in observation['rows'] if r['Row ID'] == args['row_id']]
    changes = args['changes']
    if len(rows) != 1 or not isinstance(changes, list) or not 1 <= len(changes) <= len(EDITABLE):
        raise ConfigurationError('EXACT_RECORD_AND_CHANGES_REQUIRED')
    desired, expected = {}, {}
    for change in changes:
        if (not isinstance(change, dict) or set(change) != {'field', 'expected', 'value'}
                or change['field'] not in EDITABLE or change['field'] in desired
                or not isinstance(change['expected'], str) or not isinstance(change['value'], str)
                or len(change['value']) > 2000 or '\x00' in change['value']):
            raise ConfigurationError('UNSUPPORTED_OPERATIONAL_EDIT')
        field = change['field']
        if field in ('Borrower Name', 'Description') and not change['value'].strip():
            raise ConfigurationError('BORROWER_NAMES_REQUIRED')
        if field not in rows[0] or (rows[0][field] or '') != change['expected']:
            raise ConfigurationError('EDIT_REQUIRES_OBSERVED_EXISTING_VALUE')
        desired[field], expected[field] = change['value'], change['expected']
    selector = 'Top(Filter("Borrowers", [Row ID] = ' + literal(args['row_id']) + '), 2)'
    def read(app):
        result = bridge.client(bridge.authorize(), app).find('Borrowers', selector)
        if len(result) != 1 or result[0].get('Row ID') != args['row_id']:
            raise ConfigurationError('CROSS_APP_RECORD_MISSING')
        return result[0]
    before = {app: read(app) for app in ('oltp', 'olap')}
    # R011 keeps Borrower Note operational-only; the OLAP app does not expose it.
    def exposed(app, field):
        return not (app == 'olap' and field == 'Borrower Note' and field not in before[app])
    if any(any(k not in row or (row.get(k) or '') != v for k, v in expected.items() if exposed(app,k))
           for app, row in before.items()):
        raise ConfigurationError('RECORD_CHANGED_OR_CROSS_APP_MISMATCH')
    if desired == expected:
        return {'edit_verified': True, 'row_id': args['row_id'], 'changes': desired, 'already_matches': True}
    db = bridge.store.db
    db.execute('''CREATE TABLE IF NOT EXISTS conversation_edits (
      id TEXT PRIMARY KEY, message_id TEXT NOT NULL UNIQUE, row_id TEXT NOT NULL,
      expected TEXT NOT NULL, desired TEXT NOT NULL, state TEXT NOT NULL)''')
    db.commit()
    # Preserve unresolved outcomes across *new* messages too, not only duplicate events.
    if db.execute("SELECT 1 FROM conversation_edits WHERE row_id=? AND state='UNKNOWN'", (args['row_id'],)).fetchone():
        raise ConfigurationError('PRIOR_EDIT_UNCERTAIN_RECONCILE_FIRST')
    key = hashlib.sha256(('edit:' + bridge.message_id).encode()).hexdigest()
    config = bridge.authorize()
    if not config.get('conversation_writes_enabled'):
        raise ConfigurationError('CONVERSATION_WRITES_DISABLED')
    latest = read('oltp')
    if any((latest.get(k) or '') != v for k, v in expected.items()):
        raise ConfigurationError('RECORD_CHANGED_BEFORE_EDIT')
    with db:
        inserted = db.execute('INSERT OR IGNORE INTO conversation_edits VALUES (?,?,?,?,?,?)',
            (key, bridge.message_id, args['row_id'], json.dumps(expected), json.dumps(desired), 'UNKNOWN')).rowcount
    if not inserted:
        raise ConfigurationError('EDIT_ALREADY_ATTEMPTED_NO_REPLAY')
    bridge.possible_write = True
    try:
        writer(config, {'Row ID': args['row_id'], **desired})
        for app in ('oltp', 'olap'):
            actual = read(app)
            if any(k not in actual or (actual.get(k) or '') != v for k, v in desired.items() if exposed(app,k)):
                raise ConfigurationError('CROSS_APP_EDIT_READBACK_MISMATCH')
            if app == 'olap' and 'Borrower Note' in desired and not exposed(app,'Borrower Note'):
                if any(actual.get(k) != v for k,v in before[app].items() if k in EDITABLE and k not in desired):
                    raise ConfigurationError('OLAP_BORROWER_CHANGED_DURING_NOTE_EDIT')
    except Exception:
        raise ConfigurationError('EDIT_OUTCOME_UNCERTAIN_NO_REPLAY') from None
    with db:
        db.execute("UPDATE conversation_edits SET state='VERIFIED' WHERE id=?", (key,))
    bridge.write_verified = True
    bridge.cache.clear()
    return {'edit_verified': True, 'row_id': args['row_id'], 'changes': desired,
            'fields_verified': {app: [k for k in desired if exposed(app,k)] for app in ('oltp','olap')},
            'limitation': 'Borrower Note is verified in OLTP only; OLAP does not expose this field.'
                if 'Borrower Note' in desired and not exposed('olap','Borrower Note') else None}
