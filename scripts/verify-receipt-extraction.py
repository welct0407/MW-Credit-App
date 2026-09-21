#!/usr/bin/env python3
"""Synthetic image through the deployed Codex extractor. No real accounts, writes or mail."""
import io
import json
from datetime import datetime
from pathlib import Path

from PIL import Image,ImageDraw,ImageFont
from mw_integration_agent.config import load_json
from mw_integration_agent.receipt_image import canonical_image,extract
from mw_integration_agent.receipt_rules import BANGKOK,validate_receipt

config=load_json('/etc/mw-integration-agent/config.json')
today=datetime.now(BANGKOK).date().isoformat()
image=Image.new('RGB',(1000,850),'white');draw=ImageDraw.Draw(image)
font=ImageFont.load_default(size=32)
lines=['SYNTHETIC TEST TRANSFER RECEIPT','Transfer completed successfully',
       'Date: '+today,'Time: 18:23:12','Amount: THB 1234.50','From account: 7777777777',
       'To PromptPay: 0891234567','Reference: TEST20260921ABC']
for index,line in enumerate(lines): draw.text((35,40+index*85),line,font=font,fill='black')
buffer=io.BytesIO();image.save(buffer,format='PNG')
data,_=canonical_image(buffer.getvalue())
result=extract(config,data)
accounts=[{'id':'synthetic','label':'Synthetic TTB','active':True,'number':'1234567890','alternative':'0891234567'}]
receipt=validate_receipt(result,accounts)
assert receipt['account_id']=='synthetic' and receipt['amount']=='1234.50'
assert receipt['reference']=='TEST20260921ABC'
assert receipt['time']=='18:23:12' and receipt['timestamp']==today+'T18:23:12+07:00'
proof={'status':'passed','checked_at':datetime.now(BANGKOK).isoformat(),
       'test':'synthetic image extraction and alias validation','email_sent':False,'payment_created':False}
path=Path(config['state_directory'])/'receipt-synthetic-proof.json'
path.write_text(json.dumps(proof,indent=2)+'\n');path.chmod(0o600)
print(json.dumps(proof))
