// Rebuild the editable draw.io documentation; no production access or dependencies.
const fs = require('fs');
const path = require('path');
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'&#xa;');
const pages=[];
let cells, seq;
const colors={process:['#eaf2ff','#4274b8'],auto:['#e4f5f1','#278775'],decision:['#fff2d6','#c18a22'],note:['#fff8e8','#d1aa52'],external:['#f0eafb','#8462b3'],end:['#e6f2e4','#55894d']};
function box(id,label,x,y,w=230,h=90,kind='process') {
 const [fill,stroke]=colors[kind];
 const shape=kind==='decision'?'rhombus;':kind==='end'?'rounded=1;arcSize=45;':'rounded=1;arcSize=12;';
 cells.push(`<mxCell id="${id}" value="${esc(label)}" style="${shape}whiteSpace=wrap;html=0;fillColor=${fill};strokeColor=${stroke};fontColor=#17324d;fontSize=15;fontFamily=Helvetica;spacing=10;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`);
}
function text(id,label,x,y,w,h,size=15) {
 cells.push(`<mxCell id="${id}" value="${esc(label)}" style="text;html=0;whiteSpace=wrap;align=left;verticalAlign=middle;fontSize=${size};fontColor=#17324d;fontFamily=Helvetica;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`);
}
function edge(a,b,label='',dashed=false,extra='',points=[]) {
 const route=points.length?`<Array as="points">${points.map(([x,y])=>`<mxPoint x="${x}" y="${y}"/>`).join('')}</Array>`:'';
 cells.push(`<mxCell id="e${seq++}" value="${esc(label)}" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=0;endArrow=block;strokeColor=#66788a;fontColor=#334e68;fontSize=13;labelBackgroundColor=#ffffff;${dashed?'dashed=1;':''}${extra}" edge="1" parent="1" source="${a}" target="${b}"><mxGeometry relative="1" as="geometry">${route}</mxGeometry></mxCell>`);
}
function page(name,title,subtitle,build){
 cells=['<mxCell id="0"/>','<mxCell id="1" parent="0"/>']; seq=1;
 text('title',title,40,20,1320,45,28); text('subtitle',subtitle,40,70,1320,45,15);
 build();
 text('footer','DOCUMENTATION BASELINE • 12 Sep 2026 | Latest recorded OLTP version 3.000045 (11 Sep); no live reconciliation in this task.\nBlue: operator workflow • Green: app processing/outcome • Amber: decision or qualification • Purple: downstream boundary • Dashed arrows: supporting relationship',40,930,1310,55,13);
 pages.push(`<diagram id="page-${pages.length+1}" name="${esc(name)}"><mxGraphModel dx="1400" dy="1000" grid="1" gridSize="10" page="1" pageScale="1" pageWidth="1400" pageHeight="1000" background="#ffffff"><root>${cells.join('\n')}</root></mxGraphModel></diagram>`);
}
page('1 - Loan lifecycle','OLTP · Loan business processes','Loan Manager ผู้จัดการสินเชื่อ | Business sequence synthesized from repository documentation; arrows do not imply atomic transactions.',()=>{
 box('start','Borrower needs a loan',40,150,230,65,'end');
 box('borrower','1  Set up / select borrower\nBorrowers\nMaintain identity and visibility',320,140);
 box('loan','2  Create loan\nLoans → borrower reference\nEnter terms, dates and amounts',610,140);
 box('type','Loan terms\nFixed-date • Daily interest\nDaily installment',930,140,380,90,'note');
 edge('start','borrower');edge('borrower','loan');edge('loan','type','terms',true);
 box('enabled','Auto Charge\nEnabled?',660,290,170,110,'decision');edge('loan','enabled');
 box('manual','3B  Enter Charges manually\nExplicit principal / interest schedule\nAvailable when generation is off',980,300,330,100);edge('enabled','manual','No');
 box('generate','3A  Generate eligible Charges\nFirst-day flow + recurring generation\nType, interval and duplicate guards',310,300,300,100,'auto');edge('enabled','generate','Yes');
 box('first','First-day receipt when applicable\nNet-off at Disbursement\nUses common Payments pipeline',40,455,300,100,'auto');edge('generate','first','first-day',true);
 box('board','4  Review Collection\nDue unpaid + today payment activity\nIdentify remaining / overdue amounts',420,465,320,100);edge('generate','board');edge('manual','board');
 box('payment','5  Receive and allocate payment\nFull / Partial / Receive All / Lump Sum\nDetailed pipeline on page 2',850,465,360,100);edge('board','payment');
 box('review','6  Review posted balances\nCharges → Loans → Borrowers\nReconcile cash and principal / interest',850,640,360,95,'auto');edge('payment','review');
 box('outcome','Remaining\nobligations?',540,635,190,110,'decision');edge('review','outcome');
 box('closed','Set Loan Closed\nRequires no remaining Charge balance\nCheck principal / closure rules',40,650,360,95,'end');edge('outcome','closed','None + eligible');
 box('continue','Continue servicing\nReview next due date / payment\nRepeat Collection workflow',440,800,330,85);edge('outcome','continue','Yes');
 box('exception','Closure / default / recovery\nSee page 3 for shortcut restrictions\nand exceptional processing',940,800,360,85,'note');edge('review','exception','if required',true);
});
page('2 - Payment processing','OLTP · Receive, allocate and reconcile','One Payments row represents one receipt. Payment Allocations freezes the plan; Repayments feeds operational financial balances.',()=>{
 box('single','Single Full / Single Partial\nOne selected outstanding Charge\nFuture Charge may be prepaid',40,145,390,95);
 box('multi','Receive All / Lump Sum\nBorrower outstanding Charges\nCharge Date ≤ Payment Date',500,145,390,95);
 box('internal','First-day Auto / Loan Close\nFirst-day: one Charge\nClose: selected loan remaining Charges',960,145,390,95,'auto');
 box('validate','Validate receipt\nPositive whole baht within eligible balance; full modes match exactly\nPayment Date ≤ today; target belongs to borrower\nBlock another receipt while borrower has Processing / Error',340,290,710,110);
 edge('single','validate');edge('multi','validate');edge('internal','validate');
 box('queued','Payments: Processing\nSave receipt → processing bot\nFinancial inputs locked after creation',40,465,290,100,'auto');edge('validate','queued','valid');
 box('snap','1  Create snapshots\nEligible Charges →\nPayment Allocations',380,465,260,100,'auto');edge('queued','snap');
 box('freeze','2  Freeze allocation plan\nNewest charge date / ordinal first\nInterest before principal per Charge',690,465,290,100,'auto');edge('snap','freeze');
 box('post','3  Post plan\nCreate traced Repayments\nSkip zero / already-posted allocations',1030,465,320,100,'auto');edge('freeze','post');
 box('check','4  Reconcile\nReceipt = plan = posted?\nLinks / components complete?',1050,635,265,130,'decision');edge('post','check');
 box('posted','Posted + Processed At\n5  Close paid loans when eligible\nPayment-level notification event',680,650,300,105,'end');edge('check','posted','Pass');
 box('error','Error\nInspect snapshot / posting mismatch\nResolve cause before retry',1030,820,320,85,'note');edge('check','error','Fail');
 box('retry','Payment - Retry\nError → Processing\nNo competing Processing receipt',380,800,300,95);edge('error','retry');edge('retry','queued','reuse receipt',false,'exitX=0;exitY=0.5;entryX=0.5;entryY=1;',[[20,847],[20,610],[185,610]]);
 box('controls','Guardrails and limits\nOne unique Repayment per positive allocation; matching receipt / charge links and amounts.\nGuards are not an atomic concurrency lock.\nInvalid form input must be corrected before save.',40,635,540,115,'note');
});
page('3 - Controls and boundaries','OLTP · Exceptions and supporting processes','Business rules below reflect the documented prototype. No lending approval stage or external collection runtime is inferred.',()=>{
 text('h1','LOAN OUTCOMES',40,130,650,35,20);
 box('close','Early closure request\nWrapped Action - Close Loan\nUnavailable for daily-installment loans',40,185,365,100);
 box('closeguard','Shortcut eligible?\nAuto Charge Enabled = TRUE\nNo borrower Processing / Error receipt',470,185,395,100,'decision');edge('close','closeguard');
 box('final','Create Final Charge\nAdd Principal to Today’s Charge\nCreate Loan Close receipt → page 2',950,185,390,100,'auto');edge('closeguard','final','Yes');
 box('hold','If blocked: review loan / receipt state\nDo not assume the shortcut is available\nClosure requires no Charge balance remaining',450,345,420,90,'note');edge('closeguard','hold','No');
 box('default','Default request\nExisting default workflow\nNo borrower Processing / Error receipt',40,490,365,100);
 box('defaultprocess','Eligible default processing\nAuto Charge Enabled required by shortcut\nRecord remaining principal as Default Loss Amount',470,490,395,100,'auto');edge('default','defaultprocess','eligible');
 box('defaultnote','Documented legacy exception\nRetains allocation-referenced Charges; prior path may delete unreferenced unpaid Charges.\nNot a routine correction procedure.',950,475,390,130,'note');edge('defaultprocess','defaultnote','qualification',true);
 text('h2','SUPPORTING OPERATIONS & REPORTING',40,630,1250,35,20);
 box('masters','Maintain operational setup\nBorrowers • Partners\nCollection Bank Accounts / Settings\nCollection Setup Review',40,700,360,120);
 box('store','Shared Money database\nBorrowers → Loans → Charges → Repayments\nPayments → Payment Allocations\nStable keys and references',465,700,400,120,'auto');edge('masters','store','supports',true);
 box('olap','Loan Business Insights (OLAP)\nAnalytics, assessment, allocations / settlements\nCurated feeds → Loan Reports - Mobile\nLooker Studio presentation',950,700,390,120,'external');edge('store','olap','reporting data',true);
 text('policy','Correction control: preserve financial audit history; use an authorized reversal / void / adjustment process. A general-purpose correction action is not verified here.\nScope: external AI collection software belongs to its separate project; operational account/setup fields do not imply permission to send messages.',40,850,1290,65,14);
});
const output=path.resolve(__dirname,'../Documents/OLTP_Business_Processes.drawio');
fs.writeFileSync(output,`<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" modified="2026-09-12T00:00:00.000Z" agent="Codex" version="29.0.0" type="device">${pages.join('\n')}</mxfile>\n`);
console.log(`Created ${output} (${pages.length} editable pages)`);
