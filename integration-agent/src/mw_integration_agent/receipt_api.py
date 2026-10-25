"""Default-off shared receipt command transport; uncertain POSTs are never replayed."""
import hashlib
import json
import re
import time
import urllib.error
import urllib.request
from decimal import Decimal

from .audit import audited
from .config import ConfigurationError, aware_cutoff
from .http import identity_token, opener as http_opener, uuid_from_sha256
from .receipt_archive import encoded


class NotSent(ConfigurationError):
    """The command never reached the API's business path (AGT-SEND-03).

    Only three faults qualify: the identity token could not be fetched or was
    invalid (no request was built), HTTP 401 (answered before the service touches
    its pool) and HTTP 403 (answered only after ROLLBACK with no commit started).
    Everything else after the POST may have left the host stays uncertain.
    """


def validate(config):
    if type(config.get('receipt_payment_api_enabled', False)) is not bool:
        raise ConfigurationError('receipt_payment_api_enabled must be boolean')
    if not config.get('receipt_payment_api_enabled'):
        return
    aware_cutoff(config, 'receipt_payment_api_cutoff', 'RECEIPT_PAYMENT_API_CUTOFF_REQUIRED')
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
    return uuid_from_sha256(['mw-credit-agent-receipt-v1', environment, review_id])


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
    # R095 schemaVersion 8 adds payerLines {before, after}: the payer-lines change the receipt cycle decided (strong
    # context or a resolved weak context; the database writes it only while the column still equals `before`).
    # Without one the command stays version 7, so a database without V111 still accepts it during a rolling deploy.
    lines = payer_lines(receipt)
    if lines is not None:
        command = {**{k: v for k, v in command.items() if k != 'archiveEvidence'}, 'schemaVersion': 8,
                   'payerLines': lines, 'archiveEvidence': command['archiveEvidence']}
    return {'command': command, 'actorPartnerId': review['deciding_partner']}


def payer_lines(receipt):
    """The command's payerLines {before, after}, or None when nothing is learned or the value is not valid."""
    from .payer_name import valid_lines
    value = receipt.get('payer_lines')
    if not isinstance(value, dict) or set(value) != {'before', 'after'}:
        return None
    before, after = value['before'], value['after']
    if before is not None and (not isinstance(before, str) or '\0' in before or len(before.encode('utf-8')) > 65536):
        return None
    if not isinstance(after, str) or after == (before or '') or not valid_lines(after.split('\n')):
        return None
    return {'before': before, 'after': after}


def call(config, method, request=None, body=None):
    # Disabled configuration cannot silently fall back for a persisted pwa key.
    validate(config)
    if not config.get('receipt_payment_api_enabled'):
        raise ConfigurationError('RECEIPT_PAYMENT_API_DISABLED')
    origin = config['receipt_payment_api_origin']
    if request is not None and not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', request):
        raise ConfigurationError('INVALID_RECEIPT_REQUEST_ID')
    opener = http_opener()
    until = time.monotonic() + 20
    def remaining():
        return max(0.001, until - time.monotonic())
    try:
        token = identity_token(config['receipt_payment_api_audience'], opener, remaining())
    except Exception as exc:
        # Classification boundary: without a token no request is built, so nothing was sent.
        raise NotSent('RECEIPT_API_NOT_SENT_TOKEN') from exc
    headers = {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json',
               'X-MW-Wake-Deadline': str(int((time.time() + remaining()) * 1000))}
    req = urllib.request.Request(origin + '/internal/agent/receipt-payments' + ('/' + request if request else ''),
        method=method, headers=headers, data=None if body is None else json.dumps(body, ensure_ascii=False, separators=(',', ':')).encode())
    try:
        response = opener.open(req, timeout=remaining())
    except urllib.error.HTTPError as error:
        if error.code in (401, 403):
            raise NotSent('RECEIPT_API_NOT_SENT_' + str(error.code)) from None
        if error.code != 422:
            raise ConfigurationError('RECEIPT_API_OUTCOME_UNCERTAIN') from None
        response = error
    with response:
        raw = response.read(32769)
    if len(raw) > 32768:
        raise ConfigurationError('INVALID_RECEIPT_API_RESPONSE')
    return json.loads(raw)


# Route `internal`: the V1 audit.events CHECK has no route for the shared command API; service_name
# `receipt_payment` already names the effect. Any other route fails every terminal event (stuck DISPATCHING).
@audited('receipt_payment', route='internal', action='INSERT', effect=True, plan=lambda config, body: dict(
    requestId=body['command']['requestId'], reviewId=body['command']['reviewId'], mode=body['command']['mode'],
    factsOutcome=config.get('_receipt_facts_outcome') or 'UNCHANGED'))
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
