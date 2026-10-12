import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {buildRetirementCoverage} from './build-retirement-coverage.mjs';
import {nativeVirtualSql} from '../../services/agent-conversations/virtuals.mjs';
import {classifyNativeDefault} from '../../services/agent-conversations/defaults.mjs';

// Reviewed source bindings in the owning dictionary, not user-selected relations.
const analytical={Borrowers:'olap_borrowers_analytics',Loans:'olap_loans_analytics',Charges:'olap_charges_analytics',Repayments:'olap_repayments_analytics','Loan Assessment':'Loan Assessment SQL Lab View','Portfolio Summary':'olap_portfolio_summary'};
const types={Date:'date',DateTime:'timestamp',Decimal:'numeric',Number:'numeric',Percent:'numeric',Price:'numeric','Yes/No':'boolean',Email:'text',Enum:'text',LongText:'text',Name:'text',Ref:'text',Text:'text',Time:'text'};
const actions={
 Borrowers:{'Payment Request Token':['payment.create:Receive All'],'Payment Request Cash Account':['payment.create:Receive All']},
 Charges:{'Payment Request Token':['payment.create:Single Full'],'Payment Request Cash Account':['payment.create:Single Full']},
 Payments:{'Created At':['payment.create','payment.update-metadata'],'Processed At':['canonical-engine-owned']},
 'Cash Statement Context':{'Ref Cash Account':['preference.update'],'Statement Date':['preference.update']},
 'Loan Assessment':{'SQL Refresh Token':['assessment.refresh']},
 Loans:{'Charge Generation Request':['loan.generate-charge'],Defaulted:['loan.default','loan.undo-default'],'Loan Status':['loan.close'],'Default Loss Amount':['loan.default'],'Payment Request Token':['loan.close'],'Payment Request Cash Account':['loan.close']},
};

/** Bootstrap sanitized source metadata; gaps remain explicit until providers are reviewed. */
export function buildNativeManifest(raw){
 const source=JSON.parse(raw),coverage=buildRetirementCoverage(raw);
 const resources=coverage.resources.map(item=>{
  const fields=item.fields.map(field=>{
   const original=source.apps[item.scope].tables[item.resource].columns[field.field];
   const relation=/^=?REF_ROWS\("([^"\r\n]+)",\s*"([^"\r\n]+)"\)$/.exec(original['App formula']??'');
   const semantic=actions[item.resource]?.[field.field];
   const customRelationship=item.resource==='Borrowers'&&['Todays Collection Charges','Related Referral Expenses'].includes(field.field)
    ||item.resource==='Payments'&&['Visible Allocations','Eligible Charges'].includes(field.field);
   const peer=source.apps.olap.tables[item.resource]?.columns[field.field];
   const summary=source.apps.olap.tables['Portfolio Summary']?.columns[field.field];
   const metric=!field.physical&&item.scope==='oltp'&&analytical[item.resource]&&peer?.['Virtual?']==='No'
    ?{relation:analytical[item.resource],column:field.field,joinKey:'Row ID'}
    :!field.physical&&item.resource==='Statistics'&&summary?.['Virtual?']==='No'
      ?{relation:'olap_portfolio_summary',column:field.field,singleton:true}:null;
   const projection=nativeVirtualSql(item.resource,field.field);
   const presentation=/^(Header\s*-|Statistics Header$|Matrix ?Bubble ?Label$|Portfolio ?(?:Share )?Join ?Key$|Portfolio Summary Ref$)/.test(field.field);
   return {name:field.field,type:types[field.type]??'relationship',sourceType:field.type,key:field.key,
    protected:field.protected,actor:field.actor,legacyWriteActions:field.legacyWriteActions,
    nativeStatus:semantic?'semantic-action':field.physical?'physical':metric||projection?'provider':relation||customRelationship?'relationship':presentation?'presentation-only':'pending-provider',
    ...(field.physical?{column:field.field}:{}),
    ...(relation?{relationship:{resource:relation[1],field:relation[2],parentKey:item.key,boundedQuery:true}}:{}),
    ...(customRelationship?{relationship:{provider:'fixed-native',boundedQuery:true}}:{}),
    ...(metric?{column:field.field,provider:metric}:{}),
    ...(!field.physical&&!metric&&projection?{column:field.field,projection:'fixed-native'}:{}),
    ...(semantic?{actions:semantic}:{}),
    default:classifyNativeDefault({scope:item.scope,resource:item.resource,field:field.field,type:field.type,expression:original['Initial value']??''})};
  });
  if(item.resource==='Charges')fields.push({name:'Collection Today',type:'boolean',sourceType:'Yes/No',nativeStatus:'provider',column:'Collection Today',projection:'fixed-native',legacyWriteActions:[],default:{kind:'none'}});
  return {scope:item.scope,resource:item.resource,key:item.key,relation:item.scope==='olap'?(analytical[item.resource]??item.resource):item.resource,
   ...(item.resource==='Cash Statement Context'?{actorColumn:'Ref Partner'}:{}),
   mutationProtected:item.mutationProtected,legacyPermission:item.legacyPermission,fields};
 });
 return {version:1,status:'incomplete',sourceSha256:coverage.sourceSha256,resources};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: build-native-manifest.mjs PRIVATE_SCHEMA OUTPUT');
 const manifest=buildNativeManifest(await readFile(input,'utf8'));
 await writeFile(output,JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({resources:manifest.resources.length,status:manifest.status,pendingFields:manifest.resources.flatMap(r=>r.fields).filter(f=>f.nativeStatus==='pending-provider').length}));
}
