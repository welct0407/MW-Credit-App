"""R142 slip QR reference: strict TLV/CRC payload checks, the bank allowlist and real decoding of synthetic QR images.

Every payload here is synthetic; the QR images are generated in the test with the pinned zxing-cpp.
"""
import unittest
from unittest.mock import patch

import zxingcpp
from PIL import Image, ImageDraw

from mw_integration_agent import receipt_image, receipt_qr
from mw_integration_agent.config import ConfigurationError, validate_config
from mw_integration_agent.receipt_image import canonical_image
from test_receipt_recognition import GEMINI, RESULT, ROOT, load_json


def tlv(tag, value):
    return f'{tag}{len(value):02d}{value}'


def payload(reference='SynAbIl012345', bank='014', api='000001', country='TH', crc=None, extra=''):
    body = tlv('00', tlv('00', api) + tlv('01', bank) + tlv('02', reference)) + extra + tlv('51', country) + '9104'
    return body + (receipt_qr.crc16(body) if crc is None else crc)


def signed(body):
    return body + '9104' + receipt_qr.crc16(body + '9104')


def slip(*texts, size=(900, 1600)):
    """A synthetic slip-sized canonical PNG with each text as a QR code near the bottom."""
    canvas = Image.new('RGB', size, 'white')
    draw = ImageDraw.Draw(canvas)
    for line in range(8):
        draw.text((60, 80 + 60 * line), f'SYNTHETIC LINE {line} 1,500.00', fill='black')
    for number, text in enumerate(texts):
        code = Image.fromarray(zxingcpp.create_barcode(text, zxingcpp.BarcodeFormat.QRCode).to_image(scale=5)).convert('RGB')
        canvas.paste(code, (60 + number * 420, 1050))
    return canonical_image(_png(canvas))[0]


def _png(image):
    import io
    buffer = io.BytesIO(); image.save(buffer, format='PNG')
    return buffer.getvalue()


class PayloadTests(unittest.TestCase):
    def test_crc16_ccitt_false(self):
        self.assertEqual(receipt_qr.crc16('123456789'), '29B1')  # the CRC-16/CCITT-FALSE check value

    def test_valid_payload_gives_bank_and_exact_reference(self):
        self.assertEqual(receipt_qr.reference_of(payload()), ('014', 'SynAbIl012345'))
        self.assertEqual(receipt_qr.reference_of(payload(crc=receipt_qr.crc16(payload()[:-4]).lower())), ('014', 'SynAbIl012345'))
        self.assertEqual(receipt_qr.reference_of(payload(extra=tlv('62', 'X1'))), ('014', 'SynAbIl012345'))  # other tags may appear

    def test_qr_bad_crc_wrong_api_id_missing_th_two_payloads_ignored(self):
        good = payload()
        bad = {'bad crc': payload(crc='0000'), 'api id': payload(api='000002'), 'country': payload(country='US'),
               'no country': tlv('00', tlv('00', '000001') + tlv('02', 'SynAbIl012345')) + '9104',
               'short reference': payload(reference='Ab12'), 'symbol in reference': payload(reference='Syn-1234567'),
               'trailing data': good + '00', 'crc not last': good[:-8] + '9104' + good[-4:] + tlv('62', 'X1'),
               'duplicate tag': signed(tlv('00', tlv('00', '000001') + tlv('02', 'SynAbIl012345')) + tlv('51', 'TH') + tlv('51', 'TH')),
               'duplicate inner tag': signed(tlv('00', tlv('00', '000001') + tlv('02', 'SynAbIl012345') + tlv('02', 'SynAbIl012345')) + tlv('51', 'TH')), 'non ascii': payload(reference='Synthetic\u0e01\u0e02\u0e03', crc='0000'),
               'too long': payload(extra=tlv('62', 'X' * 99) * 5), 'empty': '', 'not tlv': 'https://example.invalid/slip',
               'bad length': '00XX' + good[4:], 'crc not hex': payload(crc='ZZZZ')}
        bad['no country'] += receipt_qr.crc16(bad['no country'])
        for name, text in bad.items():
            with self.subTest(name):
                self.assertIsNone(receipt_qr.reference_of(text))
        image = slip(payload(), payload(reference='SynOther9876'))
        self.assertEqual(receipt_qr.read(image), ('invalid', None))  # two distinct payloads
        self.assertEqual(receipt_qr.apply(dict(RESULT), image), (RESULT, {'reference_source': 'model', 'qr': {'bank': None, 'used': False, 'reason': 'invalid'}}))
        self.assertEqual(receipt_qr.read(slip(payload(crc='0000')))[0], 'invalid')
        self.assertEqual(receipt_qr.read(slip(payload(), payload()))[1], ('014', 'SynAbIl012345'))  # one distinct payload twice


class DecodeTests(unittest.TestCase):
    def test_qr_valid_replaces_reference_exact_case(self):
        image = slip(payload(reference='SynAbIl012345'))
        result, trace = receipt_qr.apply({**RESULT, 'reference': 'SYNABLL012345'}, image)
        self.assertEqual(result, {**RESULT, 'reference': 'SynAbIl012345'})
        self.assertEqual(trace, {'reference_source': 'qr', 'qr': {'bank': '014', 'used': True, 'reason': 'replaced'}})
        result, trace = receipt_qr.apply({**RESULT, 'reference': 'SynAbIl012345'}, image)
        self.assertEqual(trace['qr'], {'bank': '014', 'used': True, 'reason': 'same'})
        self.assertNotIn('SynAbIl012345', str(trace))  # the audit trace never carries the reference
        # Through recognize, only when asked; any provider.
        with patch('mw_integration_agent.receipt_provider_gemini.extract', return_value={**RESULT, 'reference': 'SYNABLL012345'}):
            self.assertEqual(receipt_image.recognize(GEMINI, image, 'gemini'), {'provider': 'gemini', 'model': 'gemini-2.0-flash-001',
                                                                                 'result': {**RESULT, 'reference': 'SYNABLL012345'}})
            value = receipt_image.recognize(GEMINI, image, 'gemini', qr_reference=True)
        self.assertEqual((value['result']['reference'], value['reference_source'], value['qr']['reason']), ('SynAbIl012345', 'qr', 'replaced'))

    def test_qr_bank_not_allowlisted_keeps_model_reference(self):
        image = slip(payload(reference='SynWallet0123456789012345', bank='025'))
        result, trace = receipt_qr.apply(dict(RESULT), image)
        self.assertEqual(result, RESULT)
        self.assertEqual(trace, {'reference_source': 'model', 'qr': {'bank': '025', 'used': False, 'reason': 'bank_not_allowlisted'}})
        for bank in receipt_qr.DEFAULT_BANKS:
            with self.subTest(bank=bank):
                self.assertTrue(receipt_qr.apply(dict(RESULT), slip(payload(bank=bank)))[1]['qr']['used'])

    def test_custom_bank_allowlist_is_honored(self):
        wallet, scb = slip(payload(bank='025')), slip(payload(bank='014'))
        config = {'receipt_qr_reference_banks': ['025']}
        self.assertEqual(receipt_qr.apply(dict(RESULT), wallet, config)[1]['qr'], {'bank': '025', 'used': True, 'reason': 'replaced'})
        self.assertEqual(receipt_qr.apply(dict(RESULT), scb, config)[1]['qr'], {'bank': '014', 'used': False, 'reason': 'bank_not_allowlisted'})
        self.assertFalse(receipt_qr.apply(dict(RESULT), scb, {'receipt_qr_reference_banks': []})[1]['qr']['used'])
        with patch('mw_integration_agent.receipt_provider_gemini.extract', return_value=dict(RESULT)):
            self.assertEqual(receipt_image.recognize({**GEMINI, **config}, wallet, 'gemini', qr_reference=True)['result']['reference'], 'SynAbIl012345')
        example = load_json(ROOT / 'config.example.json')
        self.assertEqual(example['receipt_qr_reference_banks'], list(receipt_qr.DEFAULT_BANKS))
        validate_config({**example, 'receipt_qr_reference_banks': ['025', '014']})
        for bad in ('014', ['14'], ['0140'], ['014', '014'], [14], [str(n).zfill(3) for n in range(21)], None):
            with self.subTest(bad=bad), self.assertRaises(ConfigurationError):
                validate_config({**example, 'receipt_qr_reference_banks': bad})

    def test_no_qr_keeps_model_reference(self):
        image = slip()
        self.assertEqual(receipt_qr.read(image), ('none', None))
        self.assertEqual(receipt_qr.apply(dict(RESULT), image), (RESULT, {'reference_source': 'model', 'qr': {'bank': None, 'used': False, 'reason': 'none'}}))
        other = slip('https://example.invalid/not-a-slip')
        self.assertEqual(receipt_qr.apply(dict(RESULT), other)[1]['qr']['reason'], 'invalid')

    def test_decoder_exception_is_no_qr(self):
        image = slip(payload())
        with patch.object(receipt_qr.zxingcpp, 'read_barcodes', side_effect=RuntimeError('decoder crashed')):
            self.assertEqual(receipt_qr.apply(dict(RESULT), image), (RESULT, {'reference_source': 'model', 'qr': {'bank': None, 'used': False, 'reason': 'error'}}))
        with patch.object(receipt_qr, 'zxingcpp', None):
            self.assertEqual(receipt_qr.read(image), ('error', None))
        self.assertEqual(receipt_qr.read(b'not an image'), ('error', None))
        # Recognition still succeeds with the model's reference.
        with patch('mw_integration_agent.receipt_provider_gemini.extract', return_value=dict(RESULT)), \
                patch.object(receipt_qr.zxingcpp, 'read_barcodes', side_effect=MemoryError()):
            value = receipt_image.recognize(GEMINI, image, 'gemini', qr_reference=True)
        self.assertEqual((value['result'], value['qr']['reason']), (RESULT, 'error'))


if __name__ == '__main__':
    unittest.main()
