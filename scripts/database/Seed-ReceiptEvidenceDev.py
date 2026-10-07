"""Owner-authorized synthetic DEV receipt demo, using the real attachment function."""
import hashlib
import json
from pathlib import Path
import subprocess
import uuid
from datetime import datetime, timezone
import psycopg
from psycopg.types.json import Jsonb
from PIL import Image, ImageDraw, ImageFont

root=Path(__file__).resolve().parents[2];out=root/'outputs/r046-receipt-evidence'
t=json.loads((root/'database/environments.json').read_text())['development']
assert (t['host'],t['database'])==('34.21.174.215','loan_manager_dev')
image=Image.new('RGB',(720,960),'#f4f7fa');draw=ImageDraw.Draw(image)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',28)
small=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',22)
draw.rounded_rectangle((35,35,685,925),radius=20,fill='white',outline='#ccd6e0',width=2)
for y,line in [(95,'SYNTHETIC RECEIPT'),(145,'TEST ONLY - NOT A BANK DOCUMENT'),(250,'Payment: R046-payment'),(315,'Amount: THB 25.00'),(380,'Reference: SYNTHETIC-046'),(485,'Original image stored in private GCS'),(550,'Displayed in AppSheet Payment review')]:
    draw.text((65,y),line,font=small if len(line)>30 else font,fill='#18344a')
draw.text((65,825),'No personal or banking information',font=small,fill='#526779')
path=out/'synthetic-receipt.png';image.save(path)
raw=path.read_bytes();digest=hashlib.sha256(raw).hexdigest()
receipt=hashlib.sha256(b'R046-SYNTHETIC-DEV-RECEIPT').hexdigest()
key='receipts/dev/2026/09/27/'+receipt+'/'+digest+'.png'
gcloud='C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd'
subprocess.run([gcloud,'storage','cp',str(path),'gs://mw-payment-receipts-prod-508610-n7/'+key,'--if-generation-match=0','--content-type=image/png'],check=True)
options=dict(host=t['host'],port=5432,dbname=t['database'],sslmode='require',connect_timeout=15)
with psycopg.connect(**options,user='postgres',password=Path(t['passwordFile']).read_text().strip()) as c:
    if not c.execute('SELECT 1 FROM public."Payments" WHERE "Row ID"=%s',('R046-payment',)).fetchone():
        fixture=(root/'scripts/database/Test-ReceiptEvidence.sql').read_text(encoding='utf-8')
        c.execute(fixture[fixture.index('INSERT INTO "Partners"'):fixture.index('CREATE TEMP TABLE before_receipt')])
        c.execute('UPDATE public."Borrowers" SET "Borrower Name"=%s WHERE "Row ID"=%s',('Synthetic R046 Receipt Demo','R046-borrower'))
    row=c.execute('SELECT "Payment Date"::text,to_char("Created At",\'YYYY-MM-DD HH24:MI\') FROM public."Payments" WHERE "Row ID"=%s',('R046-payment',)).fetchone()
facts=dict(borrower='R046-borrower',amount='25',date=row[0],clock=row[1],reference='SYNTHETIC-046',account='R046-dad')
password=Path('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/receipt-storage/receipt-projector-password.txt').read_text().strip()
with psycopg.connect(**options,user='mw_receipt_projector',password=password) as c:
    result=c.execute('SELECT public.attach_payment_receipt_evidence(%s,%s,%s,%s,%s,%s,%s)',
      ('R046-payment',receipt,key,datetime(2026,9,27,4,0,tzinfo=timezone.utc),Jsonb(facts),uuid.UUID('04600000-0000-0000-0000-000000000046'),'R046-synthetic-demo')).fetchone()[0]
evidence={'database':t['database'],'payment_id':'R046-payment','receipt_id':receipt,'object_key':key,'raw_sha256':digest,'result':result,'synthetic_only':True}
(out/'dev-demo.json').write_text(json.dumps(evidence,indent=2)+'\n')
print(json.dumps(evidence))
