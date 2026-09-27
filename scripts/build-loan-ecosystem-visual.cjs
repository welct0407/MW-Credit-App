// Current one-page architecture, reconciled to owning references on 27 September 2026.
// Documentation only: embeds local logos and writes one editable draw.io file.
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..'),dir=path.join(root,'outputs/loan-ecosystem-20260916/logos');
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'&#xa;');
const cells=['<mxCell id="0"/>','<mxCell id="1" parent="0"/>'];let seq=0;
function shape(id,value,x,y,w,h,style){cells.push(`<mxCell id="${id}" value="${esc(value)}" style="${style};html=0;fontFamily=Helvetica;whiteSpace=wrap;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`);}
function text(v,x,y,w,h,size=20,color='#18324D',bold=false){shape('t'+seq++,v,x,y,w,h,`text;align=left;verticalAlign=middle;fontSize=${size};fontColor=${color};fontStyle=${bold?1:0}`);}
function logo(name,x,y,size=48){const resource={loan:'Loan Manager App Logo.png',insights:'Loan Business Insights App Logo.png'}[name];const ext=resource?'png':fs.existsSync(path.join(dir,name+'.svg'))?'svg':'png',raw=fs.readFileSync(resource?path.join(root,'resources',resource):path.join(dir,name+'.'+ext));const data=ext==='svg'?`data:image/svg+xml,${encodeURIComponent(raw.toString())}`:`data:image/png,${raw.toString('base64')}`;shape('logo'+seq++,'',x,y,size,size,`shape=image;imageAspect=1;aspect=fixed;image=${data}`);}
function card(id,title,body,x,y,w,h,brand,accent='#2468B4',kind='rounded=1;arcSize=14'){shape(id,'',x,y,w,h,`${kind};fillColor=#FFFFFF;strokeColor=#DCE5EE;strokeWidth=1.5`);if(brand)logo(brand,x+18,y+18,44);text(title,x+(brand?78:20),y+14,w-(brand?96:40),45,24,accent,true);text(body,x+20,y+65,w-40,h-72,19,'#456078');}
function line(a,b,label,color='#4285F4',style='',points=[]){cells.push(`<mxCell id="e${seq++}" value="${esc(label)}" style="edgeStyle=orthogonalEdgeStyle;rounded=1;strokeWidth=2.5;strokeColor=${color};endArrow=block;endFill=1;fontFamily=Helvetica;fontSize=17;fontColor=${color};labelBackgroundColor=#F7FAFD;${style}" edge="1" parent="1" source="${a}" target="${b}"><mxGeometry relative="1" as="geometry">${points.length?`<Array as="points">${points.map(([x,y])=>`<mxPoint x="${x}" y="${y}"/>`).join('')}</Array>`:''}</mxGeometry></mxCell>`);}
function panel(id,title,sub,x,y,w,h,color,fill,brand){shape(id,'',x,y,w,h,`rounded=1;arcSize=5;fillColor=${fill};strokeColor=${color};strokeWidth=1.5`);logo(brand,x+24,y+22,44);text(title,x+84,y+16,w-108,40,27,color,true);text(sub,x+24,y+73,w-48,40,18,color);}
shape('background','',0,0,2400,1770,'fillColor=#F7FAFD;strokeColor=none');
text('MW CREDIT',45,25,410,60,44,'#132A44',true);text('Your loan business, connected',480,29,1780,55,36,'#132A44',true);
text('27 SEPTEMBER 2026     •     One-page ecosystem     •     Product logos are embedded and work offline',48,96,2250,35,21,'#627C92');
for(const [id,label,x,w,sub] of [['staff','OWNER & OPERATIONS',60,650,'AppSheet for daily work • Metabase for insight'],['partners','PARTNERS & REVIEWERS',820,640,'Conversations, receipt decisions and cash statements'],['borrowers','BORROWERS',1640,640,'Payments and receipt images through permitted Instagram paths']]){shape(id,'',x,170,40,58,'shape=umlActor;fillColor=#FFFFFF;strokeColor=#36556F;strokeWidth=2');text(label,x+65,166,w-65,30,21,'#18324D',true);text(sub,x+65,202,w-65,36,18,'#627C92');}
panel('apps','01   RUN THE BUSINESS','Google AppSheet · operational and partner workflows',40,310,670,535,'#2468B4','#EDF5FF','appsheet');
card('oltp','Loan Manager · OLTP','Borrowers, loans, payments and cash.\nCollection review and receipt images.',75,445,600,145,'loan');
card('olap','Loan Business Insights · OLAP','Partner management, capital and settlements.\nCash administration and analytical workflows.',75,630,600,145,'insights');
text('DEV + PROD app pairs • daily charges + hourly analytics',75,794,600,30,17,'#2468B4');
panel('data','02   SHARED DATA','Google Cloud · one SQL instance, separate databases',790,310,690,535,'#6550A1','#F3F0FB','googlecloud');
card('sql','Cloud SQL · PostgreSQL','loan_manager_prod  — business system of record\nloan_manager_dev    — development data\nmw_agent                    — agent journals and audit',825,445,620,180,'postgresql','#6550A1','shape=cylinder3;size=15;boundedLbl=1;backgroundOutline=1');
card('gcs','Cloud Storage · receipt images','One private GCS bucket: original agent evidence\nand manual AppSheet uploads; shared DEV / PROD.',825,692,620,116,'googlecloudstorage','#6550A1');
panel('agent','03   INTEGRATION AGENT','Debian 13 on Google Compute Engine · vm-mw-credit-agent',1560,310,800,855,'#137F78','#EAF8F4','debian');logo('googlecloud',2284,336,42);
card('ig','Instagram / Meta','Signed webhooks + receipt polling\nPartner replies and review notices',1595,445,340,140,'instagram','#BC3874');
card('cf','Cloudflare','hooks.mw-credit.com\nSecure tunnel → Debian receiver',1980,445,345,140,'cloudflare','#C46A14');
card('worker','MW Integration Agent','Partner conversations • receipt processing\nOrdinary payments auto-post after checks;\nexceptions require review / manual handling.\nDaily cash statements at 00:15 Bangkok.',1595,685,420,230,null,'#137F78');
shape('mwbadge','MW',1934,699,58,44,'rounded=1;fillColor=#137F78;strokeColor=none;fontColor=#FFFFFF;fontStyle=1;fontSize=19');
card('ai','OpenAI / Codex','Reasoning, extraction\nand partner conversations',2080,685,245,140,'openai','#137F78');
card('email','Outlook / Graph','Email fallback for notices\nand cash statements',2080,945,245,150,'microsoftoutlook','#0078D4');
card('proxy','Cloud SQL Auth Proxy','Restricted readers, reviewer DML,\nagent state and audit relay.\nCodex session/auth files stay on Debian.',1595,985,420,145,'googlecloud','#137F78');
text('Official APIs • role checks • durable audit • no AppSheet GUI executor',1595,1132,735,25,16,'#416B65');
// Business and agent connections. Routes stay in the gaps between cards.
line('oltp','sql','read / write','#2468B4','exitX=1;exitY=0.28;entryX=0;entryY=0.26;');
line('olap','sql','read / write','#2468B4','exitX=1;exitY=0.15;entryX=0;entryY=0.8;',[[748,652],[748,589]]);
line('oltp','gcs','upload / display','#6550A1','exitX=1;exitY=0.75;entryX=0;entryY=0.55;',[[725,554],[725,825],[765,825],[765,756]]);
line('ig','cf','webhook','#137F78');line('cf','worker','ingress','#137F78','exitX=0.5;exitY=1;entryX=0.8;entryY=0;',[[2152,630],[1931,630]]);
line('worker','ig','API replies / polling','#137F78','exitX=0.25;exitY=0;entryX=0.3;entryY=1;');
line('worker','ai','AI','#137F78');line('worker','email','fallback','#137F78','exitX=1;exitY=0.8;entryX=0;entryY=0.45;',[[2042,869],[2042,1013]]);
line('worker','proxy','state / data','#137F78','exitX=0.5;exitY=1;entryX=0.5;entryY=0;');
line('worker','gcs','archive','#137F78','exitX=0;exitY=0.3;entryX=1;entryY=0.5;');
line('proxy','sql','proxy → SQL','#137F78','exitX=0;exitY=0.3;entryX=1;entryY=0.5;',[[1510,1028],[1510,535]]);
text('Agent also uses both AppSheet APIs for permitted reads / writes; SQL reviewer operations use a separate restricted role.',60,867,1410,44,19,'#416B65');
panel('reports','04   REPORTS & EXPLORATION','reports.mw-credit.com · Metabase reads governed PROD SQL views, not an OLAP export',40,950,1440,215,'#4A6082','#EDF2F8','metabase');
logo('railway',73,1085,40);text('Railway hosting',130,1070,360,32,22,'#18324D',true);text('Metabase + SQL proxy + private app PostgreSQL',130,1106,650,32,18,'#456078');
logo('debian',870,1085,40);text('Custom borrower matrix',925,1070,490,32,22,'#18324D',true);text('Debian chart service → charts.mw-credit.com → embedded chart',810,1106,630,32,17,'#456078');
line('sql','reports','read-only reporting views','#6550A1','exitX=0.55;exitY=1;entryX=0.68;entryY=0;dashed=1;',[[1166,660],[1460,660],[1460,921],[1019,921]]);
text('05   ACCESS, MONITORING & RECOVERY',45,1210,2250,42,28,'#18324D',true);
card('monitor','Grafana Cloud + IRM','monitor.mw-credit.com\nPerformance, cost, receipt / backup health\nGCP + Azure + Railway APIs → dashboards\nAlerts → owner mobile push',40,1290,560,195,'grafana','#C66B18');
card('access','Tailscale + Azure Windows','Private SSH to Debian; IAP for recovery.\nPrivate RDP to the Azure workstation.\nOld Windows partner worker is stopped.',625,1290,565,195,'tailscale','#33485A');logo('microsoftazure',1094,1312,34);logo('windows',1135,1312,30);
card('backups','Backups by platform','Cloud SQL: automated backup + PITR.\nGCE: Debian disk snapshots.\nRailway: app DB snapshots + PITR.\nAzure: VM / credential recovery.',1215,1290,565,195,'azurebackup','#2468B4');
card('dev','GitHub + Flyway','Versioned source and SQL migrations.\nDEV tests → frozen RC → PROD upgrade.\nRC is an app copy, not a third SQL DB.',1805,1290,555,195,'github','#33485A');logo('flyway',2285,1310,42);
card('site','Google Sites','Published privacy page for public visitors.',40,1530,690,130,'googlesites');
card('legacy','Drive / Sheets · prior import only','Borrower-location data was loaded into AppSheet.\nThe original sheet is not a live data feed.',760,1530,850,130,'googledrive','#8E6625');logo('googlesheets',1536,1552,36);
card('dns','Cloudflare DNS','Friendly addresses for reports, charts,\nmonitoring and webhook ingress.',1640,1530,720,130,'cloudflare','#C46A14');
text('Architecture as of 27 September 2026 • Looker retired • MW AI Collection excluded • Old Windows partner runtime paused • Blue: app data  |  Teal: agent  |  Purple: storage / reporting',45,1700,2310,42,17,'#71879A');
fs.writeFileSync(path.join(root,'Documents/Loan_Business_Ecosystem.drawio'),`<mxfile host="app.diagrams.net"><diagram id="ecosystem-visual" name="Loan business ecosystem"><mxGraphModel grid="1" gridSize="10" page="1" pageScale="1" pageWidth="2400" pageHeight="1770" background="#F7FAFD"><root>${cells.join('\n')}</root></mxGraphModel></diagram></mxfile>`);
console.log('Generated current single-page ecosystem with embedded product and app logos.');
