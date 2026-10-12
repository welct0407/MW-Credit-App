"""Reviewed native capabilities; no AppSheet export or application-ID dependency."""
from .config import ConfigurationError

# Authority boundaries, not a catalogue of supported business operations.
PROTECTED_TABLES = {'Partners', 'Cash Accounts', 'Cash Holders', 'Statistics'}
PROTECTED_FIELDS = {'IG Receipt ID', 'Receipt Image', 'Receipt Received At',
                    'Instagram Username', 'AI Collection Enabled', 'IG Integration Enabled',
                    'AI Reviewer', 'Login Email', 'Email', 'Language Preference'}
ACTOR_FIELDS = {'Created By', 'Closed By', 'Updated By', 'Cancelled By', 'Voided By'}


def load_schema(config):
    from .conversation_api import call
    partner = config.get('_conversation_partner_id')
    if not isinstance(partner, str) or not partner:
        raise ConfigurationError('AUTHENTICATED_PARTNER_REQUIRED')
    schema = {'format': 2, 'apps': {}}
    for scope in ('oltp', 'olap'):
        status, result = call(config, 'catalogue', {'version': 1, 'actorPartnerId': partner,
                             'scope': scope, 'resource': None})
        if status != 200 or result.get('manifestSha256') != config.get('conversation_api_manifest_sha256'):
            raise ConfigurationError('REVIEWED_NATIVE_SCHEMA_REQUIRED')
        tables = {}
        for resource in result.get('resources', []):
            if resource.get('scope') != scope or resource.get('resource') in tables:
                raise ConfigurationError('INVALID_NATIVE_SCHEMA')
            columns = {field['name']: {'Type': field['sourceType'], 'nativeStatus': field['nativeStatus'],
                       'nativeWriteActions': field['legacyWriteActions'], 'native': field}
                       for field in resource['fields']}
            tables[resource['resource']] = {'key': resource['key'], 'permission': resource['legacyPermission'],
                'columns': columns, 'native': True, 'mutationProtected': resource['mutationProtected'],
                'defaults': result.get('defaults',{}).get(resource['resource'],{}), 'context': result.get('context',{})}
        if not tables:
            raise ConfigurationError('INVALID_NATIVE_SCHEMA')
        schema['apps'][scope] = {'version': result['manifestSha256'], 'tables': tables}
    return schema


def table_schema(schema, app, table):
    try:
        return schema['apps'][app]['tables'][table]
    except (KeyError, TypeError):
        raise ConfigurationError('UNKNOWN_APP_OR_TABLE') from None


def writable(table, definition, field, action):
    if table in PROTECTED_TABLES or field in PROTECTED_FIELDS or field in ACTOR_FIELDS:
        return False
    c = definition['columns'].get(field)
    if definition.get('native'):
        return bool(c and field != definition['key'] and action in c.get('nativeWriteActions', []))
    if not c or field == definition['key'] or c.get('Virtual?') != 'No':
        return False
    if c.get('App formula') or c.get('Formula') or c.get('Spreadsheet formula'):
        return False
    if action == 'Add':
        return c.get('Read-Only') == 'No' and c.get('Editable Initial Value?') == 'Yes'
    return c.get('Read-Only') == 'No'
