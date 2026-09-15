import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='outputs/'+(process.argv.includes('--production')?'interval-promotion-20260915':'interval-anchor-20260915');
const d=JSON.parse(await fs.readFile(out+'/definition-comparison.json'));
const e=JSON.parse(await fs.readFile('outputs/interval-anchor-20260915/expressions.json'));
const norm=s=>String(s??'').replace(/^=/,'').replace(/\s+/g,' ').trim();
for(const [app,r]of Object.entries(d)){
 assert.equal(r.removed.length,0);
 for(const c of r.changes){
  if(c.key==='app')continue;
  if(c.added){assert(c.key.endsWith(':Interest Schedule Anchor Date'));continue;}
  if(c.key.startsWith('view:')){
   for(const f of c.fields){assert.equal(f.field,'View configuration');const a=JSON.parse(f.after),b=JSON.parse(f.before);
    const i=a.ColumnOrder.indexOf(e.column);assert(i>=1);assert.equal(a.ColumnOrder[i-1],'Interest Payment Interval');a.ColumnOrder.splice(i,1);assert.deepEqual(a,b);}
  }else{
   assert.equal(app,'oltp');assert(["action:Loans:Generate Today's Charge","action:Statistics:Generate All Today's Charges"].includes(c.key));
   for(const f of c.fields){
    if(f.field==='With these properties'){const a=JSON.parse(f.after),b=JSON.parse(f.before);assert.equal(norm(a.ReferencedRows),norm(e.bulkRows));delete a.ReferencedRows;delete b.ReferencedRows;assert.deepEqual(a,b);}
    else{assert.equal(f.field,'Only if this condition is true');assert.equal(norm(f.after),norm(c.key.includes('All')?e.bulkCondition:e.individualCondition));}
   }
  }
 }
 const col=r.changes.find(c=>c.key==='column:Loans_Schema:'+e.column).added;
 assert.equal(col.Type,'Date');assert.equal(col['Read-Only'],app==='oltp'?'No':'Yes');
 assert(!col['Initial value']);assert(!col['App formula']);assert.equal(col['Reset on edit?'],'No');assert.equal(col.Key,'No');
 const q=JSON.parse(col['Type Qualifier']);assert.equal(norm(q.Valid_If),norm(e.validIf));assert.equal(norm(q.Show_If),norm(e.showIf));
}
const report={versions:Object.fromEntries(Object.entries(d).map(([k,v])=>[k,v.version])),expectedChangesOnly:true,existingColumnsRefsSlicesPermissionsAndCalculationsUnchanged:true,viewMembershipOnly:true,optionalFieldConfigurationVerified:true};
await fs.writeFile(out+'/configuration-verification.json',JSON.stringify(report,null,2));console.log(report);
