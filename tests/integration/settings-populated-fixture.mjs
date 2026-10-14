import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {connect,principal,command} from './phase6-populated-fixture.mjs';
export const borrowerFields=name=>({name,description:null,communicationName:null,instagramUsername:null,city:null,workingLocation:null,address:null,hidden:false,referrerId:null,preferredReceivingAccountId:null,note:'Legacy exact note'});
if(process.argv[2]==='seed-settings'){
 const {admin,app,store}=await connect(91);
 try{
  const parent=JSON.parse(readFileSync(process.env.PHASE6_POPULATED_SNAPSHOT,'utf8')),rows=[];
  for(const flag of[true,false,null]){const c=command('borrower.create',borrowerFields('C settings legacy '+String(flag))),outcome=await store.operation(principal,c);assert.equal(outcome.originalOutcome?.status,'applied',JSON.stringify(outcome));await admin.query('UPDATE public."Borrowers" SET "AI Collection Enabled"=$1 WHERE "Row ID"=$2',[flag,c.targetId]);rows.push({id:c.targetId,flag,command:c,outcome})}
  const prefs=await store.preferences(principal);assert.equal(prefs.status,200);
  writeFileSync(process.env.SETTINGS_POPULATED_SNAPSHOT,JSON.stringify({parent,rows,preferences:prefs.item}));
 }finally{await app.end();await admin.end()}
}
