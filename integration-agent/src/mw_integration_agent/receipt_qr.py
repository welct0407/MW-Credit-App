"""Slip QR transaction reference (R142).

Thai bank slips carry an EMV-style QR: 00{00:"000001" (API id), 01: sending bank code, 02: transaction reference in
its exact case} 51:"TH" 91:CRC16. It holds no amount, name, account or time and proves nothing about authenticity
(anyone can make a valid CRC); it only gives the printed reference without OCR ambiguity (SCB l/I).

The QR is decoded only from the canonical PNG (as a Pillow L image) with zxing-cpp. Exactly one distinct payload
is accepted, and only when it is ASCII, at most 512 characters, strict TLV, tag 91 last with a CRC16-CCITT-FALSE
over everything through '9104', 51 == 'TH', 00.00 == '000001' and 00.02 [A-Za-z0-9]{6,100}. Anything else,
including a decoder failure or a missing decoder, is "no QR" and never fails recognition.

The QR reference replaces the model's only when the sending bank code (00.01) is allowlisted
(receipt_qr_reference_banks, default 002 BBL, 004 KBank, 006 KTB, 014 SCB, 030 GSB): on the real slips their QR
reference equals the printed one, or is right where OCR misread l/I, while a TrueMoney wallet slip (025) carries
another identifier. The audit trace names the bank code only, never the reference.
"""
import io
import re

from PIL import Image

try:
    import zxingcpp
except ImportError:  # the pinned closure installs it; without it every slip simply has no QR reference
    zxingcpp = None

LIMIT = 512
REFERENCE = re.compile(r'[A-Za-z0-9]{6,100}')
DIGITS = re.compile(r'[0-9]{2}')
HEX4 = re.compile(r'[0-9A-Fa-f]{4}')
BANK = re.compile(r'[0-9]{3}')
DEFAULT_BANKS = ('002', '004', '006', '014', '030')
MAX_BANKS = 20


def banks(config):
    """The allowlisted sending bank codes: receipt_qr_reference_banks, 0..20 distinct three-digit strings (absent: the default)."""
    value = config.get('receipt_qr_reference_banks', list(DEFAULT_BANKS))
    if (not isinstance(value, list) or len(value) > MAX_BANKS or len(set(map(str, value))) != len(value)
            or not all(isinstance(code, str) and BANK.fullmatch(code) for code in value)):
        from .config import ConfigurationError
        raise ConfigurationError('receipt_qr_reference_banks must list at most 20 distinct three-digit bank codes')
    return frozenset(value)


def crc16(text):
    """CRC16-CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflection, no final xor) as four uppercase hex digits."""
    value = 0xFFFF
    for byte in text.encode('ascii'):
        value ^= byte << 8
        for _ in range(8):
            value = ((value << 1) ^ 0x1021 if value & 0x8000 else value << 1) & 0xFFFF
    return f'{value:04X}'


def fields(text):
    """Strict TLV: two-digit tag, two-digit length, value; no duplicate tag, nothing left over. (dict, order) or None."""
    found, order, at = {}, [], 0
    while at < len(text):
        tag, size = text[at:at + 2], text[at + 2:at + 4]
        if not DIGITS.fullmatch(tag) or not DIGITS.fullmatch(size) or tag in found:
            return None
        value = text[at + 4:at + 4 + int(size)]
        if len(value) != int(size):
            return None
        found[tag], at = value, at + 4 + int(size)
        order.append(tag)
    return (found, order) if order else None


def reference_of(payload):
    """(bank code or None, transaction reference) of a valid slip payload, else None."""
    if not isinstance(payload, str) or not payload or len(payload) > LIMIT or not payload.isascii():
        return None
    top = fields(payload)
    if top is None:
        return None
    values, order = top
    if order[-1] != '91' or not HEX4.fullmatch(values['91']) or crc16(payload[:-4]) != values['91'].upper():
        return None
    if values.get('51') != 'TH' or '00' not in values:
        return None
    inner = fields(values['00'])
    if inner is None:
        return None
    inner = inner[0]
    if inner.get('00') != '000001' or not isinstance(inner.get('02'), str) or not REFERENCE.fullmatch(inner['02']):
        return None
    bank = inner.get('01')
    return (bank if isinstance(bank, str) and BANK.fullmatch(bank) else None), inner['02']


def payloads(image_data):
    """The distinct QR texts of the canonical PNG. Raises on any decoder problem (the caller treats it as no QR)."""
    if zxingcpp is None:
        raise RuntimeError('decoder unavailable')
    with Image.open(io.BytesIO(image_data)) as source:
        image = source.convert('L')
    found = zxingcpp.read_barcodes(image, formats=zxingcpp.BarcodeFormat.QRCode)
    return {barcode.text for barcode in found if barcode.valid}


def read(image_data):
    """(status, (bank, reference) or None): status 'none', 'invalid', 'error' or 'valid'."""
    try:
        texts = payloads(image_data)
    except Exception:
        return 'error', None
    if not texts:
        return 'none', None
    if len(texts) != 1:
        return 'invalid', None
    found = reference_of(next(iter(texts)))
    return ('valid', found) if found else ('invalid', None)


def apply(result, image_data, config=None):
    """The result with an allowlisted valid QR reference in place of the model's (exact case), and the audit trace.

    trace: reference_source 'qr' or 'model'; qr {bank, used, reason}: reason 'same' or 'replaced' (used), or
    'bank_not_allowlisted', 'none', 'invalid', 'error' (not used). Never the reference itself.
    """
    allowed = banks(config or {})
    status, found = read(image_data)
    if status != 'valid':
        return result, {'reference_source': 'model', 'qr': {'bank': None, 'used': False, 'reason': status}}
    bank, reference = found
    if bank not in allowed:
        return result, {'reference_source': 'model', 'qr': {'bank': bank, 'used': False, 'reason': 'bank_not_allowlisted'}}
    reason = 'same' if result.get('reference') == reference else 'replaced'
    return {**result, 'reference': reference}, {'reference_source': 'qr', 'qr': {'bank': bank, 'used': True, 'reason': reason}}
