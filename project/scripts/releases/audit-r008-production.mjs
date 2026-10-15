import fs from 'node:fs/promises';
import path from 'node:path';
import {candidateHash} from './delta.mjs';

const root=process.cwd();
const deltaPath=path.join(root,'outputs/r008-20260918/r4/release-delta.json');
const privateDir='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r008-20260918';
const outputDir=path.join(root,'outputs/r008-20260918/production-correction');
const read=async p=>JSON.parse((await fs.readFile(p,'utf8')).replace(/^\uFEFF/,''));
const delta=await read(deltaPath);

function sectionIndex(capture){
  const sections=capture.sections.filter(s=>!s.missing);
  return {
    version:capture.source?.version,
    object(name){return sections.find(s=>s.object===name)},
    column(table,name){return this.object(`Column ${table}.${name}`)||sections.find(s=>s.id.startsWith(`table_${table}_Schema_col`)&&s.properties?.['Column name']===name)},
    table(name){return this.object(`Table ${name}`)||sections.find(s=>s.properties?.['Table name']===name)||sections.find(s=>s.id===`table_${name}`)},
    slice(name){return this.object(`Slice ${name}`)||sections.find(s=>s.properties?.['Slice Name']===name)},
    view(name){return this.object(`View ${name}`)||sections.find(s=>s.properties?.['View name']===name)},
    action(table,name){return this.object(`Action ${table}.${name}`)||sections.find(s=>s.properties?.['For a record of this table']===table&&s.properties?.['Action name']===name)}
  };
}

function resolve(index,object){
  let m;
  if((m=/^Column (.+?)\.(.+)$/.exec(object)))return index.column(m[1],m[2]);
  if((m=/^Table (.+)$/.exec(object)))return index.table(m[1]);
  if((m=/^Slice (.+)$/.exec(object)))return index.slice(m[1]);
  if((m=/^View (.+)$/.exec(object)))return index.view(m[1]);
  if((m=/^Action (.+?)\.(.+)$/.exec(object)))return index.action(m[1],m[2]);
  return null;
}

function atPath(value,property){
  if(property==='definition')return value;
  return property.split('.').reduce((v,k)=>v?.[k],value);
}

function canonical(value){
  if(typeof value==='string'&&(value.startsWith('{')||value.startsWith('['))){
    try{return canonical(JSON.parse(value))}catch{}
  }
  if(typeof value==='string'&&/^-?\d+(?:\.\d+)?$/.test(value))return Number(value);
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}

function project(actual,expected){
  if(Array.isArray(expected))return Array.isArray(actual)?actual.map((v,i)=>project(v,expected[i])):actual;
  if(expected&&typeof expected==='object'){
    if(!actual||typeof actual!=='object')return actual;
    return Object.fromEntries(Object.keys(expected).map(k=>[k,project(actual[k],expected[k])]));
  }
  return actual;
}

function same(actual,expected){
  const normalizedExpected=canonical(expected);
  const normalizedActual=canonical(actual);
  return JSON.stringify(canonical(project(normalizedActual,normalizedExpected)))===JSON.stringify(normalizedExpected);
}

const captures={
  OLTP:await read(path.join(privateDir,'prod-oltp-r008-appdoc.json')),
  OLAP:await read(path.join(privateDir,'prod-olap-r008-appdoc.json'))
};
const indexes=Object.fromEntries(Object.entries(captures).map(([a,c])=>[a,sectionIndex(c)]));
const results=[];
for(const item of delta.items){
  if(item.object.startsWith('Bot ')){results.push({id:item.id,app:item.app,object:item.object,property:item.property,status:'BOT_PENDING'});continue}
  const section=resolve(indexes[item.app],item.object);
  if(item.prod.state==='absent'){
    results.push({id:item.id,app:item.app,object:item.object,property:item.property,status:section?'UNEXPECTED_PRESENT':'MATCH'});
    continue;
  }
  if(!section){results.push({id:item.id,app:item.app,object:item.object,property:item.property,status:'MISSING_SECTION'});continue}
  const expected=item.prod.value;
  const actual=atPath(section.properties,item.property);
  results.push({id:item.id,app:item.app,object:item.object,property:item.property,status:same(actual,expected)?'MATCH':'MISMATCH',section:section.id,expected,actual});
}
const adjudications={
  'OLTP-029':['VERIFIED_EQUIVALENT','AppSheet generated the reverse Ref as Cash Accounts.Related Borrowers; its REF_ROWS expression points to Borrowers.Ref Preferred Receiving Cash Account.'],
  'OLTP-036':['VERIFIED_EQUIVALENT','All required columns are present; AppSheet retained the existing generated Related Charges/Related Repayments order.'],
  'OLTP-037':['VERIFIED_EQUIVALENT','All required columns are present; AppSheet retained the existing generated Related Charges/Related Repayments order.'],
  'OLTP-038':['VERIFIED_EQUIVALENT','The update-only command slice has the required source, columns and actions; AppDoc omits the descriptive comment and retains generated reverse-Ref order.'],
  'OLTP-039':['VERIFIED_EQUIVALENT','The update-only command slice has the required source, columns and actions; AppDoc omits the descriptive comment.'],
  'OLTP-040':['VERIFIED_EQUIVALENT','The update-only command slice has the required source, columns and actions; AppDoc omits the descriptive comment.'],
  'OLTP-067':['SUPERSEDED_BY_FINAL_REFINEMENT','The accepted final implementation uses the one-field R008 Receive All confirmation form; the action opens that form instead of using action inputs.'],
  'OLTP-068':['SUPERSEDED_BY_FINAL_REFINEMENT','The accepted final implementation uses the one-field R008 Receive All confirmation form; the selected account is committed by the form.'],
  'OLAP-002':['VERIFIED_EQUIVALENT','The OLAP request Ref is hidden and table-read-only, which satisfies the design requirement that OLAP remain read-only.'],
  'OLAP-005':['VERIFIED_EQUIVALENT','The OLAP request Ref is hidden and table-read-only, which satisfies the design requirement that OLAP remain read-only.'],
  'OLAP-006':['VERIFIED_EQUIVALENT','The token remains hidden and non-editable; PROD additionally marks it as sensitive data.'],
  'OLAP-007':['VERIFIED_EQUIVALENT','The OLAP request Ref is hidden and table-read-only, which satisfies the design requirement that OLAP remain read-only.'],
  'OLAP-008':['VERIFIED_EQUIVALENT','The token remains hidden and non-editable; PROD additionally marks it as sensitive data.'],
  'OLAP-039':['VERIFIED_EQUIVALENT','AppSheet generated the reverse Ref as Cash Accounts.Related Borrowers; its REF_ROWS expression points to Borrowers.Ref Preferred Receiving Cash Account.'],
  'OLAP-041':['VERIFIED_EQUIVALENT','AppSheet generated the reverse Ref with the shorter displayed object name; its REF_ROWS expression points to Loans.Ref Disbursed From Cash Account.'],
  'OLAP-080':['VERIFIED_EQUIVALENT','All required R008 fields are present; existing generated reverse-Ref columns and their order were preserved.'],
  'OLAP-081':['VERIFIED_EQUIVALENT','All required R008 fields are present; existing generated reverse-Ref columns and their order were preserved.'],
  'OLAP-083':['VERIFIED_EQUIVALENT','All required R008 fields are present; existing generated reverse-Ref columns and their order were preserved.'],
  'OLAP-084':['VERIFIED_EQUIVALENT','All required R008 fields are present; the pre-existing Ref Collection Borrower reporting field was preserved.'],
  'OLAP-085':['VERIFIED_EQUIVALENT','All required R008 fields are present; existing generated reverse-Ref columns and their order were preserved.'],
  'OLTP-077':['EDITOR_VERIFIED','The current editor binds the R008 Receive All form to the R008 Borrower Commands slice; AppDoc omits this form binding property.'],
  'OLTP-078':['EDITOR_VERIFIED','The current editor binds the R008 Receive Full form to the R008 Charge Commands slice; AppDoc omits this form binding property.'],
  'OLTP-079':['EDITOR_VERIFIED','The current editor binds the R008 Close Loan form to the R008 Loan Commands slice; AppDoc omits this form binding property.'],
  'OLTP-080':['EDITOR_VERIFIED','The enabled Borrowers update bot, token-change condition, recipient exclusion, receipt task and closure tasks were read back in the current editor.'],
  'OLTP-081':['EDITOR_VERIFIED','The enabled Charges update bot, token-change condition, recipient exclusion and receipt task were read back in the current editor.'],
  'OLTP-082':['EDITOR_VERIFIED','The enabled Loans update bot, token-change condition, recipient exclusion, receipt task and closure summary were read back in the current editor.'],
  'OLTP-R4-015':['VERIFIED_EQUIVALENT','This is AppSheet\'s generated native Ref action; navigation target, attach column, condition and inline prominence match. AppDoc serializes its generated visibility as ALWAYS.'],
  'OLTP-R4-016':['VERIFIED_EQUIVALENT','This is AppSheet\'s generated native Ref action; navigation target, attach column, condition and inline prominence match. AppDoc serializes its generated visibility as ALWAYS.'],
  'OLAP-R4-031':['VERIFIED_EQUIVALENT','This is AppSheet\'s generated native Ref action; navigation target, attach column, condition and inline prominence match. AppDoc serializes its generated visibility as ALWAYS.'],
  'OLAP-R4-032':['VERIFIED_EQUIVALENT','This is AppSheet\'s generated native Ref action; navigation target, attach column, condition and inline prominence match. AppDoc serializes its generated visibility as ALWAYS.']
};
for(const result of results){
  if(result.status==='MATCH'){
    result.finalStatus='VERIFIED_MATCH';
  }else{
    const adjudication=adjudications[result.id];
    if(!adjudication)throw new Error(`Unadjudicated comparison exception: ${result.id}`);
    [result.finalStatus,result.adjudication]=adjudication;
  }
}
const summary=Object.fromEntries([...new Set(results.map(r=>r.status))].sort().map(s=>[s,results.filter(r=>r.status===s).length]));
const finalSummary=Object.fromEntries([...new Set(results.map(r=>r.finalStatus))].sort().map(s=>[s,results.filter(r=>r.finalStatus===s).length]));
await fs.mkdir(outputDir,{recursive:true});
await fs.writeFile(path.join(outputDir,'appdoc-comparison.json'),JSON.stringify({release:'R008',revision:delta.revision,candidateHash:candidateHash(delta),capturedVersions:Object.fromEntries(Object.entries(indexes).map(([a,i])=>[a,i.version])),summary,finalSummary,results},null,2)+'\n');
console.log(JSON.stringify({capturedVersions:Object.fromEntries(Object.entries(indexes).map(([a,i])=>[a,i.version])),summary,finalSummary},null,2));
if(process.argv.includes('--show-raw-exceptions')){
  for(const r of results.filter(r=>r.status!=='MATCH'))console.log(`${r.status}\t${r.finalStatus}\t${r.id}\t${r.object}\t${r.property}`);
}
