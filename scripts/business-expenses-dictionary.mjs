import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const refine=process.argv.includes('--refine');
const file='Documents/AppSheet_Data_Dictionary.xlsx',out=refine?'outputs/expense-dashboard-refinement-20260916':'outputs/business-expenses-20260916';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const before=Object.fromEntries(wb.worksheets.items.map(s=>[s.name,s.getUsedRange().values]));
if(!process.argv.includes('--edit')){
 console.log(JSON.stringify(Object.fromEntries(Object.entries(before).map(([n,r])=>[n,{head:r[0],rows:r.length}]))));
 console.log((await wb.inspect({kind:'region',sheetId:'Dev Differences',range:'A1:E4',maxChars:2500})).ndjson);
 const png=await wb.render({sheetName:'Dev Differences',range:'A1:E4',scale:1,format:'png'});
 await fs.writeFile(out+'/dictionary-before.png',new Uint8Array(await png.arrayBuffer()));process.exit(0);
}
// Names/settings reconciled against saved Chrome appdoc, 16 September 2026.
// Production inventory is preserved; this change is DEV only.
const versions=refine?{OLTP:'1.000088',OLAP:'1.000090'}:{OLTP:'1.000081',OLAP:'1.000084'};
const names=['Row ID','Expense Date','Expense Category','Amount','Payee Name','Ref Payee Borrower','Ref Related Borrower','Ref Related Loan','Notes','Source Type','Source Key','Gross Profit Basis','Allocation Basis','Partner A Share','Partner B Share','Partner A Expense','Partner B Expense','Rule Version','Created At','Created By'];
const manual=['Expense Date','Expense Category','Amount','Payee Name','Ref Related Borrower','Ref Related Loan','Notes'];
const refs={'Ref Payee Borrower':'Borrowers','Ref Related Borrower':'Borrowers','Ref Related Loan':'Loans'};
const types={ 'Row ID':'Text','Expense Date':'Date','Expense Category':'Enum',Amount:'Price','Payee Name':'Name',...Object.fromEntries(Object.keys(refs).map(n=>[n,'Ref'])),Notes:'LongText','Source Type':'Text','Source Key':'LongText','Gross Profit Basis':'Price','Allocation Basis':'LongText','Partner A Share':'Decimal','Partner B Share':'Decimal','Partner A Expense':'Price','Partner B Expense':'Price','Rule Version':'LongText','Created At':'DateTime','Created By':'LongText'};
const initial={'Row ID':'UNIQUEID()','Expense Date':'TODAY()','Source Type':'"Manual"','Created At':'NOW()','Created By':'USEREMAIL()'};
types['Partner A Share']='Percent';types['Partner B Share']='Percent';
const formulas={
 'Partners.Net Profit Earned':'[Total Profit Earned] - IFS([Partner Role] = "A", SUM(Business Expenses[Partner A Expense]), [Partner Role] = "B", SUM(Business Expenses[Partner B Expense]))',
 'Partners.Net Available to Settle':'[Net Profit Earned] - [Total Settlement Created]',
 'Statistics.Total Business Expenses':'SUM(Business Expenses[Amount])',
 'Statistics.Net Profit':'[Total Profit] - [Total Business Expenses]',
 'Statistics.Expenses MTD':'SUM(SELECT(Business Expenses[Amount], AND([Expense Date] >= EOMONTH(TODAY(), -1) + 1, [Expense Date] <= TODAY())))',
 'Statistics.Net Profit MTD':'[Realized Profit MTD] - [Expenses MTD]',
 'Statistics.Net Unsettled Profit':'[Total Unsettled Profit] - [Total Business Expenses]',
 'Statistics.Net Expected Loan Account Balance':'[Expected Loan Account Balance] - [Total Business Expenses]'
};
const expected=structuredClone(before),changed=[];
const upsert=(sheet,pred,row)=>{const i=expected[sheet].findIndex(pred);expected[sheet][i<0?expected[sheet].length:i]=row;};
const diff=(app,obj,prop,prod,dev)=>upsert('Dev Differences',r=>r[0]===app&&r[1]===obj&&r[2]===prop,[app,obj,prop,prod,dev]);
if(!refine){
for(const app of ['OLTP','OLAP']){
 diff(app,'Business Expenses','Table / ownership','Absent',app==='OLTP'?'database-3; ADDS_AND_UPDATES; operational entry; SQL blocks deletes and automated edits':'database-3; READ_ONLY; no editing actions');
 for(const name of names){
  const type=app==='OLAP'&&['Expense Category','Source Type'].includes(name)?(name==='Expense Category'?'Text':'LongText'):types[name];
  const fields={Type:type,Virtual:'No',Key:name==='Row ID'?'Yes':'No',Hidden:app==='OLTP'&&!manual.includes(name)||name==='Row ID'?'Yes':'No','Read-Only':app==='OLTP'?(manual.includes(name)?'No':'Yes'):'No; table READ_ONLY',
   'Initial value':app==='OLTP'?(initial[name]||'Blank'):(['Expense Date','Created At'].includes(name)?initial[name]:'Blank'),'App formula':'Blank; SQL derives allocation/audit/automated rebate fields'};
  if(refs[name])fields.Relationship='Ref '+refs[name]+'.Row ID; IsPartOf false';
  if(type==='Price')fields.Format='฿; 0 decimals';
  if(type==='Percent')fields.Format='Percent with 2 displayed decimal places; SQL numeric precision retained';
  for(const [k,v]of Object.entries(fields))diff(app,'Business Expenses.'+name,k,'Absent',v);
 }
 diff(app,'Borrowers.Ref Referrer','Definition','Absent','Physical Ref Borrowers.Row ID; nullable; IsPartOf false; no initial/App formula; shown; '+(app==='OLTP'?'editable':'read-only'));
 diff(app,'Borrowers.Ref Referrer','Display name','Absent','"ผู้แนะนำ / Referrer"');
 for(const [table,name,ref]of [['Borrowers','Related Business Expenses By Ref Payee Borrower','Ref Payee Borrower'],['Borrowers','Related Business Expenses By Ref Related Borrower','Ref Related Borrower'],['Loans','Related Business Expenses','Ref Related Loan']]){
  diff(app,table+'.'+name,'Definition','Absent','Virtual List Ref Business Expenses; read-only; shown; REF_ROWS("Business Expenses", "'+ref+'")');
 }
 diff(app,'Business Expenses','Views','Absent','Menu table and generated detail; '+(app==='OLTP'?'manual form has exactly '+manual.join(', ')+'. Sort date descending, group category ascending, sum Amount.':'read-only ledger including allocation/source details.'));
}
diff('OLTP','Borrowers.Ref Referrer','Valid_If','Absent','SELECT(Borrowers[Row ID], [Row ID] <> [_THISROW].[Row ID])');
diff('OLTP','Business Expenses.Expense Category','Valid_If','Absent','IF([Source Type] = "Referral Rebate", LIST("Referral Rebate"), LIST("Collection Cost", "Transportation", "Bank / Transfer Fee", "Software / Subscription", "Other"))');
diff('OLTP','Business Expenses.Amount','Valid_If','Absent','AND([_THIS] <> 0, [_THIS] = ROUND([_THIS]), OR([_THIS] > 0, ISNOTBLANK([Notes])))');
diff('OLTP','Business Expenses.Edit','Only if','Absent','[Source Type] = "Manual"; automatic expenses show no edit/delete action');
for(const view of ['Borrowers_Form','Visible Borrowers_Form','Borrowers_Detail','Visible Borrowers_Detail'])diff('OLTP',view,'Column order','Existing manual order','Existing columns preserved; Ref Referrer appended');
diff('OLAP','Borrowers_Detail','Column order','Existing manual order','Existing columns preserved; Ref Referrer, Related Referral Expenses, Total Referral Rebate Earned appended');
diff('OLAP','Borrowers.Related Referral Expenses','Definition','Absent','Virtual List Ref Business Expenses; read-only; shown; FILTER("Business Expenses", AND([Ref Payee Borrower] = [_THISROW].[Row ID], [Source Type] = "Referral Rebate"))');
diff('OLAP','Borrowers.Total Referral Rebate Earned','Definition','Absent','Virtual Price ฿0; read-only; shown; SUM([Related Referral Expenses][Amount])');
for(const [obj,formula]of Object.entries(formulas)){
 diff('OLAP',obj,'Definition','Absent','Virtual Price, ฿, 0 decimals; read-only; shown');
 diff('OLAP',obj,'App formula','Absent',formula);
}
diff('OLAP','Partners.Summary - Total Profit Earned','App formula','CONCATENATE("กำไรรวมที่ได้รับ / Total Profit: ", TEXT([Total Profit Earned]))','CONCATENATE("กำไรรวมที่ได้รับ / Total Profit: ", TEXT([Net Profit Earned]))');
diff('OLAP','Partners.Summary - Available Pending Settlement','App formula','Pending branch unchanged; Available to Settle in other branch','IF([Pending Settlement] > 0, CONCATENATE("รอโอน / Pending Settlement: ", TEXT([Pending Settlement])), CONCATENATE("พร้อมโอน / Available to Settle: ", TEXT([Net Available to Settle])))');
diff('OLAP','Partners_Detail','Column order','13 existing fields','Same 13 fields/order; Total Profit Earned → Net Profit Earned; Available to Settle → Net Available to Settle; original displayed labels preserved');
diff('OLAP','Create Settlement','Amount / condition','Available to Settle / [Available to Settle] > 0','[Net Available to Settle] / [Net Available to Settle] > 0; existing confirmation preserved');
diff('OLAP','Settlements.Amount','Valid_If','Existing gross limit','AND([_THIS] > 0, OR(AND([_THIS] = LOOKUP([Row ID], "Settlements", "Row ID", "Amount"), [Ref Partner] = LOOKUP([Row ID], "Settlements", "Row ID", "Ref Partner")), [_THIS] <= [Ref Partner].[Net Profit Earned] - SUM(SELECT(Settlements[Amount], AND([Ref Partner] = [_THISROW].[Ref Partner], [Row ID] <> [_THISROW].[Row ID])))))');
for(const name of ['Business Expenses','Net Profit','Net Unsettled Profit EOD'])diff('OLAP','Daily Analytics.'+name,'Definition','Absent','Physical Price ฿0; blank App formula; shown; column editable metadata No restriction, effective table READ_ONLY; SQL-owned snapshot');
diff('OLAP','Analytics Data','Column order','Existing fields','Total Business Expenses + Net Profit after Total Profit; Expenses MTD + Net Profit MTD after Realized Profit MTD; gross fields retained');
diff('OLAP','KPIs','Column order','Existing 17 fields','Six new Statistics fields appended; existing gross fields retained');
const borrowerAdd='Ref Referrer; Related Business Expenses By Ref Payee Borrower; Related Business Expenses By Ref Related Borrower';
for(const name of ['Visible Borrowers','Todays Collection Board'])diff('OLTP',name,'Slice Columns','Existing membership',borrowerAdd+' appended; existing filter/permissions unchanged');
for(const name of ['Borrowers with Outstanding Loans','Profit Contribution 30D','Reporting Borrowers','Todays Collection Board'])diff('OLAP',name,'Slice Columns','Existing membership',borrowerAdd+' appended; filter/READ_ONLY unchanged');
diff('OLAP','Reporting Loans','Slice Columns','Existing membership','Related Business Expenses appended; filter/READ_ONLY unchanged');
for(const name of ['Daily Analytics 7 Days','Daily Analytics 30 Days','Daily Analytics 90 Days','Reporting Daily Analytics'])diff('OLAP',name,'Slice Columns','Existing membership','Business Expenses; Net Profit; Net Unsettled Profit EOD appended; filter/READ_ONLY unchanged');
diff('Database','Flyway','Version','V14','V16');diff('Database','Flyway','Schema version','V14','V16');
for(const [app,version]of Object.entries(versions))upsert('App Settings',r=>r[0]==='development-'+app.toLowerCase()&&r[1]==='Version',['development-'+app.toLowerCase(),'Version','Saved app version',version,'Chrome saved definition; business expenses DEV; owner acceptance pending']);
for(const name of ['Notification - First-Day Charge','Notification - New Loan Created','Notification - Loan Closed','Notification - Charge Received'])diff('OLTP',name,'Development enabled state','Production unchanged','Disabled for current DEV test isolation; destinations/templates unchanged');
const sql=await fs.readFile('database/migrations/V15__business_expenses_and_referrals.sql','utf8');
const dbTypes={...Object.fromEntries(names.map(n=>[n,'text'])),'Expense Date':'date',Amount:'money','Gross Profit Basis':'money','Partner A Share':'numeric','Partner B Share':'numeric','Partner A Expense':'money','Partner B Expense':'money','Created At':'timestamp without time zone'};
const notNull=['Row ID','Expense Date','Expense Category','Amount','Source Type','Allocation Basis','Partner A Share','Partner B Share','Partner A Expense','Partner B Expense','Created At','Created By'];
for(let i=0;i<names.length;i++){let n=names[i];upsert('DB Columns',r=>r[0]==='DEV Business Expenses'&&r[1]===n,['DEV Business Expenses',n,i+1,dbTypes[n],notNull.includes(n)?'NO':'YES',n==='Source Type'?"'Manual'::text":n==='Created By'?"'SQL'::text":n==='Created At'?"statement_timestamp() AT TIME ZONE 'Asia/Bangkok'":'']);}
upsert('DB Columns',r=>r[0]==='DEV Borrowers'&&r[1]==='Ref Referrer',['DEV Borrowers','Ref Referrer','V15 additive','text','YES','']);
for(const n of ['Business Expenses','Net Profit','Net Unsettled Profit EOD'])upsert('DB Columns',r=>r[0]==='DEV Daily Analytics'&&r[1]===n,['DEV Daily Analytics',n,'V15 additive','money','YES','']);
const audit=(await fs.readFile(out+'/dev-final-reconciliation.jsonl','utf8')).replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(JSON.parse);
for(const c of audit.filter(r=>r.kind==='db_column'))upsert('DB Columns',r=>r[0]==='DEV '+c.table&&r[1]===c.name,['DEV '+c.table,c.name,c.position,c.type,c.nullable,c.default||'']);
for(const c of audit.filter(r=>r.kind==='db_constraint'))upsert('DB Constraints',r=>r[0]==='DEV '+c.table.replaceAll('"','')&&r[1]===c.name,['DEV '+c.table.replaceAll('"',''),c.name,c.type,c.validated?'Yes':'No',c.definition]);
for(const c of audit.filter(r=>r.kind==='db_index'))upsert('DB Logic',r=>r[0]==='Development index'&&r[2]===c.name,['Development index',c.table,c.name,'V15',c.definition]);
for(const m of sql.matchAll(/CREATE(?: OR REPLACE)? FUNCTION public\.([a-z_]+)\(/g))upsert('DB Logic',r=>r[0]==='Development function'&&r[2]===m[1],['Development function','public',m[1],m[1]==='partner_net_profit'?'V16':'V15','Immutable migration; referral/expense integrity and recalculation, net settlement or analytics. See business-expenses report.']);
for(const m of sql.matchAll(/CREATE(?: CONSTRAINT)? TRIGGER ([a-z_]+)[\s\S]*? ON public\."([^"]+)"/g))upsert('DB Logic',r=>r[0]==='Development trigger'&&r[1]===m[2]&&r[2]===m[1],['Development trigger',m[2],m[1],'V15','See immutable migration for event, timing and function; deferred financial recalculation where specified.']);
upsert('Guide',r=>r[0]==='Development business expenses',['Development business expenses','DEV V16; OLTP '+versions.OLTP+'; OLAP '+versions.OLAP,'Expense ledger/referrer/net statistics/partner reporting. Production remains V14. Current Chrome apps reconciled; SQL/local concurrency + synthetic GUI normal referral/manual/offset verified. Owner acceptance and Looker phase pending.']);
}else{
 const common={
  'Expenses MTD':['Price','SUM(SELECT(Business Expenses[Amount], AND([Expense Date] >= EOMONTH(TODAY(), -1) + 1, [Expense Date] <= TODAY())))','"ค่าใช้จ่ายเดือนนี้ / Expenses MTD"'],
  'Net Profit MTD':['Price','[Realized Profit MTD] - [Expenses MTD]','"รายได้สุทธิ / Net Income"'],
  'Income Statement Expenses MTD':['Price','0 - [Expenses MTD]','"ค่าใช้จ่าย / Expenses"'],
  'Operating Income MTD':['Price','[Realized Profit MTD]','"รายได้จากการดำเนินงาน / Operating Income"'],
  'Header - Income Statement MTD':['Text','"──── งบกำไรขาดทุนเดือนนี้ / Income Statement MTD ────"','" "']
 };
 for(const app of ['OLTP','OLAP']){
  const cols={...common,'Net Profit':['Price',app==='OLTP'?'[Total Profit] - SUM(Business Expenses[Amount])':'[Total Profit] - [Total Business Expenses]','"กำไรสุทธิรวม / Total Net Profit"']};
  for(const [name,[type,formula,label]]of Object.entries(cols)){
   diff(app,'Statistics.'+name,'Definition','Absent',`Virtual ${type}${type==='Price'?', ฿, 0 decimals':''}; read-only; shown; no key, label, initial value or Ref`);
   diff(app,'Statistics.'+name,'App formula','Absent',formula);
   diff(app,'Statistics.'+name,'Display name','Absent',label);
  }
  for(const [name,condition,color]of [['Expense Red','[Amount] > 0','#C62828'],['Offset Green','[Amount] < 0','#2E7D32']])diff(app,'Business Expenses - '+name,'Format rule','Absent',`Business Expenses; target Amount; ${condition}; text ${color}; enabled; no icon or background`);
  upsert('App Settings',r=>r[0]==='development-'+app.toLowerCase()&&r[1]==='Version',['development-'+app.toLowerCase(),'Version','Saved app version',versions[app],'Chrome saved definition; expense/dashboard refinements; owner acceptance pending']);
 }
 diff('OLTP','Business Expenses','Views','Absent','Owner deck preserved: auto primary; Amount secondary; Expense Date summary; square image; action bar on; category ascending / SUM Amount; Expense Date descending. Seven-field manual form unchanged.');
 diff('OLTP','Business Expenses.Expense Category','Valid_If','Absent','IF([Source Type] = "Referral Rebate", LIST("Referral Rebate"), LIST("Collection Cost / ค่าใช้จ่ายติดตามหนี้", "Transportation / ค่าเดินทาง", "Bank / Transfer Fee / ค่าธรรมเนียมธนาคารและโอนเงิน", "Software / Subscription / ค่าซอฟต์แวร์และสมาชิก", "Other / อื่น ๆ"))');
 for(const [name,label]of [['Borrower','ผู้กู้ที่เกี่ยวข้อง (ไม่บังคับ) / Related Borrower (optional)'],['Loan','สินเชื่อที่เกี่ยวข้อง (ไม่บังคับ) / Related Loan (optional)']])diff('OLTP','Business Expenses.Ref Related '+name,'Display name','Absent','"'+label+'"');
 diff('OLTP','Business Expenses.Expense Category','Existing rows','Absent','No category backfill. Existing English values remain. Editing a legacy manual expense requires choosing a bilingual category. Automatic Referral Rebate remains SQL-owned English and read-only.');
 const tOrder=['Pending Payment Amount',"Today's Profit","Yesterday's Profit",'Net Profit','Header - Collection Status','Borrowers Not Paid Today','Borrowers Partially Paid Today','Borrowers with Overdue Payment','Borrowers Fully Paid Today','Header - Monthly Forecast','Expected Daily Interest','Realized Profit MTD','Forecast Remaining Interest','Projected Monthly Profit','Header - Outstanding Loans','Outstanding Principal','Total Profit of Outstanding Loans','Profit Coverage of Outstanding Principal','Header - Income Statement MTD','Operating Income MTD','Income Statement Expenses MTD','Net Profit MTD'];
 const aOrder=['Pending Payment Amount',"Today's Profit","Yesterday's Profit",'Net Profit','Header - Monthly Forecast','Realized Profit MTD','Forecast Remaining Interest','Projected Monthly Profit','Header - Outstanding Loans','Outstanding Principal','Total Profit of Outstanding Loans','Profit Coverage of Outstanding Principal','Header - Income Statement MTD','Operating Income MTD','Income Statement Expenses MTD','Net Profit MTD','Header - Cash Pool','Total Cash Pool','Total Outstanding Principal','Net Unsettled Profit','Net Expected Loan Account Balance'];
 diff('OLTP','KPIs','Column order','Existing gross KPI layout',tOrder.join('; '));
 diff('OLAP','KPIs','Column order','Existing 17 fields',aOrder.join('; '));
 diff('OLAP','Reporting Statistics','Refinement reconciliation','Existing curated slice','17 columns unchanged; READ_ONLY. New dashboard presentation VCs are not added to the export slice.');
 upsert('Guide',r=>r[0]==='Development business expenses',['Development business expenses','DEV V16; OLTP '+versions.OLTP+'; OLAP '+versions.OLAP,'Chrome verified: owner expense deck, bilingual manual choices, signed amount colors, net dashboard and MTD statement, four Cash Pool fields. Partner figures reconcile. Production unchanged. Owner/mobile acceptance and Looker phase pending.']);
}
const txt=v=>typeof v==='string'&&v.startsWith('=')?"'"+v:v??'';
for(const [name,rows]of Object.entries(expected)){
 const sh=wb.worksheets.getItem(name),old=before[name],width=old[0].length;
 for(let i=0;i<rows.length;i++){
  if(JSON.stringify(rows[i])===JSON.stringify(old[i]))continue;
  const r=sh.getRangeByIndexes(i,0,1,width);
  if(i>=old.length){r.copyFrom(sh.getRangeByIndexes(old.length-1,0,1,width),'all');r.format.wrapText=true;r.format.verticalAlignment='top';r.format.rowHeight=90;}
  r.values=[rows[i].map(txt)];changed.push({sheet:name,row:i+1});
 }
}
if(refine){
 const sh=wb.worksheets.getItem('Dev Differences');
 for(let i=0;i<expected['Dev Differences'].length;i++){
  const r=expected['Dev Differences'][i];
  if((r[1]==='KPIs'&&r[2]==='Column order')||(r[0]==='OLTP'&&r[1]==='Business Expenses.Expense Category'&&r[2]==='Valid_If')){
   sh.getRangeByIndexes(i,0,1,5).format.autofitRows();
  }
 }
}
wb.recalculate();
const scan=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},summary:'Expense dictionary error scan'});
await fs.writeFile(out+'/dictionary-error-scan.jsonl',scan.ndjson);
const first=expected['Dev Differences'].findIndex(r=>r[0]==='OLTP'&&r[1]===(refine?'Statistics.Operating Income MTD':'Business Expenses'))+1;
const png=await wb.render({sheetName:'Dev Differences',range:`A${first}:E${first+3}`,scale:1,format:'png'});
await fs.writeFile(out+'/dictionary-after.png',new Uint8Array(await png.arrayBuffer()));
if(refine)for(const app of ['OLTP','OLAP']){
 const row=expected['Dev Differences'].findIndex(r=>r[0]===app&&r[1]==='KPIs'&&r[2]==='Column order')+1;
 const preview=await wb.render({sheetName:'Dev Differences',range:`A${row}:E${row}`,scale:1,format:'png'});
 await fs.writeFile(out+'/dictionary-kpis-'+app.toLowerCase()+'.png',new Uint8Array(await preview.arrayBuffer()));
}
const stage=out+'/dictionary-staged.xlsx';await(await SpreadsheetFile.exportXlsx(wb)).save(stage);
const reopened=await SpreadsheetFile.importXlsx(await FileBlob.load(stage));
const norm=rows=>{const r=rows.map(x=>x.map(v=>v??''));while(r.length&&r.at(-1).every(v=>v===''))r.pop();return r;};
for(const s of reopened.worksheets.items)if(JSON.stringify(norm(s.getUsedRange().values))!==JSON.stringify(norm(expected[s.name])))throw Error('Unexpected dictionary difference '+s.name);
await fs.copyFile(stage,file);await fs.unlink(stage);await fs.unlink(stage+'.inspect.ndjson').catch(()=>{});
await fs.writeFile(out+'/dictionary-changes.json',JSON.stringify({allSheetsRoundtrip:true,versions,changed},null,2));
console.log(JSON.stringify({allSheetsRoundtrip:true,changedRows:changed.length}));
