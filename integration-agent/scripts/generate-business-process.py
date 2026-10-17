"""Generate the editable service catalogue and current process implementation map."""
from pathlib import Path
import xml.etree.ElementTree as E

ROOT=Path(__file__).resolve().parents[1]
file=E.Element('mxfile',host='app.diagrams.net',type='device',version='24.7.17')
colors={'LIVE':('#d5e8d4','#82b366'),'PENDING':('#fff2cc','#d6b656'),
        'DISABLED':('#f5f5f5','#999999'),'note':('#f5f5f5','#999999'),
        'step':('#dae8fc','#6c8ebf'),'decision':('#fff2cc','#d6b656'),
        'stop':('#f8cecc','#b85450')}

def page(key,name,height=1900):
    d=E.SubElement(file,'diagram',id=key,name=name)
    m=E.SubElement(d,'mxGraphModel',grid='1',gridSize='10',page='1',pageScale='1',pageWidth='1400',pageHeight=str(height))
    r=E.SubElement(m,'root');E.SubElement(r,'mxCell',id='0');E.SubElement(r,'mxCell',id='1',parent='0')
    return r

def box(r,key,label,x,y,w,h,kind='note',link=None):
    fill,stroke=colors[kind]
    shape='rhombus;' if kind=='decision' else 'rounded=1;arcSize=12;'
    attrs={'id':key,'value':label,'style':f'{shape}whiteSpace=wrap;html=0;fillColor={fill};strokeColor={stroke};fontColor=#172b4d;fontSize=16;align=center;verticalAlign=middle;spacing=12;', 'vertex':'1','parent':'1'}
    if link:attrs['link']='data:page/id,'+link
    c=E.SubElement(r,'mxCell',**attrs);E.SubElement(c,'mxGeometry',x=str(x),y=str(y),width=str(w),height=str(h),**{'as':'geometry'})

def edge(r,a,b,label='',points=None,ports=''):
    c=E.SubElement(r,'mxCell',id='e'+str(len(r)),value=label,style='edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=0;endArrow=block;endFill=1;strokeColor=#475569;fontColor=#334155;fontSize=14;labelBackgroundColor=#ffffff;',edge='1',parent='1',source=a,target=b)
    if ports:c.set('style',c.get('style')+ports)
    g=E.SubElement(c,'mxGeometry',relative='1',**{'as':'geometry'})
    if points:
        arr=E.SubElement(g,'Array',**{'as':'points'})
        for x,y in points:E.SubElement(arr,'mxPoint',x=str(x),y=str(y))

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
 'Fresh Payments check: already recorded → stop; uncertain → review; otherwise queue notice'],
 'Today/yesterday Bangkok only.\nActive receiving account; primary or alternative number.\nReference/image duplicate → stop.\nNonreceipt or disabled/unmapped borrower → ignore.\nInvalid receipt → REVIEW.\nCURRENT: Partner review before ordinary posting; no group reply.\nreceipt-prepare accepts borrower/date/message parameters and reuses the same extraction and rules.',
 'receipt_run.py · receipt_rules.py · receipt_image.py · payment_match.py\nreceipt_master.py · receipt_journal.py · receipt_prepare.py'),
('posting','Payment posting','LIVE',[
 'Input: ordinary payment approved through linked Partner reply',
 'Re-read borrower, loan, charges and existing payments',
 'Loan closure or overpayment → Partner manual handling only',
 'Reserve POSTING once; call PROD OLTP Payments Add',
 'Verify Posted payment, amount, account, receipt minute and repayments',
 'After verified posting only: send Payment processed notice'],
 'Scoped review executor only; generic writes stay off.\nYes / Approve / Approved / อนุมัติ, case insensitive, via exact Instagram Reply.\nCurrent facts must match the reviewed proposal.\nExisting payment → stop.\nUncertain write → readback only, never repeat Add.\nNo automatic loan close or overpayment.\nNo group success messages.',
 'review_cycle.py · review_execution.py · payment_match.py\npartner_review.py · partner_notice.py'),
('identity','Partner authentication','LIVE',[
 'Read current Partner master for the event',
 'Use Language Preference: English or ไทย',
 'IG Integration Enabled controls Instagram eligibility',
 'Match one conversation participant to Partner IG username',
 'Verify scoped ID/profile; reject duplicate or changed identities',
 'Check signed inbound window: 24 hours minus 60 seconds'],
 'Borrower identity never selects the partner recipient.\nChanged delivery details → REVIEW.\nUnavailable route/window → current Partner Email fallback.\nOnly linked receipt review decisions; no general commands.',
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
 'Send official Find or authorized Codex-selected Add/Edit',
 'Return scoped records; persist write intent and read back',
 'After app upgrades: refresh schema and probe both APIs'],
 'PROD APIs enabled directly by owner authority, outside releases. DEV unchanged.\nConversation writes have independent controls and actor attribution.\nKeys stay under /etc/mw-integration-agent.\nDo not assume API Enable survives App Upgrade; preservation is not explicitly guaranteed in the vendor guide.',
 'appsheet.py · conversation_schema.py · conversation_write.py\nscripts/configure-appsheet-apis.py · scripts/verify-conversation-schema.py'),
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
    if key=='codex':
        pages.append((key,title,'LIVE',[
            'New signed Partner text after activation cutoff',
            'Exclude receipt-review replies; verify enabled Partner and sender',
            'Reserve one turn; resume account / Partner / sender thread',
            'Codex chooses schema-guided Find / Add / Edit API calls',
            'Persist answer; verify current identity before delivery',
            'Instagram first; complete email fallback when unavailable'],
            'Host-owned tools only; no shell, SQL, plugins or general GUI.\nCurrent-turn evidence, not old balances.\nGeneric API primitives; no fixed business-operation scripts.\nAuthenticated actor, durable intent and owning-app readback.\nUnknown operation blocks writes; no turn/write/send replay.\nOpt-out blocks both conversation reply channels.\nExisting app validation and posting rules still apply.\nSeparate receipt approval authority is unchanged.',
            'partner_conversation.py · codex_conversation.py · conversation_tools.py\nconversation_store.py · conversation_write.py · partner_notice.py\nmw-partner-conversation.timer · docs/PARTNER_CONVERSATIONS.md'))
        continue
    pages.append((key,title,'DISABLED',[
        'Service listed in the catalogue for future scope',
        'enabled=false and implemented=false',
        'No business worker or automatic execution',
        'Inbound messages cannot activate this capability',
        'Future work needs shared scripts, tests and owner scope',
        'Activation would be a separate explicit step'],
        detail+'\n\nThis page records the current disabled state; it does not enable or promise the feature.',
        'service-catalogue.json: '+service+'\nconfig.py'))

pages.append(('poll','Conversation API polling','LIVE',[
 'Five-minute timer → single polling worker',
 'Official conversations API; current AI-enabled borrower participants',
 'Discover new groups; read message pages to cutoff or exhaustion',
 'Boundary reached or history exhausted; participant / attachment data usable?',
 'Reserve borrower / verified Lisa-forwarded images; preserve sender and group',
 'Commit conversation checkpoint; existing receipt worker continues'],
 'Official API only; no browser automation.\nDiscover current/new groups every scan.\nNested cursors via conversation-list fields.\nEmpty terminal page completes new groups.\nMaximum ten message pages per group.\nFailed group: preserve cursor; others continue.\nFive-minute overlap; shared receipt deduplication.\nLisa forwards: exactly three matched members.\nExisting cutoff and reviewer rules stay active.\nNo group send; polled events cannot approve.',
 'conversation_poll.py · receipt_journal.py · receipt_run.py\nmw-conversation-poll.timer · docs/CONVERSATION_POLL.md'))

pages.append(('review','Partner receipt review','LIVE',[
 'Validated receipt → current balances and existing-payment checks',
 'Send localized proposal to Partners by IG; email fallback is informational',
 'Require direct Reply to the exact accepted proposal and current Partner identity',
 'Yes / Approve / Approved / อนุมัติ after trimming, case insensitive?',
 'First valid decision wins; ordinary payment → fresh checks and one Add',
 'Closure / overpayment → manual; verified posting → Partner result'],
 'Other direct reply → REJECTED.\nUnlinked text → no decision.\nNo reply → pending; expires after 24 hours.\nR014 deployed: only AI Reviewer=true may decide.\nTommy initially selected; new Partners default false.\nReplay cannot execute twice.\nChanged identity or facts → stop.\nLoan closures and overpayments are manual-only even after approval.\nEmail reply cannot approve.\nNo browser automation or group reply.',
 'partner_review.py · review_proposal.py · review_cycle.py\nwebhook.py · journal.py · partner_notice.py'))

r=page('agent-overview','01 · Agent overview',1460)
box(r,'title','MW INTEGRATION AGENT | Overall operating flow',60,25,1280,55,'note')
box(r,'status','LIVE: receipt review, daily cash statements and persistent Partner conversations\nCodex-selected API operations with verified outcomes · Click for detailed pages',60,95,1280,65,'note')
# Three connected lanes follow the source agent overview: entries, workers,
# shared data services, delivery and durable state. Existing page IDs stay stable.
for key,label,col,row,kind,target in [
 ('daily','00:15 Bangkok timer\nDaily cash statement',0,0,'LIVE','statement'),
 ('webhook','Signed Instagram webhook\nBorrower receipt messages',1,0,'LIVE','ingress'),
 ('manual','Five-minute conversation API poll\nNew group and direct messages',2,0,'LIVE','poll'),
 ('snapshot','Read cash ledger and balances\nFreeze private statement snapshot',0,1,'step','statement'),
 ('capture','Verify signature\nPersist and deduplicate events',1,1,'step','ingress'),
 ('masters','Shared read-only data access\nPROD OLTP / OLAP API + PostgreSQL',2,1,'step','api'),
 ('render','Render statement images\nEnglish / Thai, receipt time HH:mm',0,2,'step','statement'),
 ('validate','Receipt worker: map borrower\nExtract image and validate receipt',1,2,'step','receipts'),
 ('post','Linked Partner approval\nOrdinary payment + exact readback',2,3,'LIVE','review'),
 ('identity','Current Partner identity, language\nIG route and messaging window',0,3,'step','identity'),
 ('notice','Prepare localized action proposal\nClosure / overpayment: manual only',1,3,'step','review'),
 ('igsend','Instagram API delivery\nNo receipt-success group message',1,4,'step','ig'),
 ('fallback','Email fallback and bounded retry\nUnknown sends are not replayed',2,4,'step','email'),
 ('journal','Private SQLite journals\nReceipt deduplication, send intent and uncertain outcomes',1,5,'note',None),
]:
    box(r,key,label,60+col*440,210+row*185,400,115,kind,target)
for a,b,label in [
 ('daily','snapshot',''),('snapshot','render',''),
 ('webhook','capture',''),('capture','validate','20-second worker'),
 ('manual','masters','Fresh masters'),('masters','validate','Borrower / account facts'),
 ('render','identity','Statement'),('validate','notice','Valid receipt'),
 ('identity','igsend','Verified recipient'),('notice','igsend','Summary'),
 ('notice','post','Review'),('igsend','fallback','Fallback'),
 ('igsend','journal','Accepted / uncertain'),('fallback','journal','Outcome'),
]:
    routes={
      ('masters','validate'):([(1140,637.5)],'exitX=0.5;exitY=1;entryX=1;entryY=0.5;'),
      ('identity','igsend'):([(260,1007.5)],'exitX=0.5;exitY=1;entryX=0;entryY=0.5;'),
      ('fallback','journal'):([(1140,1192.5)],'exitX=0.5;exitY=1;entryX=1;entryY=0.5;'),
    }
    points,ports=routes.get((a,b),(None,''))
    edge(r,a,b,label,points,ports)
box(r,'future','Also live: signed Partner text → persistent Codex thread → current data / general Add/Edit API operations → reply.\nReceipt approvals stay separate. Unknown turns, edits and sends never replay.\nDisabled: general Partner GUI, briefing and weather. Click for service index.',60,1340,1280,90,'note','overview')

r=page('overview','02 · All services',1120)
box(r,'title','MW INTEGRATION AGENT  |  All services and implementing scripts',40,25,1320,70,'step')
box(r,'legend','One Debian runtime · Click a service for its detailed flowchart\nGreen = live outcome / service · Blue = process · Yellow = decision / pending · Red = stop · Grey = notes / disabled',40,110,1320,85)
for i,(key,title,status,*_) in enumerate(pages):
    box(r,key,title,40+(i%3)*445,220+(i//3)*155,420,125,status,key)
box(r,'scope','Owner review baseline · 22 September 2026\nPersistent Partner conversations use general AppSheet API tools. Codex chooses the calls; the host checks authority and outcomes.',40,1010,1320,80,'PENDING')
# Decision labels describe existing behavior, not new runtime gates.
decisions={
 'codex':(1,'New signed message from\none enabled Partner?','Receipt-review reply → existing coordinator\nUnknown / revoked sender → no conversation'),
 'review':(3,'Linked reply approves\nthis exact proposal?','Reject other direct replies\nUnlinked / unauthorized → no decision'),
 'poll':(3,'Boundary reached or\nhistory exhausted?','Hold this group; preserve checkpoint\nContinue other groups; retry next scan'),
 'ingress':(2,'Valid signature and\nexpected account?','Reject request; do not create a job'),
 'receipts':(4,'Receipt passes all\nvalidation rules?','Invalid → REVIEW\nNonreceipt / disabled borrower → ignore\nDuplicate → no second processing'),
 'posting':(3,'Approved ordinary payment\nand fresh checks pass?','Stop; no payment Add\nClosure / overpayment → manual'),
 'identity':(4,'One verified current\nPartner identity?','Reject ambiguous / changed identity\nUnavailable IG route → email fallback'),
 'ig':(4,'Meta accepted the\ncomplete notification?','Unavailable / incomplete / uncertain\nUse email fallback\nNever replay uncertain IG'),
 'email':(4,'Email provider outcome?','Unknown → retain for reconciliation\nNever automatically replay'),
 'statement':(4,'Complete IG delivery\nconfirmed?','Use complete image set\nfor email fallback'),
 'api':(2,'Approved app, table\nand bounded selector?','Reject request\nNo arbitrary write access'),
 'database':(1,'Expected PROD database\nand dedicated role?','Stop query\nDo not use another database'),
}
for number,(key,title,status,steps,notes,sources) in enumerate(pages,3):
    r=page(key,f'{number:02} · {title}')
    box(r,'title',f'{number}. {title}',60,30,1280,55,'note')
    box(r,'status',f'STATUS: {status}  |  Return to all services',60,100,1280,65,'note','overview')
    decision=decisions.get(key,(1,'Service implemented\nand enabled?','NO — current state\nNo worker or automatic execution'))
    index,question,stop=decision
    for i,label in enumerate(steps):
        kind='decision' if i==index else ('DISABLED' if status=='DISABLED' else 'step')
        text=question if i==index else label
        if key in ('ig','statement') and i==5:text='Record complete IG delivery\nNo email fallback needed'
        if (status!='LIVE' and i>index):text='PENDING / FUTURE\n'+text
        box(r,'s'+str(i),text,540,220+i*210,320,140 if i==index else 120,kind)
        if i:
            branch=('Future only' if status!='LIVE' else ('Rejected: bounded retry' if key=='email' else 'Yes')) if i-1==index else ''
            edge(r,'s'+str(i-1),'s'+str(i),branch)
    box(r,'stop',stop,70,220+index*210,340,140,'stop')
    edge(r,'s'+str(index),'stop','Unknown' if key=='email' else 'No')
    box(r,'context','RULES / EXCEPTIONS\n\n'+notes,990,220,340,720,'note')
    if key=='email':
        box(r,'accepted','Accepted → SENT\nNo automatic resend',990,1110,340,110,'LIVE')
        edge(r,'s4','accepted','Accepted')
    box(r,'scripts','IMPLEMENTING SCRIPTS / RUNTIME\n'+sources,60,1480,1280,130,'note')
    box(r,'detail','DECISION DETAIL\n'+steps[index],60,1650,1280,140,'PENDING' if status=='PENDING' else 'note')
for d in file:
    r=d.find('mxGraphModel/root');ids={c.get('id') for c in r}
    assert len(ids)==len(r)
    for c in r:
        if c.get('edge')=='1':assert c.get('source') in ids and c.get('target') in ids
        if c.get('vertex')=='1':
            g=c.find('mxGeometry');m=d.find('mxGraphModel')
            assert float(g.get('x'))+float(g.get('width'))<=float(m.get('pageWidth'))
            assert float(g.get('y'))+float(g.get('height'))<=float(m.get('pageHeight'))
E.indent(file,space='  ')
E.ElementTree(file).write(ROOT/'docs'/'BUSINESS_PROCESS.drawio',encoding='utf-8',xml_declaration=True)
print(f'Generated {len(file)} linked pages; IDs and edges verified.')
