"""Default-off shared receipt command transport; uncertain POSTs are never replayed."""
import hashlib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from decimal import Decimal
from datetime import datetime

from .audit import audited
from .config import ConfigurationError
from .receipt_archive import encoded


def validate(config):
    if type(config.get('receipt_payment_api_enabled', False)) is not bool:
        raise ConfigurationError('receipt_payment_api_enabled must be boolean')
    if not config.get('receipt_payment_api_enabled'):
        return
    try:
        if datetime.fromisoformat(config['receipt_payment_api_cutoff']).tzinfo is None:
            raise ValueError()
    except (KeyError, TypeError, ValueError):
        raise ConfigurationError('RECEIPT_PAYMENT_API_CUTOFF_REQUIRED') from None
    environment = config.get('receipt_environment')
    expected = f'https://mw-credit-app-command-{environment}-737787224638.asia-southeast1.run.app'
    if (environment not in ('dev', 'prod') or config.get('receipt_payment_api_audience') != expected
            or config.get('receipt_payment_api_origin') != expected
            or config.get('database_name') != 'loan_manager_' + environment
            or not config.get('receipt_archive_enabled')):
        raise ConfigurationError('UNAPPROVED_RECEIPT_PAYMENT_API')


def request_id(environment, review_id):
    if environment not in ('dev', 'prod') or not isinstance(review_id, str) or not review_id or len(review_id.encode()) > 256:
        raise ConfigurationError('INVALID_RECEIPT_REQUEST_ID')
    raw = bytearray(hashlib.sha256(json.dumps(['mw-credit-agent-receipt-v1', environment, review_id],
                                           ensure_ascii=False, separators=(',', ':')).encode()).digest()[:16])
    raw[6] = (raw[6] & 15) | 64
    raw[8] = (raw[8] & 63) | 128
    return str(uuid.UUID(bytes=bytes(raw)))


def payload(config, review, proposal, asset, automatic):
    validate(config)
    if not config.get('receipt_payment_api_enabled') or not asset or asset['archive_state'] != 'ARCHIVED':
        raise ConfigurationError('ARCHIVED_RECEIPT_API_REQUIRED')
    receipt = proposal['receipt']
    amount = Decimal(str(receipt['amount']))
    if not amount.is_finite() or amount <= 0 or amount != amount.to_integral_value():
        raise ConfigurationError('WHOLE_RECEIPT_AMOUNT_REQUIRED')
    capture = format(Decimal(str(json.loads(asset['source'])['captured_at'])), 'f')
    if '.' in capture:
        capture = capture.rstrip('0').rstrip('.')
    command = dict(schemaVersion=7, requestId=request_id(config['receipt_environment'], review['id']),
                   environment=config['receipt_environment'], reviewId=review['id'],
                   mode='automatic' if automatic else 'reviewed', borrowerId=proposal['borrower']['id'],
                   cashAccountId=receipt['account_id'], amountReceived=str(int(amount)),
                   paymentDate=receipt['date'], transferTime=receipt['time'][:5], bankReference=receipt['reference'],
                   proposalSha256=hashlib.sha256(encoded(proposal).encode()).hexdigest(),
                   archiveEvidence=dict(receiptId=asset['receipt_id'], objectKey=asset['object_key'],
                       generation=str(asset['generation']), rawSha256=asset['raw_sha256'], mimeType=asset['mime_type'],
                       sizeBytes=asset['byte_size'], capturedAt=capture))
    return {'command': command, 'actorPartnerId': review['deciding_partner']}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ConfigurationError('RECEIPT_API_REDIRECT_DENIED')


def call(config, method, request=None, body=None):
    # Disabled configuration cannot silently fall back for a persisted pwa key.
    validate(config)
    if not config.get('receipt_payment_api_enabled'):
        raise ConfigurationError('RECEIPT_PAYMENT_API_DISABLED')
    origin = config['receipt_payment_api_origin']
    if request is not None and not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', request):
        raise ConfigurationError('INVALID_RECEIPT_REQUEST_ID')
    opener = urllib.request.build_opener(NoRedirect())
    until = time.monotonic() + 20
    def remaining():
        return max(0.001, until - time.monotonic())
    metadata = urllib.request.Request('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?'
        + urllib.parse.urlencode({'audience': config['receipt_payment_api_audience'], 'format': 'full'}), headers={'Metadata-Flavor': 'Google'})
    with opener.open(metadata, timeout=remaining()) as response:
        token = response.read(16385).decode()
    if len(token) > 16384 or not re.fullmatch(r'[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', token):
        raise ConfigurationError('INVALID_WORKLOAD_TOKEN')
    headers = {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json',
               'X-MW-Wake-Deadline': str(int((time.time() + remaining()) * 1000))}
    req = urllib.request.Request(origin + '/internal/agent/receipt-payments' + ('/' + request if request else ''),
        method=method, headers=headers, data=None if body is None else json.dumps(body, ensure_ascii=False, separators=(',', ':')).encode())
    try:
        response = opener.open(req, timeout=remaining())
    except urllib.error.HTTPError as error:
        if error.code != 422:
            raise ConfigurationError('RECEIPT_API_OUTCOME_UNCERTAIN') from None
        response = error
    with response:
        raw = response.read(32769)
    if len(raw) > 32768:
        raise ConfigurationError('INVALID_RECEIPT_API_RESPONSE')
    return json.loads(raw)


@audited('receipt_payment', route='shared-command-api', action='INSERT', effect=True)
def submit(config, body):
    result = call(config, 'POST', body=body)
    if result.get('kind') == 'recorded' and result.get('reviewId') != body['command']['reviewId']:
        raise ConfigurationError('RECEIPT_API_REVIEW_CONFLICT')
    return result


def status(config, payment_id, review_id):
    result = call(config, 'GET', request=payment_id.removeprefix('pwa:'))
    if result.get('kind') == 'recorded' and result.get('reviewId') != review_id:
        raise ConfigurationError('RECEIPT_API_REVIEW_CONFLICT')
    return result


def posted(result, payment_id):
    return (result.get('kind') == 'recorded' and result.get('financialMatch') is True
            and result.get('originalOutcome', {}).get('status') == 'posted'
            and result['originalOutcome'].get('paymentId') == payment_id)
