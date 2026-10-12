import manifest from './native-manifest.json' with {type:'json'};
import {nativeVirtualSql} from './virtuals.mjs';

// This checked-in manifest is reviewed application source. No private export or
// user-supplied relation, SQL expression, default, or formula is loaded at runtime.
export const conversationCatalogue=manifest;
const versionFunctions={Borrowers:'pwa_borrower_version_v2',Loans:'pwa_loan_version_v2',Charges:'pwa_charge_version_v2',Payments:'pwa_payment_version_v2','Business Expenses':'pwa_expense_version_v2'};
const versionTables={'Cash Pool Contributions':'Cash Pool Contributions',Settlements:'Settlements','Cash Ledger':'Cash Ledger','Loan Assessment':'Loan Assessment SQL Lab','Payment Allocations':'Payment Allocations'};
const quote=name=>'"'+name.replaceAll('"','""')+'"';
function source(resource){
 const metrics=resource.fields.filter(field=>field.provider||field.projection);
 if(!metrics.length)return null;
 const additions=metrics.map(field=>{
  if(field.projection)return `(${nativeVirtualSql(resource.resource,field.name)}) AS ${quote(field.name)}`;
  const p=field.provider;
  return `(SELECT v.${quote(p.column)} FROM public.${quote(p.relation)} v${p.singleton?'':` WHERE v.${quote(p.joinKey)}=b.${quote(resource.key)}`}) AS ${quote(field.name)}`;
 });
 return `SELECT b.*,${additions.join(',')} FROM public.${quote(resource.relation)} b`;
}
export const conversationResources=Object.fromEntries(['oltp','olap'].map(scope=>[
  scope,Object.fromEntries(manifest.resources.filter(resource=>resource.scope===scope).map(resource=>[
    resource.resource,{
      relation:resource.relation,key:resource.key,actorColumn:resource.actorColumn,
      sourceSql:source(resource),
      versionFunction:versionFunctions[resource.resource],versionRelation:versionTables[resource.resource],
      fields:Object.fromEntries(resource.fields.filter(field=>field.column).map(field=>[
        field.name,{column:field.column,type:field.type},
      ])),
      relationships:Object.fromEntries(resource.fields.filter(field=>field.relationship).map(field=>[field.name,field.relationship])),
    },
  ])),
]));
