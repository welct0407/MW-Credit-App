import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const protectedTables=new Set(['Partners','Cash Accounts','Cash Holders','Statistics']);
const protectedFields=new Set(['IG Receipt ID','Receipt Image','Receipt Received At','Instagram Username','AI Collection Enabled','IG Integration Enabled','AI Reviewer','Login Email','Email','Language Preference']);
const actorFields=new Set(['Created By','Closed By','Updated By','Cancelled By','Voided By']);
const nativeOwners={Borrowers:'services/business/borrowers.mjs',Loans:'services/business/loans.mjs',Charges:'services/business/charges.mjs',Payments:'services/business/payments.mjs','Business Expenses':'services/business/expenses.mjs','Loan Assessment':'services/business/management-assessments.mjs','Cash Pool Contributions':'services/business/management-financial.mjs',Settlements:'services/business/management-financial.mjs','Cash Ledger':'services/business/management-financial.mjs','Cash Statement Context':'services/business/cash.mjs'};
const digest=value=>createHash('sha256').update(value).digest('hex');
/** Migration evidence only. Never publish the source schema, defaults or expressions. */
export function buildRetirementCoverage(raw){
 const schema=JSON.parse(raw);if(schema.format!==1||!schema.apps)throw Error('invalid_source_schema');
 const resources=[];
 for(const scope of ['oltp','olap'])for(const [name,definition]of Object.entries(schema.apps[scope].tables)){
  const fields=Object.entries(definition.columns).filter(([name])=>name!=='_RowNumber').map(([field,column])=>{
   const physical=column['Virtual?']==='No';
   const eligible=!protectedTables.has(name)&&!protectedFields.has(field)&&!actorFields.has(field)&&field!==definition.key&&physical&&!column['App formula']&&!column.Formula&&!column['Spreadsheet formula']&&column['Read-Only']==='No';
   const actions=[];
   if(eligible&&column['Editable Initial Value?']==='Yes'&&['ALL_CHANGES','ADDS_ONLY','ADDS_AND_UPDATES'].includes(definition.permission))actions.push('Add');
   if(eligible&&['ALL_CHANGES','UPDATES_ONLY','ADDS_AND_UPDATES'].includes(definition.permission))actions.push('Edit');
   const rules={};
   for(const key of ['Initial value','App formula','Formula','Spreadsheet formula','Valid_If','Required_If','Editable_If']){
    const value=column[key];if(value!==undefined&&value!==null&&value!=='')rules[key]={present:true,sha256:digest(JSON.stringify(value))};
   }
   return {field,type:column.Type,physical,key:field===definition.key,actor:actorFields.has(field),protected:protectedFields.has(field),legacyWriteActions:actions,sourceRules:rules,
    nativeStatus:actions.length?'mapping-review-required':physical?'physical-projection-review-required':'virtual-projection-review-required'};
  });
  resources.push({scope,resource:name,key:definition.key,legacyPermission:definition.permission,mutationProtected:protectedTables.has(name),legacyDelete:definition.permission==='ALL_CHANGES'&&!protectedTables.has(name),nativeOwner:nativeOwners[name]??null,fields});
 }
 return {version:1,purpose:'sanitized-migration-coverage-not-runtime-authority',sourceSha256:digest(raw),status:'incomplete',resources};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: build-retirement-coverage.mjs PRIVATE_SCHEMA OUTPUT');
 const result=buildRetirementCoverage(await readFile(input,'utf8'));
 await writeFile(output,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({sourceSha256:result.sourceSha256,resources:result.resources.length,status:result.status}));
}
