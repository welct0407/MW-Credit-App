import tempfile
import unittest
from pathlib import Path
from PIL import Image, features
from mw_integration_agent.cash_statement import summarize
from mw_integration_agent.statement_image import render

FONT='/usr/share/fonts/truetype/tlwg/Garuda.ttf'


@unittest.skipUnless(Path(FONT).exists() and features.check('raqm'),'Debian Thai renderer required')
class ImageTests(unittest.TestCase):
    def test_long_bilingual_statement_is_paginated_without_dropped_rows(self):
        account={'id':'fixture','label':'Synthetic / ตัวอย่าง','bank':'Demo Bank','last4':'0000',
                 'opening':'10','initialized':True,'transactions':[
                     {'posted_at':f'2026-09-19T12:00:{i:02d}','ledger_id':str(i),'direction':'IN',
                      'amount':'1.25','type':'LOAN_PAYMENT','kind':'BORROWER','borrower_en':'Example',
                      'borrower_th':'ตัวอย่าง'} for i in range(33)]}
        summarize(account)
        self.assertEqual(str(account['closing']),'51.25')
        report={'start':'2026-09-19T06:00:00+07:00','end':'2026-09-20T06:00:00+07:00'}
        with tempfile.TemporaryDirectory() as directory:
            for language in ('English','ไทย'):
                pages=render(report,account,language,Path(directory)/language)
                self.assertEqual(len(pages),3)
                for page in pages:
                    with Image.open(page) as image:
                        self.assertEqual(image.width,1200)
                        self.assertLess(image.height,5000)
                    self.assertLess(page.stat().st_size,8_000_000)

    def test_thai_only_font_is_rejected(self):
        from mw_integration_agent.config import ConfigurationError
        font='/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf'
        if not Path(font).exists():
            self.skipTest('Optional Thai-only regression font not installed')
        with tempfile.TemporaryDirectory() as d, self.assertRaises(ConfigurationError):
            render({}, {}, 'English', d, font)
