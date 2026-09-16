// Documentation only. Generates editable draw.io XML and matching SVG previews.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'outputs/loan-ecosystem-20260916');
fs.mkdirSync(out, {recursive:true});
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const palette = {google:['#eaf3ff','#4385ce'],agent:['#e5f5ef','#289277'],external:['#f0eafd','#8c69ba'],note:['#fff4d9','#ba9236'],local:['#edf0f5','#738399']};
const pages=[]; let nodes,edges,title,subtitle;
function box(id,label,x,y,w=280,h=110,kind='google'){nodes.push({id,label,x,y,w,h,kind});}
function edge(a,b,label='',dashed=false,style='',points=[]){edges.push({a,b,label,dashed,style,points});}
function page(name,t,s,build){nodes=[];edges=[];title=t;subtitle=s;build();pages.push({name,title,subtitle,nodes,edges});}
page('1 Ecosystem','MW CREDIT | Loan business ecosystem','Documented architecture · 16 September 2026 · See pages 2–3 for integration and recovery boundaries',()=>{
 box('people','Owner / operations staff\nPartners\nAppSheet mobile + web',40,150);
 box('oltp','GOOGLE APPSHEET · OLTP\nLoan Manager\nBorrowers, loans, payments\nOperational forms + notifications',420,150,320,120);
 box('olap','GOOGLE APPSHEET · OLAP\nLoan Business Insights\nPartner administration + settlement\nAnalytics and governed slices',850,150,330,120);
 box('looker','GOOGLE LOOKER STUDIO\nLoan Reports - Mobile\n7 report pages\nAppSheet connector / reporting feeds',1260,150,300,120);
 box('sql','GOOGLE CLOUD SQL · PRODUCTION\nShared PostgreSQL system of record\nPayments, allocation, charges, default\nDerived balances + daily analytics',620,400,440,130);
 box('bots','APPSHEET AUTOMATION\nCharges: 00:05 Bangkok\nAnalytics: hourly at :00\nSQL requests + partner notifications',1140,400,420,130);
 box('ig','META · INSTAGRAM\nPartner commands / replies\nDaily collection briefing\nPartners forward Thai drafts manually',40,410,360,120,'external');
 box('cf','CLOUDFLARE\nDNS + HTTPS tunnel\nhooks.mw-credit.com/instagram',40,650,360,100,'external');
 box('agent','AZURE-HOSTED WINDOWS VM\nMW Partner Operations agent\nSigned-in worker + webhook receiver\nCodex conversations + local journals',500,650,560,130,'agent');
 box('deps','EXTERNAL AGENT SERVICES\nOpenAI / Codex reasoning\nMicrosoft Graph / Outlook fallback',1140,650,420,130,'external');
 box('support','SUPPORTING SERVICES · page 3\nTailscale + Remote Desktop · GitHub source recovery · Published Google Sites privacy page\nAzure Backup + Cloud SQL backups · Separate development apps and SQL · Drive spreadsheet: prior import only',40,855,1520,95,'local');
 edge('people','oltp','operations');edge('oltp','olap','cross-app workflow',true);edge('olap','looker','curated feeds');
 edge('oltp','sql','read / operational writes');edge('olap','sql','read / controlled writes');edge('bots','sql','request → SQL transaction');
 edge('ig','cf','signed inbound webhook');edge('cf','agent','local receiver');edge('agent','deps','services');edge('agent','oltp','GUI + bounded API',true,'exitX=0.1;exitY=0;entryX=0.4;entryY=1;',[[556,590],[460,590],[460,320],[548,320]]);
});
page('2 Partner agent','MW PARTNER OPERATIONS | Partner-only automation','Independent active project · Last documented activation: 13 September · Runtime health not tested in this diagram task',()=>{
 box('partner','AUTHENTICATED PARTNER\nInstagram commands\nReceives replies / 11:00 briefing',40,160,320,110,'external');
 box('meta','META INSTAGRAM API\nSigned webhook delivery\nOfficial outbound messaging',440,160,320,110,'external');
 box('cloud','CLOUDFLARE DNS + TUNNEL\nExisting hostname and /instagram\nTunnel reused by partner project',840,160,320,110,'external');
 box('rx','WINDOWS · SYSTEM BOOT TASK\nReceive-only webhook\n127.0.0.1:8000\nSignature + inbound window metadata',1240,160,320,120,'local');
 box('mail','MICROSOFT GRAPH / OUTLOOK\nFallback to current partner email\nNo inbound email commands\nAccepted ≠ delivered',40,430,320,120,'external');
 box('worker','SIGNED-IN WINDOWS WORKER\nFresh partner opt-in / identity / language\nSerialized commands + 11:00 briefing\nNo automatic replay of uncertain effects',440,410,400,140,'agent');
 box('journal','PRIVATE LOCAL STATE\nSQLite ingress + operation journals\nDeduplication / delivery windows\nPer-partner conversation mappings',1240,420,320,130,'local');
 box('ai','OPENAI / CODEX\nIsolated local App Server\nPersistent per-partner conversations\nHost-enforced tools and service catalogue',890,650,350,130,'external');
 box('apps','GOOGLE APPSHEET\nOLTP Find API: current structured facts\nGUI: supported financial workflows\nMapped Borrower Edit API only\nOLAP GUI: verification / partner master',440,650,400,155);
 box('borrower','BORROWERS · HUMAN CONTACT\nPartners collect face-to-face\nPartners manually forward Thai drafts\nAgent does not contact borrowers',40,670,320,120,'note');
 box('boundary','BOUNDARIES\nPartner-only messaging\nNo raw SQL or admin tools\nAuthority from AppSheet',1280,680,280,110,'note');
 edge('partner','meta','commands / replies');edge('meta','cloud','inbound HTTPS');edge('cloud','rx','tunnel');edge('rx','journal','durable ingress');
 edge('journal','worker','new events');edge('worker','meta','verified replies / briefing');edge('worker','mail','IG unavailable');edge('worker','apps','bounded tools');edge('worker','ai','reasoning',false,'exitX=0.85;exitY=1;entryX=0.5;entryY=0;',[[780,595],[1065,595]]);
 box('note','AUTHORITY AND DELIVERY\nPartner master in OLAP controls recipients, opt-in and language. Shared execution login is separate from initiating partner identity.\nIG delivery observes its inbound messaging window; fallback also requires opt-in. Partners collect face-to-face and forward borrower drafts themselves.',40,870,1520,90,'note');
});
page('3 Platform and recovery','PLATFORM | Development, access and recovery','Owner-confirmed service use · Solid = integration · Dashed = supporting relationship · Amber = operational boundary',()=>{
 box('remote','OWNER REMOTE DEVICE\nTailscale private network\nRemote Desktop into Azure VM',40,160,320,120,'external');
 box('vm','MICROSOFT AZURE · WINDOWS VM\nPermanent MW Partner Operations host\nWorker + receiver + cloudflared\nCodex and browser tools',440,160,440,120,'local');
 box('azure','AZURE BACKUP\nCovers Windows VM\nIncludes agent journals and credentials\nCoverage confirmed by owner',1010,160,550,120,'external');
 box('git','GITHUB · PRIVATE SOURCE\nAppSheet-Loan-Project\nMW-Partner-Operations\nScripts, migrations, docs + evidence',40,420,320,130,'external');
 box('fly','LOCAL DEVELOPMENT / FLYWAY\nVersioned immutable SQL migrations\nDirect public-IP SSL connection\nTest DEV; approve exact PROD release',440,420,440,130,'local');
 box('dev','GOOGLE CLOUD SQL · DEV\nSeparate instance + DEV OLTP / OLAP\nSame database name as production\nReviewed development bot destinations',1010,420,550,130);
 box('drive','GOOGLE DRIVE / SHEETS\nLocation data imported into AppSheet\nOne-time source, no live connection\nC:\\GitHub excluded from Drive backup',40,685,360,130);
 box('prod','GOOGLE CLOUD SQL · PROD\nProduction OLTP + OLAP\nBackups / PITR documented\nLogical restore tested in release work',460,685,460,130);
 box('private','PRIVATE CREDENTIALS + JOURNALS\nDocuments/ChatGPT outside Git\nIncluded in Azure Backup\nGit and SQL backups serve different scopes',1030,685,530,130,'note');
 edge('remote','vm','RDP over Tailscale',true);edge('vm','azure','VM backup',true);edge('git','fly','versioned source');edge('fly','dev','develop / validate');edge('fly','prod','approved promotion only');edge('vm','private','private state',true,'exitX=0.9;exitY=1;entryX=0;entryY=0.5;',[[836,330],[950,330],[950,750]]);
 box('site','GOOGLE SITES · PUBLIC PRIVACY PAGE\nPublished privacy information\nPublic website visitors → Google Sites',40,870,600,95);
 box('excluded','OUTSIDE ACTIVE TRANSACTION FLOWS\nNative Money database: historical. Daily export / summary pilot: disabled.\nOpen-Meteo: no commercial key. SQL pg_cron: paused; AppSheet schedules.',690,870,870,95,'note');
});
function endpoints(p,e){const a=p.nodes.find(n=>n.id===e.a),b=p.nodes.find(n=>n.id===e.b);let x1=a.x+a.w/2,y1=a.y+a.h/2,x2=b.x+b.w/2,y2=b.y+b.h/2;if(Math.abs(x2-x1)>Math.abs(y2-y1)){x1+=Math.sign(x2-x1)*a.w/2;x2-=Math.sign(x2-x1)*b.w/2;}else{y1+=Math.sign(y2-y1)*a.h/2;y2-=Math.sign(y2-y1)*b.h/2;}return{x1,y1,x2,y2};}
const diagrams=pages.map((p,i)=>{
 const cells=['<mxCell id="0"/>','<mxCell id="1" parent="0"/>'];
 function textCell(id,value,x,y,w,h,size){cells.push(`<mxCell id="${id}" value="${esc(value)}" style="text;whiteSpace=wrap;html=0;align=left;fontSize=${size};fontColor=#19334d;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`);}
 textCell('title',p.title,40,25,1520,45,30);textCell('subtitle',p.subtitle,40,80,1520,40,16);
 for(const n of p.nodes){const [fill,stroke]=palette[n.kind];cells.push(`<mxCell id="${n.id}" value="${esc(n.label).replace(/\n/g,'&#xa;')}" style="rounded=1;arcSize=12;whiteSpace=wrap;html=0;fontSize=16;fontColor=#19334d;fillColor=${fill};strokeColor=${stroke};spacing=12;" vertex="1" parent="1"><mxGeometry x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" as="geometry"/></mxCell>`);}
 p.edges.forEach((e,j)=>cells.push(`<mxCell id="edge${j}" value="${esc(e.label)}" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=0;fontSize=13;labelBackgroundColor=#ffffff;strokeColor=#718298;endArrow=block;${e.dashed?'dashed=1;':''}${e.style}" edge="1" parent="1" source="${e.a}" target="${e.b}"><mxGeometry relative="1" as="geometry">${e.points.length?`<Array as="points">${e.points.map(([x,y])=>`<mxPoint x="${x}" y="${y}"/>`).join('')}</Array>`:''}</mxGeometry></mxCell>`));
 textCell('footer','Repository evidence + owner confirmations, 16 Sep 2026. Sources: Documents/Loan_Business_Ecosystem.md',40,990,1520,25,13);
 const svg=[`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1040" viewBox="0 0 1600 1040"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="#718298"/></marker></defs><rect width="1600" height="1040" fill="white"/><g font-family="Arial" fill="#19334d"><text x="40" y="57" font-size="30" font-weight="bold">${esc(p.title)}</text><text x="40" y="100" font-size="16">${esc(p.subtitle)}</text>`];
 for(const e of p.edges){const {x1,y1,x2,y2}=endpoints(p,e);svg.push(`<path d="M${x1} ${y1} L${x2} ${y2}" stroke="#718298" stroke-width="2" ${e.dashed?'stroke-dasharray="7 5"':''} marker-end="url(#arrow)"/><text x="${(x1+x2)/2}" y="${(y1+y2)/2-8}" text-anchor="middle" font-size="12" stroke="white" stroke-width="4" paint-order="stroke">${esc(e.label)}</text>`);}
 for(const n of p.nodes){const [fill,stroke]=palette[n.kind],lines=n.label.split('\n');svg.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="12" fill="${fill}" stroke="${stroke}"/>`);lines.forEach((l,k)=>svg.push(`<text x="${n.x+n.w/2}" y="${n.y+n.h/2-(lines.length-1)*11+k*22+5}" text-anchor="middle" font-size="${k===0?16:15}" ${k===0?'font-weight="bold"':''}>${esc(l)}</text>`));}
 svg.push('<text x="40" y="1010" font-size="13">Repository-grounded documentation · See Documents/Loan_Business_Ecosystem.md for evidence and qualifications.</text></g></svg>');
 fs.writeFileSync(path.join(out,`page-${i+1}.svg`),svg.join('\n'));
 return `<diagram id="ecosystem-${i+1}" name="${esc(p.name)}"><mxGraphModel grid="1" gridSize="10" page="1" pageScale="1" pageWidth="1600" pageHeight="1040"><root>${cells.join('\n')}</root></mxGraphModel></diagram>`;
});
fs.writeFileSync(path.join(root,'Documents/Loan_Business_Ecosystem.drawio'),`<mxfile host="app.diagrams.net" agent="Codex" version="26.0.0">${diagrams.join('\n')}</mxfile>`);
console.log(`Generated ${pages.length} editable draw.io pages and SVG layout previews.`);
