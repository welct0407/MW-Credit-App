"""Generate the editable service catalogue and current process implementation map."""
from pathlib import Path
import xml.etree.ElementTree as E

ROOT=Path(__file__).resolve().parents[1]
file=E.Element('mxfile',host='app.diagrams.net',type='device',version='24.7.17')
colors={'LIVE':('#e8f5e9','#2e7d32'),'PENDING':('#fff3e0','#ef6c00'),
        'DISABLED':('#eceff1','#607d8b'),'note':('#f5f7fa','#78909c'),'step':('#e8eaf6','#5c6bc0')}

def page(key,name):
    d=E.SubElement(file,'diagram',id=key,name=name)
    m=E.SubElement(d,'mxGraphModel',grid='1',gridSize='10',page='1',pageScale='1',pageWidth='1400',pageHeight='1120')
    r=E.SubElement(m,'root');E.SubElement(r,'mxCell',id='0');E.SubElement(r,'mxCell',id='1',parent='0')
    return r

def box(r,key,label,x,y,w,h,kind='note',link=None):
    fill,stroke=colors[kind]
    attrs={'id':key,'value':label,'style':f'rounded=1;whiteSpace=wrap;html=0;fillColor={fill};strokeColor={stroke};strokeWidth=2;fontColor=#243447;fontSize=18;spacing=14;', 'vertex':'1','parent':'1'}
    if link:attrs['link']='data:page/id,'+link
    c=E.SubElement(r,'mxCell',**attrs);E.SubElement(c,'mxGeometry',x=str(x),y=str(y),width=str(w),height=str(h),**{'as':'geometry'})

def edge(r,a,b):
    c=E.SubElement(r,'mxCell',id='e'+str(len(r)),style='edgeStyle=orthogonalEdgeStyle;endArrow=block;strokeColor=#607d8b;',edge='1',parent='1',source=a,target=b)
    E.SubElement(c,'mxGeometry',relative='1',**{'as':'geometry'})

pages=[
('ingress','Instagram webhook','LIVE',[
 'Meta message → hooks.mw-credit.com/instagram',
 'Cloudflare tunnel → Debian loopback receiver',
 'Verify signature and expected Instagram account',
 'Durably capture ID, sender, time and image references',
 'Deduplicate retries, then acknowledge HTTP request',
 'Receipt worker consumes captured events separately'],
 'Invalid signature → reject.\nDuplicate event → no second job.\nOrdinary text/audio/video → no reply.\nOperator-selected history is a separate input and is not labelled webhook evidence.',
 'server.py · webhook.py · journal.py\nmw-instagram-webhook.service · mw-cloudflared-instagram.service'),
('receipts','Receipt validation','LIVE',[
 '20-second timer → acquire single-worker lock',
 'Read only events after the existing activation cutoff',
 'IG participant ID → username → one AI-enabled Borrower',
 'Download bounded image; isolated Codex extracts facts',
 'Validate date, success, amount, transfer time, account aliases and duplicates',
 'Reserve receipt keys; queue localized partner notification'],
 'Today/yesterday Bangkok only.\nActive receiving account; primary or alternative number.\nReference/image duplicate → stop.\nNonreceipt or disabled/unmapped borrower → ignore.\nInvalid receipt → REVIEW.\nCURRENT: summary only; no payment write or group reply.\nreceipt-prepare accepts borrower/date/message parameters and reuses the same extraction and rules.',
 'receipt_run.py · receipt_rules.py · receipt_image.py\nreceipt_master.py · receipt_journal.py · receipt_prepare.py'),
('posting','Payment posting','PENDING',[
 'Input: validated receipt from the shared workflow',
 'Re-read borrower, loan, charges and existing payments',
 'Resolve allocation; explicitly confirm loan closure when needed',
 'TO IMPLEMENT: reserve one write intent; call OLTP API',
 'TO IMPLEMENT: verify Posted payment, allocations, loan and ledger time',
 'After verified posting only: send Payment processed notice'],
 'Not implemented or enabled.\noperational_data_api remains disabled; writes_enabled=false.\nOwner authorized the real test and confirmed full repayment/loan close. It remains unposted.\nRequired: reusable posting/readback, exact receipt HH:mm, duplicate checks and unknown-write reconciliation.\nSuccess template exists; it cannot by itself establish that payment was posted.',
 'receipt_prepare.py (implemented preparation)\npartner_notice.py (prepared success template; no posting caller)'),
('identity','Partner authentication','LIVE',[
 'Read current Partner master for the event',
 'Use Language Preference: English or ไทย',
 'IG Integration Enabled controls Instagram eligibility',
 'Match one conversation participant to Partner IG username',
 'Verify scoped ID/profile; reject duplicate or changed identities',
 'Check signed inbound window: 24 hours minus 60 seconds'],
 'Borrower identity never selects the partner recipient.\nChanged delivery details → REVIEW.\nUnavailable route/window → current Partner Email fallback.\nNo inbound partner command execution is enabled.',
 'statement_delivery.py: eligible, resolve_recipient, check_window\ncash_statement.py: partners · receipt_master.py: masters'),
('ig','Instagram notifications','LIVE',[
 'Build text or statement PNGs in each Partner’s preferred language',
 'Reserve event + Partner key; images also use account/page keys',
 'Recheck identity, destination and delivery window',
 'Commit UNKNOWN intent before calling Meta API',
 'Accepted message ID → record success; no email',
 'Unavailable, incomplete or uncertain → email fallback'],
 'All partner notifications start with IG.\nNever replay an uncertain IG send.\nNo receipt-success message to borrower/group.\nSummary: explicitly says payment not recorded.\nProcessed template: borrower, amount, date/time HH:mm, receiving account, payment ID.\nUnknown IG may have arrived; fallback is separately recorded.',
 'partner_notice.py · instagram.py\nstatement_delivery.py · statement_run.py'),
('email','Email fallback and retry','LIVE',[
 'Start only after unavailable/incomplete/uncertain IG',
 'Re-read current Partner email and language; stop if changed',
 'Build localized notice or complete statement image set',
 'Commit UNKNOWN intent before Microsoft Graph call',
 'Accepted → SENT; definite rejection → retry queue',
 'At most 3 attempts; unknown/crash outcome → no replay'],
 'Email is backup, never first choice.\nNo email after confirmed complete IG delivery.\nReceipt retries: worker timer, 5-minute backoff.\nStatement retries: existing 5-minute timer.\nNo public hosting of statements or receipt pictures.',
 'partner_notice.py · graph_email.py · statement_run.py: retry_emails\nmw-cash-statement-email-retry.timer'),
('statement','Daily cash statement','LIVE',[
 '00:15 Bangkok → latest completed 00:00–00:00 day',
 'Read governed cash effects and opening balances',
 'Freeze a private repeatable-read snapshot',
 'Render all account pages in English and Thai; show HH:mm',
 'Send preferred-language PNGs to each enabled Partner by IG',
 'If incomplete/unavailable: email the complete image set'],
 'Uses Cash Ledger.Created At for the calendar cutoff.\nProduction V30 propagates source Payment.Created At on new payment ledger entries.\nNo historical backfill or automatic reissue of old images.\nDurable snapshot/send keys survive restart.\nNo financial writes.',
 'cash_statement.py · statement_image.py · statement_run.py\nmw-cash-statement.timer · statement_delivery.py'),
('api','AppSheet API connections','LIVE',[
 'Select named app: oltp (default) or olap',
 'Resolve production app ID and its separate protected key',
 'Validate approved endpoint and bounded table/selector',
 'Send official Find request; key stays in HTTP header',
 'Return scoped records; probe prints metadata only',
 'After app upgrades: verify switches and probe both APIs'],
 'PROD APIs enabled directly by owner authority, outside releases. DEV unchanged.\nCurrent client is Find-only. Connection setup does not enable arbitrary writes.\nKeys stay under /etc/mw-integration-agent.\nDo not assume API Enable survives App Upgrade; preservation is not explicitly guaranteed in the vendor guide.',
 'appsheet.py · config.py · cli.py: appsheet-probe --app oltp|olap\nscripts/configure-appsheet-apis.py'),
('database','Database reporting access','LIVE',[
 'Cloud SQL Auth Proxy listens on 127.0.0.1:5432',
 'Validate loan_manager_prod and dedicated agent role',
 'Load protected credential without exposing it to Codex',
 'Run fixed SELECT queries in read-only transactions',
 'Return receipt masters, duplicate checks or report data',
 'Rollback read transaction; retain required private evidence'],
 'SELECT and TEMP privileges only; no durable DML/schema changes.\nBoth apps share PROD database, with distinct API keys.\nIntegrity/accounting triggers are never disabled.\nNo unrestricted production export goes into Git.',
 'cash_statement.py: read_query, snapshot · receipt_master.py\ncloud-sql-auth-proxy.service'),
]
for key,title,service,detail in [
 ('codex','Persistent partner conversations','persistent_codex_conversation','Receipt-image extraction is separate and constrained; it is not a general conversation agent.'),
 ('gui','Partner OLTP GUI operations','partner_oltp_gui','Desktop inspection during development is not a deployed VM capability. The retired Windows worker stays stopped.'),
 ('briefing','Daily briefing','daily_briefing','No briefing timer runs. Daily cash statements are a separate authorized service.'),
 ('weather','Pattaya weather','pattaya_weather','No weather provider is called and no borrower information is sent to one.')]:
    pages.append((key,title,'DISABLED',[
        'Service listed in the catalogue for future scope',
        'enabled=false and implemented=false',
        'No business worker or automatic execution',
        'Inbound messages cannot activate this capability',
        'Future work needs shared scripts, tests and owner scope',
        'Activation would be a separate explicit step'],
        detail+'\n\nThis page records the current disabled state; it does not enable or promise the feature.',
        'service-catalogue.json: '+service+'\nconfig.py · docs/MIGRATION_PLAN.md'))

r=page('overview','01 · All services')
box(r,'title','MW INTEGRATION AGENT  |  All services and implementing scripts',40,25,1320,70,'step')
box(r,'legend','GREEN = live · AMBER = pending implementation · GREY = disabled\nOne Debian runtime. Click any service card for its detailed page.',40,110,1320,85)
for i,(key,title,status,*_) in enumerate(pages):
    box(r,key,title,40+(i%3)*445,220+(i//3)*155,420,125,status,key)
box(r,'scope','Owner review baseline · 21 September 2026\nProduction API configuration is outside releases. Real receipt posting remains pending; no borrower-specific scripts are maintained.',40,1010,1320,80,'PENDING')
for number,(key,title,status,steps,notes,sources) in enumerate(pages,2):
    r=page(key,f'{number:02} · {title}')
    box(r,'title',title,40,25,1320,65,status)
    box(r,'status',f'STATUS: {status}  |  Return to all services',40,105,1320,45,'note','overview')
    for i,label in enumerate(steps):
        box(r,'s'+str(i),f'{i+1}. {label}',80,180+i*126,740,96,'DISABLED' if status=='DISABLED' else 'step')
        if i:edge(r,'s'+str(i-1),'s'+str(i))
    box(r,'exceptions','DECISIONS / EXCEPTIONS\n\n'+notes,880,180,460,690,'PENDING' if status=='PENDING' else 'note')
    box(r,'scripts','IMPLEMENTING SCRIPTS / RUNTIME\n'+sources,40,980,1320,100,'note')
for d in file:
    r=d.find('mxGraphModel/root');ids={c.get('id') for c in r}
    assert len(ids)==len(r)
    for c in r:
        if c.get('edge')=='1':assert c.get('source') in ids and c.get('target') in ids
E.indent(file,space='  ')
E.ElementTree(file).write(ROOT/'docs'/'BUSINESS_PROCESS.drawio',encoding='utf-8',xml_declaration=True)
print(f'Generated {len(file)} linked pages; IDs and edges verified.')
