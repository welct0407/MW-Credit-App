"""Deterministic receipt rules. No model-supplied identity, SQL or delivery address."""
from __future__ import annotations

import html
import re
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from .business_time import BANGKOK
from .config import ConfigurationError
from .graph_email import valid_email

__all__ = ['BANGKOK', 'ReceiptInvalid', 'username', 'borrower_for', 'account_pattern', 'match_account',
           'validate_receipt', 'recipients', 'summary']


class ReceiptInvalid(ConfigurationError):
    pass


def username(value):
    return str(value or '').strip().lstrip('@').casefold()


def borrower_for(profile, borrowers):
    name = username(profile.get('username'))
    matches = [b for b in borrowers if name and username(b['username']) == name]
    if len(matches) != 1 or matches[0]['enabled'] is not True:
        raise ReceiptInvalid('BORROWER_NOT_UNIQUELY_ENABLED')
    return matches[0]


def account_pattern(value):
    # Preserve every printed mask; never invent hidden digits. Reject other text.
    value = str(value or '').strip().translate(str.maketrans('๐๑๒๓๔๕๖๗๘๙','0123456789'))
    value = re.sub(r'[\s\-().]', '', value).lower()
    value = value.replace('*','x').replace('•','x').replace('●','x')
    return value if re.fullmatch(r'[0-9x]{8,15}', value) else ''


def match_account(numbers, accounts):
    matches = set()
    for number in numbers:
        pattern = account_pattern(number)
        if not pattern or sum(c.isdigit() for c in pattern) < 4:
            continue
        for account in accounts:
            if account['active'] is not True:
                continue
            for field in ('number', 'alternative'):
                candidate = account_pattern(account.get(field))
                if candidate and 'x' not in candidate and len(candidate) == len(pattern) and all(
                    a == 'x' or a == b for a,b in zip(pattern,candidate)
                ):
                    matches.add(account['id'])
    if len(matches) != 1:
        raise ReceiptInvalid('RECIPIENT_UNKNOWN_OR_AMBIGUOUS')
    return next(a for a in accounts if a['id'] in matches)


THAI_BAHT = ('', 'THB', 'BAHT', 'บาท', '฿')


def validate_receipt(value, accounts, today=None):
    if value.get('is_payment_receipt') is not True:
        raise ReceiptInvalid('NOT_PAYMENT_RECEIPT')
    if value.get('transfer_successful') is not True:
        raise ReceiptInvalid('TRANSFER_NOT_CONFIRMED')
    today = today or datetime.now(BANGKOK).date()
    try:
        receipt_date = date.fromisoformat(value['date'])
    except (KeyError,ValueError,TypeError) as exc:
        raise ReceiptInvalid('DATE_UNREADABLE') from exc
    if receipt_date not in {today,today-timedelta(days=1)}:
        raise ReceiptInvalid('DATE_OUTSIDE_TODAY_YESTERDAY')
    clock=value.get('time')
    if (not isinstance(clock,str) or not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?',clock)):
        raise ReceiptInvalid('RECEIPT_TIME_UNREADABLE')
    clock=clock[:5]
    receipt_timestamp=f'{receipt_date.isoformat()}T{clock}+07:00'
    try:
        text = value['amount']
        # A correctly grouped thousands comma ("5,000.00", "1,234,567.89") is accepted; "5,00" or "1,2345" are not.
        if isinstance(text, str) and re.fullmatch(r'\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?', text):
            text = text.replace(',', '')
        if not isinstance(text, str) or not re.fullmatch(r'\d{1,12}(?:\.\d{1,2})?', text):
            raise ValueError()
        amount = Decimal(text)
        if amount <= 0:
            raise ValueError()
    except (KeyError,InvalidOperation,ValueError,TypeError) as exc:
        raise ReceiptInvalid('AMOUNT_UNREADABLE') from exc
    # A printed Thai-baht word or sign is THB (models sometimes return 'Baht' instead of the ISO code).
    if ' '.join(str(value.get('currency') or '').split()).upper() not in THAI_BAHT:
        raise ReceiptInvalid('EXPLICIT_NON_THB_CURRENCY')
    reference = re.sub(r'[\s-]','', str(value.get('reference') or '')).upper()
    if not re.fullmatch(r'[A-Z0-9]{6,100}',reference):
        raise ReceiptInvalid('REFERENCE_UNREADABLE')
    # Every printed number (sender and recipient); exactly one of our active accounts must fit. The
    # 'recipient_numbers' fallback reads journal rows extracted before R086 and is removed in a later release.
    numbers = value.get('account_numbers', value.get('recipient_numbers'))
    if not isinstance(numbers,list) or not 1 <= len(numbers) <= 5 or any(not isinstance(n,str) for n in numbers):
        raise ReceiptInvalid('RECIPIENT_UNREADABLE')
    account = match_account(numbers,accounts)
    return {'date':receipt_date.isoformat(),'time':clock,'timestamp':receipt_timestamp,
            'payment_fields':{'Payment Date':receipt_date.isoformat(),'Created At':receipt_date.isoformat()+' '+clock},
            'amount':f'{amount:.2f}',
            'reference':reference,'account_id':account['id'],'account_label':account['label']}


def recipients(partners):
    # Owner selected all Partners' Email + Language Preference; IG opt-in is irrelevant here.
    grouped = {}
    for p in partners:
        email = str(p.get('email') or '').strip().lower()
        if not valid_email(email):
            continue
        if p.get('language') not in ('English','ไทย'):
            raise ReceiptInvalid('PARTNER_LANGUAGE_UNSUPPORTED')
        item = grouped.setdefault(email, {'email':email,'languages':set(),'partner_ids':[]})
        item['languages'].add(p['language'])
        item['partner_ids'].append(p['id'])
    if not grouped:
        raise ReceiptInvalid('NO_PARTNER_EMAIL')
    return [{**v,'languages':sorted(v['languages']),'partner_ids':sorted(v['partner_ids'])}
            for _,v in sorted(grouped.items())]


def summary(receipt, borrower, languages):
    blocks=[]
    # Older accepted records retain their original evidence; never synthesize a missing time.
    when=html.escape(receipt['date']+' '+receipt['time'][:5]+' (UTC+07:00)' if receipt.get('time') else receipt['date'])
    for language in languages:
        name=borrower.get('name_th' if language=='ไทย' else 'name_en') or borrower['id']
        name, account, reference = map(html.escape,(name,receipt['account_label'],receipt['reference']))
        amount=f"{Decimal(receipt['amount']):,.2f}"
        if language=='ไทย':
            blocks.append(f'<p>ได้รับสลิปการชำระเงินจาก {name} จำนวน {amount} บาท เข้าบัญชี {account}</p>'
                          f'<p>วันเวลาตามสลิป: {when} · เลขอ้างอิง: {reference}</p>'
                          '<p>ผ่านการตรวจสอบเบื้องต้นแล้ว ยังไม่ได้สร้างรายการชำระเงิน กรุณาตรวจสอบยอดเข้าบัญชี</p>')
        else:
            blocks.append(f'<p>Received a payment receipt from {name} for {amount} baht into {account}.</p>'
                          f'<p>Receipt date/time: {when} · Reference: {reference}</p>'
                          '<p>Basic receipt checks passed. No payment record has been created. Please verify the bank credit.</p>')
    subject='สรุปสลิปการชำระเงิน' if languages==['ไทย'] else 'Payment receipt summary'
    return subject,'<hr>'.join(blocks)
