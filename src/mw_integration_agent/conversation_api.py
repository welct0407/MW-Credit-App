"""Bounded native machine transport. One attempt; no AppSheet or SQL fallback."""
import json
import hashlib
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from .config import ConfigurationError
from .receipt_api import NoRedirect


def request_id(environment, message_id, operation_key):
    """New attempts only; legacy operation/target keys are never reinterpreted."""
    if (environment not in ('dev','prod') or not isinstance(message_id,str) or not message_id
            or len(message_id.encode())>2048 or not isinstance(operation_key,str)
            or not re.fullmatch('[A-Za-z0-9_-]{1,64}',operation_key)):
        raise ConfigurationError('INVALID_NATIVE_OPERATION_IDENTITY')
    raw=bytearray(hashlib.sha256(json.dumps(['mw-credit-agent-conversation-v1',environment,message_id,operation_key],
                 ensure_ascii=False,separators=(',',':')).encode()).digest()[:16])
    raw[6]=(raw[6]&15)|64;raw[8]=(raw[8]&63)|128
    return str(uuid.UUID(bytes=bytes(raw)))


def validate(config):
    if type(config.get('conversation_api_enabled', False)) is not bool:
        raise ConfigurationError('conversation_api_enabled must be boolean')
    if not config.get('conversation_api_enabled'):
        return
    environment = config.get('conversation_api_environment')
    origin = f'https://mw-credit-app-command-{environment}-737787224638.asia-southeast1.run.app'
    if (environment not in ('dev','prod') or config.get('database_name') != 'loan_manager_' + environment
            or config.get('conversation_api_origin') != origin or config.get('conversation_api_audience') != origin
            or not re.fullmatch('[0-9a-f]{64}', str(config.get('conversation_api_manifest_sha256','')))):
        raise ConfigurationError('UNAPPROVED_CONVERSATION_API')


def call(config, route, body=None, request_id=None, opener=None):
    validate(config)
    if not config.get('conversation_api_enabled'):
        raise ConfigurationError('CONVERSATION_API_DISABLED')
    if route not in ('catalogue','query','commands','status'):
        raise ConfigurationError('INVALID_CONVERSATION_API_ROUTE')
    if route == 'status':
        if body is not None or not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',request_id or ''):
            raise ConfigurationError('INVALID_CONVERSATION_REQUEST_ID')
    elif request_id is not None or not isinstance(body,dict):
        raise ConfigurationError('INVALID_CONVERSATION_API_BODY')
    try:
        raw = None if body is None else json.dumps(body,ensure_ascii=False,allow_nan=False,separators=(',',':')).encode()
    except (ValueError,TypeError):
        raise ConfigurationError('INVALID_CONVERSATION_API_BODY') from None
    if raw is not None and len(raw)>524288:
        raise ConfigurationError('CONVERSATION_API_BODY_TOO_LARGE')
    opener = opener or urllib.request.build_opener(NoRedirect())
    until = time.monotonic()+20
    def remaining():
        seconds=until-time.monotonic()
        if seconds<=0:raise ConfigurationError('CONVERSATION_API_OUTCOME_UNCERTAIN')
        return seconds
    metadata=urllib.request.Request('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?'
        +urllib.parse.urlencode({'audience':config['conversation_api_audience'],'format':'full'}),headers={'Metadata-Flavor':'Google'})
    try:
        with opener.open(metadata,timeout=remaining()) as response:
            token=response.read(16385).decode()
        if len(token)>16384 or not re.fullmatch(r'[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',token):
            raise ConfigurationError('INVALID_WORKLOAD_TOKEN')
        path='commands/'+request_id if route=='status' else route
        request=urllib.request.Request(config['conversation_api_origin']+'/internal/agent/'+path,
            data=raw,method='GET' if route=='status' else 'POST',headers={'Authorization':'Bearer '+token,
            'Content-Type':'application/json','X-MW-Wake-Deadline':str(int((time.time()+remaining())*1000))})
        try:
            response=opener.open(request,timeout=remaining())
        except urllib.error.HTTPError as error:
            if error.code not in (400,403,404,409,422):
                raise ConfigurationError('CONVERSATION_API_OUTCOME_UNCERTAIN') from None
            response=error
        with response:
            data=response.read(8388609)
            status=response.status
        if len(data)>8388608:raise ValueError()
        value=json.loads(data)
        if not isinstance(value,dict):raise ValueError()
        return status,value
    except ConfigurationError:
        raise
    except Exception:
        raise ConfigurationError('CONVERSATION_API_OUTCOME_UNCERTAIN') from None


def probe(config,scope):
    if scope not in ('oltp','olap'):
        raise ConfigurationError('INVALID_NATIVE_SCOPE')
    partner=config.get('conversation_api_probe_partner_id')
    if not isinstance(partner,str) or not partner:
        raise ConfigurationError('NATIVE_PROBE_PARTNER_REQUIRED')
    status,catalogue=call(config,'catalogue',{'version':1,'actorPartnerId':partner,'scope':scope,'resource':'Partners'})
    if status!=200 or catalogue.get('manifestSha256')!=config.get('conversation_api_manifest_sha256'):
        raise ConfigurationError('NATIVE_CATALOGUE_PROBE_FAILED')
    status,result=call(config,'query',{'version':1,'actorPartnerId':partner,'scope':scope,'resource':'Partners',
                                     'columns':['Row ID'],'predicate':None,'limit':1})
    rows=result.get('rows')
    if status!=200 or not isinstance(rows,list) or len(rows)>1 or any(set(row)!= {'Row ID'} for row in rows):
        raise ConfigurationError('NATIVE_QUERY_PROBE_FAILED')
    return {'authenticated':True,'scope':scope,'count':len(rows),'targetVersion':catalogue['manifestSha256']}


class NativeConversationClient:
    def __init__(self, config, scope):
        if scope not in ('oltp', 'olap'):
            raise ConfigurationError('INVALID_NATIVE_SCOPE')
        self.config, self.scope = config, scope

    def query(self, resource, columns, predicate, limit=1001):
        partner = self.config.get('_conversation_partner_id')
        if not isinstance(partner, str) or not partner:
            raise ConfigurationError('AUTHENTICATED_PARTNER_REQUIRED')
        status, result = call(self.config, 'query', {'version': 1, 'actorPartnerId': partner,
            'scope': self.scope, 'resource': resource, 'columns': columns, 'predicate': predicate, 'limit': limit})
        if (status != 200 or result.get('manifestSha256') != self.config.get('conversation_api_manifest_sha256')
                or not isinstance(result.get('rows'), list) or len(result['rows']) > limit):
            raise ConfigurationError('NATIVE_QUERY_UNAVAILABLE')
        return result['rows']
