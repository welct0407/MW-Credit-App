import fs from 'node:fs/promises';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/borrower-name-vc-20260915';
const out='C:/GitHub/AppSheet-Loan-Project/outputs/borrower-name-vc-20260915';
const index=d=>{let schema='';const map={};for(const {rows:r} of d){if(!r.length)continue;const[k,v]=r[0],o=Object.fromEntries(r.filter(x=>x.length===2));if(k==='Schema Name')schema=v;const key=k==='Column name'?`Column:${schema}:${v}`:k==='Action name'?`${k}:${o['For a record of this table']}:${v}`:`${k}:${v}`;if(map[key])throw Error('Duplicate object '+key);map[key]=o;}return map;};
const apps=[];
for(const app of ['olap','oltp','olap-copy','oltp-copy']){
 const before=index(JSON.parse(await fs.readFile(`${priv}/${app}-before.json`,'utf8'))),after=index(JSON.parse(await fs.readFile(`${priv}/${app}-after.json`,'utf8')));
 const removed=Object.keys(before).filter(k=>!after[k]),added=Object.keys(after).filter(k=>!before[k]);if(removed.length||added.length)throw Error(`Object inventory changed: ${app}`);
 const differences=[];
 for(const k of Object.keys(before))for(const f of new Set([...Object.keys(before[k]),...Object.keys(after[k])]))if(before[k][f]!==after[k][f]){
  const allowed=f==='Version'||(k.startsWith('Table name:')&&f==='Data locale')||(k==='Column:Loans_Schema:Row ID'&&['Fixed definition?','Editable Initial Value?'].includes(f))||(k==='Column:Loans_Schema:Borrower Name'&&['Virtual?','App formula','NFC Scannable'].includes(f));
  if(!allowed)throw Error(`Unexpected difference ${app}: ${k}.${f}`);
  differences.push({object:k,field:f,before:before[k][f]??null,after:after[k][f]??null});
 }
 const name=after['Column:Loans_Schema:Borrower Name'],key=after['Column:Loans_Schema:Row ID'];
 if(name['Virtual?']!=='Yes'||name['App formula']!=='=[Ref Borrowers].[Borrower Name]'||name.Type!=='Name'||name.Searchable!=='Yes')throw Error('Wrong VC');
 if(key.Key!=='Yes'||key['Read-Only']!=='Yes'||key['Initial value']!=='UNIQUEID("PackedUUID")')throw Error('Key changed');
 apps.push({app,version:after[':undefined'].Version,differences});
}
const key=(await fs.readFile('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/postgresql-migration-trial-20260914/appsheet-trial-api-key.txt','utf8')).trim();
const data={};
for(const table of ['Borrowers','Loans']){
 const response=await fetch(`https://www.appsheet.com/api/v2/apps/494cd013-0d9b-482f-9559-c9d83059de91/tables/${table}/Action`,{method:'POST',headers:{'Content-Type':'application/json',ApplicationAccessKey:key},body:JSON.stringify({Action:'Find',Properties:{Locale:'en-US',Timezone:'Asia/Bangkok'},Rows:[]}),signal:AbortSignal.timeout(180000)});
 if(!response.ok)throw Error(`Find failed HTTP ${response.status}`);data[table]=await response.json();await fs.writeFile(`${priv}/${table}-readback.json`,JSON.stringify(data[table]));
}
const borrowers=new Map(data.Borrowers.map(r=>[r['Row ID'],r]));
const mismatch=data.Loans.filter(l=>l['Borrower Name']!==borrowers.get(l['Ref Borrowers'])?.['Borrower Name']).length;
if(mismatch)throw Error('VC name mismatch');
const result={verifiedAt:new Date().toISOString(),apps,loans:data.Loans.length,borrowers:data.Borrowers.length,nameMismatches:mismatch};
await fs.writeFile(`${out}/verification.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({apps:apps.map(a=>({app:a.app,version:a.version})),loans:result.loans,nameMismatches:mismatch}));
