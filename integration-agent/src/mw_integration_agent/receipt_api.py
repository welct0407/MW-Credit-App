"""Default-off shared receipt command transport; uncertain POSTs are never replayed."""
import hashlib
import json
import re
import time
import urllib.error
import urllib.parse
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


PRINCIPAL_KEYS = ('loanId', 'kind', 'chargeId', 'chargeDate', 'amount', 'accruedInterest', 'principalDue')
# R118 agent schemaVersion 10: the 8-key line (manual command v11) with the late charge and its expected remaining.
LINE_KEYS = ('chargeId', 'principal', 'interest', 'lateCharge', 'expectedPrincipalRemaining', 'expectedInterestRemaining',
             'expectedLateChargeRemaining', 'chargeDate')
MATERIALIZE_KEYS = ('loanId', 'chargeId', 'chargeDate', 'principalDue', 'interestDue')


def payload(config, review, proposal, asset, automatic, plan=None):
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
    if proposal.get('action') == 'Pay forward options':
        # R112 schemaVersion 9 = 8 plus the Reviewer's purpose and the server plan's explicit lines for it, in the
        # manual v10 shapes; the request id stays the slip's (one slip, one key: a later other purpose conflicts).
        # R118 schemaVersion 10 = 9 with 8-key lines (the server plan's lines carry the late charge).
        if automatic or not isinstance(plan, dict) or not isinstance(plan.get('purpose'), dict):
            raise ConfigurationError('PAY_FORWARD_PLAN_REQUIRED')
        purpose = plan['purpose']
        command = {**{k: v for k, v in command.items() if k not in ('proposalSha256', 'archiveEvidence')}, 'schemaVersion': 10,
                   'payerLines': lines,
                   'purpose': {'forward': purpose['forward'], 'principal': [{'loanId': p['loanId'], 'amount': p['amount']} for p in purpose['principal']], 'loans': None},
                   'allocations': [{k: line.get(k, '0') if k in ('lateCharge', 'expectedLateChargeRemaining') else line[k] for k in LINE_KEYS} for line in plan['allocations']],
                   'materialize': [{k: entry[k] for k in MATERIALIZE_KEYS} for entry in plan['materialize']],
                   'principal': [{k: entry[k] for k in PRINCIPAL_KEYS} for entry in plan['principal']],
                   'proposalSha256': command['proposalSha256'], 'archiveEvidence': command['archiveEvidence']}
    elif plan is not None:
        raise ConfigurationError('PAY_FORWARD_PLAN_UNEXPECTED')
    elif lines is not None:
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


def call(config, method, request=None, body=None, route='receipt-payments', answered=(422,)):
    # Disabled configuration cannot silently fall back for a persisted pwa key.
    validate(config)
    if not config.get('receipt_payment_api_enabled'):
        raise ConfigurationError('RECEIPT_PAYMENT_API_DISABLED')
    origin = config['receipt_payment_api_origin']
    if request is not None and not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', request):
        raise ConfigurationError('INVALID_RECEIPT_REQUEST_ID')
    if route not in ('receipt-payments', 'loan-closes') and not route.startswith('loan-closes/quote/'):
        raise ConfigurationError('INVALID_RECEIPT_API_ROUTE')
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
    req = urllib.request.Request(origin + '/internal/agent/' + route + ('/' + request if request else ''),
        method=method, headers=headers, data=None if body is None else json.dumps(body, ensure_ascii=False, separators=(',', ':')).encode())
    try:
        response = opener.open(req, timeout=remaining())
    except urllib.error.HTTPError as error:
        if error.code in (401, 403):
            raise NotSent('RECEIPT_API_NOT_SENT_' + str(error.code)) from None
        if error.code not in answered:
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


# R128: the Loan Close an approved Instagram receipt review posts (switch loan_close_execution_enabled). The command is the
# PWA's contract-2 loan.close through the shared command service's reviewed-only agent route, under its own request id
# namespace; the same NotSent / uncertain / audited semantics as the receipt payment, reconciled by status only.
HEX64 = re.compile(r'[0-9a-f]{64}')
WHOLE = re.compile(r'[1-9][0-9]{0,16}')


def close_request_id(environment, review_id):
    if environment not in ('dev', 'prod') or not isinstance(review_id, str) or not review_id or len(review_id.encode()) > 256:
        raise ConfigurationError('INVALID_RECEIPT_REQUEST_ID')
    return uuid_from_sha256(['mw-credit-agent-loan-close-v1', environment, review_id])


def close_notes(review_id):
    return 'Approved Instagram receipt review igr:' + review_id[:48]


class QuoteRefused(ConfigurationError):
    """The server answered that this loan has no Loan Close quote now (404 not found, 422 the loan cannot close)."""


def close_quote(config, loan_id):
    """The server's Loan Close quote for today (read only): sourceVersion, businessDate, amount, planHash, the R118 parts and
    the referral rebate. QuoteRefused when the server refuses one; any other fault is LOAN_CLOSE_QUOTE_UNAVAILABLE or the
    transport's own error (NotSent passes)."""
    if not isinstance(loan_id, str) or not loan_id or len(loan_id.encode()) > 256:
        raise QuoteRefused('LOAN_CLOSE_QUOTE_REFUSED')
    try:
        quote = call(config, 'GET', route='loan-closes/quote/' + urllib.parse.quote(loan_id, safe=''), answered=(404, 422))
    except NotSent:
        raise
    except ConfigurationError:
        raise ConfigurationError('LOAN_CLOSE_QUOTE_UNAVAILABLE') from None
    if isinstance(quote, dict) and set(quote) == {'error'}:
        raise QuoteRefused('LOAN_CLOSE_QUOTE_REFUSED')
    try:
        valid = (quote['loanId'] == loan_id and HEX64.fullmatch(quote['sourceVersion']) and HEX64.fullmatch(quote['planHash'])
                 and WHOLE.fullmatch(quote['amount']) and re.fullmatch(r'\d{4}-\d{2}-\d{2}', quote['businessDate'])
                 and (quote.get('rebate') is None or isinstance(quote['rebate'], dict)))
    except (KeyError, TypeError):
        valid = False
    if not valid:
        raise ConfigurationError('LOAN_CLOSE_QUOTE_UNAVAILABLE')
    return quote


def close_payload(config, review, proposal):
    """The reviewed close: the slip's date (today, checked by SQL), account, reference and transfer time, the quote the
    Reviewer approved (version, amount, plan hash) and its rebate path when the close creates a rebate."""
    validate(config)
    if not config.get('receipt_payment_api_enabled'):
        raise ConfigurationError('RECEIPT_PAYMENT_API_DISABLED')
    receipt, close = proposal['receipt'], proposal['close']
    reference, clock = receipt.get('reference'), str(receipt.get('time') or '')[:5]
    if (not isinstance(reference, str) or not reference.strip() or len(reference.encode()) > 256 or re.search(r'[\0\r\n]', reference)
            or not re.fullmatch(r'(?:[01][0-9]|2[0-3]):[0-5][0-9]', clock)):
        raise ConfigurationError('LOAN_CLOSE_SLIP_FACTS_REQUIRED')
    if not WHOLE.fullmatch(str(close['amount'])) or Decimal(str(close['amount'])) != Decimal(str(receipt['amount'])):
        raise ConfigurationError('LOAN_CLOSE_AMOUNT_MISMATCH')
    inputs = dict(paymentDate=receipt['date'], cashAccountId=receipt['account_id'], paymentMethod='Bank Transfer',
                  notes=close_notes(review['id']), expectedAmount=str(close['amount']), expectedPlanHash=close['planHash'],
                  bankReference=reference, transferTime=clock)
    if close.get('rebatePath') is not None:
        inputs['rebatePath'] = close['rebatePath']
    command = dict(requestId=close_request_id(config['receipt_environment'], review['id']), targetId=proposal['loan_id'],
                   expectedVersion=close['sourceVersion'], inputs=inputs, reviewId=review['id'], environment=config['receipt_environment'])
    return {'command': command, 'actorPartnerId': review['deciding_partner']}


@audited('receipt_payment', route='internal', action='INSERT', effect=True, plan=lambda config, body: dict(
    requestId=body['command']['requestId'], reviewId=body['command']['reviewId'], mode='reviewed', operation='loan.close',
    loanId=body['command']['targetId'], factsOutcome='UNCHANGED'))
def submit_close(config, body):
    return call(config, 'POST', body=body, route='loan-closes')


def close_status(config, payment_id):
    return call(config, 'GET', request=payment_id.removeprefix('pwa:'), route='loan-closes')


def close_posted(result, payment_id, loan_id):
    """The recorded close applied this loan's closing payment under the key."""
    outcome = result.get('originalOutcome') if isinstance(result, dict) else None
    applied = outcome.get('result') if isinstance(outcome, dict) else None
    return (isinstance(outcome, dict) and result.get('kind') == 'recorded' and outcome.get('status') == 'applied' and isinstance(applied, dict)
            and applied.get('operation') == 'loan.close' and applied.get('targetId') == loan_id and applied.get('paymentId') == payment_id)
