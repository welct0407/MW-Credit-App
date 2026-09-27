"""App metadata, independent of any particular business request or workflow."""
import hashlib
import json
from pathlib import Path
from .config import ConfigurationError

# Authority boundaries, not a catalogue of supported business operations.
PROTECTED_TABLES = {'Partners', 'Cash Accounts', 'Cash Holders', 'Statistics'}
PROTECTED_FIELDS = {'IG Receipt ID', 'Receipt Image', 'Receipt Received At',
                    'Instagram Username', 'AI Collection Enabled', 'IG Integration Enabled',
                    'AI Reviewer', 'Login Email', 'Email', 'Language Preference'}
ACTOR_FIELDS = {'Created By', 'Closed By', 'Updated By', 'Cancelled By', 'Voided By'}


def load_schema(config):
    path = Path(config.get('conversation_schema_file', '/etc/mw-integration-agent/appsheet-schema.json'))
    try:
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != config.get('conversation_schema_sha256'):
            raise ValueError('digest')
        schema = json.loads(data)
        if schema['format'] != 1:
            raise ValueError('format')
        for app, key in [('oltp','appsheet_app_id'),('olap','appsheet_olap_app_id')]:
            if schema['apps'][app]['app_id'] != config.get(key):
                raise ValueError('identity')
        return schema
    except (OSError, ValueError, KeyError, TypeError):
        raise ConfigurationError('REVIEWED_APP_SCHEMA_REQUIRED') from None


def table_schema(schema, app, table):
    try:
        return schema['apps'][app]['tables'][table]
    except (KeyError, TypeError):
        raise ConfigurationError('UNKNOWN_APP_OR_TABLE') from None


def writable(table, definition, field, action):
    if table in PROTECTED_TABLES or field in PROTECTED_FIELDS or field in ACTOR_FIELDS:
        return False
    c = definition['columns'].get(field)
    if not c or field == definition['key'] or c.get('Virtual?') != 'No':
        return False
    if c.get('App formula') or c.get('Formula') or c.get('Spreadsheet formula'):
        return False
    if action == 'Add':
        return c.get('Read-Only') == 'No' and c.get('Editable Initial Value?') == 'Yes'
    return c.get('Read-Only') == 'No'
