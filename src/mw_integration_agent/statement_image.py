"""Deterministic PNG financial statements; Thai shaping uses Pillow/RAQM."""
from __future__ import annotations

import math
import unicodedata
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, features

from .config import ConfigurationError

LABELS = {
 'English': ['Daily statement', 'Opening balance', 'Money in', 'Money out',
  'Net movement', 'Closing balance', 'Transactions', 'Posted time', 'Transaction / counterparty',
  'Amount', 'Balance', 'No transactions in this period', 'Brought forward', 'Carried forward',
  'Posting time • Asia/Bangkok (UTC+07:00) • THB', 'Page', 'Effective date'],
 'ไทย': ['รายการเดินบัญชีประจำวัน', 'ยอดยกมา', 'เงินเข้า', 'เงินออก',
  'เงินเคลื่อนไหวสุทธิ', 'ยอดคงเหลือปิดงวด', 'จำนวนรายการ', 'เวลาบันทึก', 'รายการ / ผู้เกี่ยวข้อง',
  'จำนวนเงิน', 'ยอดคงเหลือ', 'ไม่มีรายการในช่วงเวลานี้', 'ยอดยกมาจากหน้าก่อน', 'ยอดยกไปหน้าถัดไป',
  'ตามเวลาบันทึก • เวลาไทย (UTC+07:00) • บาท', 'หน้า', 'วันที่มีผล'],
}
TYPES = {
 'FIRST_DAY_PAYMENT': ('First-day payment','ชำระเงินวันแรก'),
 'LOAN_PAYMENT': ('Loan payment','รับชำระเงินกู้'),
 'LOAN_DISBURSEMENT': ('Loan disbursement','จ่ายเงินกู้'),
 'REFERRAL_REBATE': ('Referral rebate','ค่าตอบแทนผู้แนะนำ'),
 'BUSINESS_EXPENSE': ('Business expense','ค่าใช้จ่ายธุรกิจ'),
 'PARTNER_SETTLEMENT': ('Partner settlement','ชำระบัญชีหุ้นส่วน'),
 'ACCOUNT_TRANSFER': ('Account transfer','โอนระหว่างบัญชี'),
 'CASH_TRANSFER': ('Cash transfer','ส่งมอบเงินสด'),
 'EXPENSE_REIMBURSEMENT': ('Expense reimbursement','คืนเงินค่าใช้จ่าย'),
 'OPENING_BALANCE': ('Opening balance','ยอดตั้งต้น'),
 'MANUAL_CORRECTION': ('Manual correction','ปรับปรุงรายการ'),
 'OTHER': ('Other movement','รายการอื่น'),
}


def money(value):
    rounded = Decimal(str(value)).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
    return f'{abs(rounded) if rounded == 0 else rounded:,.0f}'


def render(report, account, language, directory, font_path='/usr/share/fonts/truetype/tlwg/Garuda.ttf'):
    if language not in LABELS:
        raise ConfigurationError('Unsupported Partner language')
    if not features.check('raqm'):
        raise ConfigurationError('Thai text shaping (RAQM) is required')
    labels = LABELS[language]
    thai = language == 'ไทย'
    fonts = {s: ImageFont.truetype(font_path, s, layout_engine=ImageFont.Layout.RAQM) for s in (22,24,27,32,40)}
    for left,right in [('0','1'),('A','B'),('ก','ข')]:
        if bytes(fonts[24].getmask(left)) == bytes(fonts[24].getmask(right)):
            raise ConfigurationError('Statement font is missing required Latin/Thai glyphs')
    measuring = ImageDraw.Draw(Image.new('RGB',(1,1)))
    # Packaged, owner-supplied original: reports never fetch branding from Drive.
    try:
        with Image.open(Path(__file__).parent/'assets'/'mw-credit-logo.png') as source_logo:
            logo = source_logo.convert('RGBA')
        logo.thumbnail((100,100),Image.Resampling.LANCZOS)
    except OSError as exc:
        raise ConfigurationError('The locally installed M&W Credit logo is unavailable') from exc

    def wrap(text, width, size=24):
        # Combining marks stay with their base; no ellipsis or silent data truncation.
        clusters = []
        for ch in str(text):
            if unicodedata.combining(ch) and clusters:
                clusters[-1] += ch
            else:
                clusters.append(ch)
        lines, line = [], ''
        for ch in clusters:
            if ch == '\n' or measuring.textlength(line+ch,font=fonts[size]) > width:
                lines.append(line)
                line = '' if ch == '\n' else ch
            else:
                line += ch
        return lines+[line] if line or not lines else lines

    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    rows = account['transactions']
    pages = max(1, math.ceil(len(rows)/16))
    outputs = []
    for page in range(pages):
        selected = rows[page*16:(page+1)*16]
        table_rows = []
        first_balance = account['opening'] if page == 0 else rows[page*16-1]['balance']
        table_rows.append(('',[labels[1] if page == 0 else labels[12]],'',money(first_balance),'boundary'))
        for row in selected:
            label = TYPES.get(row['type'],TYPES['OTHER'])[int(thai)]
            who = {'BORROWER':row.get('borrower_th' if thai else 'borrower_en',''),
                   'ACCOUNT':row.get('other_account',''), 'PARTNER':row.get('partner_name',''),
                   'PAYEE':row.get('counterparty','')}.get(row['kind'],'')
            description = label + (' · '+who if who else '')
            posted = datetime.fromisoformat(row['posted_at'])
            if row.get('effective_date') and row['effective_date'] != posted.date().isoformat():
                description += '\n'+labels[16]+': '+row['effective_date']
            table_rows.append((posted.strftime('%H:%M'),wrap(description,493),
                ('+' if Decimal(str(row['amount'])) > 0 else '')+money(row['amount']),
                money(row['balance']),'in' if Decimal(str(row['amount']))>=0 else 'out'))
        if not selected:
            table_rows.append(('',[labels[11]],'','','empty'))
        final_balance = selected[-1]['balance'] if selected else first_balance
        table_rows.append(('',[labels[5] if page == pages-1 else labels[13]],'',money(final_balance),'boundary'))
        row_heights = [max(78,32*len(r[1])+28) for r in table_rows]
        title_lines = wrap(account['label']+' · '+account['bank']+(' · •••• '+account['last4'] if account.get('last4') else ''),1100,32)
        table_top = 510+44*(len(title_lines)-1)
        height = table_top+sum(row_heights)+130
        image = Image.new('RGB',(1200,height),'#fff7fa')
        draw = ImageDraw.Draw(image)
        def text(x,y,t,size=24,color='#452432',align='left'):
            draw.text((x,y),str(t),font=fonts[size],fill=color,anchor='ra' if align=='right' else 'la',spacing=6)
        draw.rectangle((0,0,1200,16),fill='#D81B60')
        image.paste(logo,(44,34),logo)
        text(168,66,labels[0],40)
        for i,line in enumerate(title_lines):
            text(44,141+44*i,line,32)
        offset = 44*(len(title_lines)-1)
        start = datetime.fromisoformat(report['start'])
        end = datetime.fromisoformat(report['end'])
        text(44,196+offset,start.strftime('%d/%m/%Y  %H:%M')+'  -  '+end.strftime('%d/%m/%Y  %H:%M'),27)
        text(44,236+offset,labels[14],22,'#805767')
        values = [money(account['opening']),money(account['money_in']),money(account['money_out']),
                  money(account['net']),money(account['closing']),str(account['count'])]
        for i,(label,value) in enumerate(zip(labels[1:7],values)):
            x,y = 44+(i%3)*375,289+offset+(i//3)*83
            draw.rounded_rectangle((x,y,x+362,y+73),radius=10,fill='white')
            text(x+15,y+8,label,22,'#805767')
            text(x+15,y+34,value,27,'#15806d' if i==1 else '#b54742' if i==2 else '#452432')
        draw.rounded_rectangle((32,table_top-49,1168,table_top+sum(row_heights)+6),radius=12,fill='white')
        draw.rectangle((32,table_top-49,1168,table_top),fill='#D81B60')
        for x,label in [(48,labels[7]),(208,labels[8])]:
            text(x,table_top-38,label,22,'white')
        text(924,table_top-38,labels[9],22,'white','right')
        text(1152,table_top-38,labels[10],22,'white','right')
        y = table_top
        for row,h in zip(table_rows,row_heights):
            stamp,description,amount,balance,kind = row
            if kind=='boundary':
                draw.rectangle((33,y,1167,y+h),fill='#FCE4EC')
            for j,line in enumerate(stamp.split('\n')):
                text(48,y+17+j*30,line,22,'#805767')
            for j,line in enumerate(description):
                text(208,y+17+j*32,line,24)
            text(924,y+18,amount,24,'#15806d' if kind=='in' else '#b54742','right')
            text(1152,y+18,balance,24,align='right')
            y+=h
            draw.line((44,y,1156,y),fill='#F3CCD9',width=1)
        text(44,y+27,labels[15]+f' {page+1} / {pages}',22,'#805767')
        path = directory / f'page-{page+1:03d}.png'
        image.save(path,optimize=True)
        if path.stat().st_size > 8_000_000:
            raise ConfigurationError('Statement page exceeds Instagram image size limit')
        outputs.append(path)
    return outputs
