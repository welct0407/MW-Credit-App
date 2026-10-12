import test from 'node:test';import assert from 'node:assert/strict';
import {classifyNativeDefault,resolveNativeDefaults,applyNativeDefaults} from '../../services/agent-conversations/defaults.mjs';
const classify=(expression,type='Text',field='Synthetic')=>classifyNativeDefault({scope:'oltp',resource:'Synthetic',field,type,expression});
const resource=definitions=>({scope:'oltp',name:'Synthetic',fields:Object.entries(definitions).map(([name,descriptor])=>({name,default:descriptor}))});
test('reviewed default families classify without accepting arbitrary formula/literal data',()=>{
 for(const expression of ['UNIQUEID("PackedUUID")','=UNIQUEID()'])assert.equal(classify(expression).kind,'new-id');
 assert.equal(classify('=TODAY()','Date').kind,'business-date');assert.equal(classify('NOW()','DateTime').kind,'business-now');
 assert.equal(classify('=USEREMAIL()','Email').kind,'actor-login');assert.deepEqual(classify('=FALSE','Yes/No').value,false);
 assert.equal(classify('=0','Price').value,'0');assert.equal(classify('=1','Number').value,1);
 assert.equal(classify('="Bank Transfer"','Enum').value,'Bank Transfer');
 for(const expression of ['="PRIVATE-SENTINEL"','=ANY(Unknown[Value])','=NOW()+1']){
  const result=classify(expression);assert.equal(result.kind,'pending');assert.match(result.sourceSha256,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(result).includes('PRIVATE-SENTINEL'),false);
 }
 assert.equal(classify('=9007199254740993','Number').kind,'pending');assert.equal(classify('=1.2','Number').kind,'pending');
 assert.deepEqual(classify(undefined),{kind:'none'});assert.equal(classify('=TODAY()','Text').kind,'pending');
});
test('server clock produces Bangkok defaults and attributed actor; missing context fails',async()=>{
 const r=resource({date:classify('TODAY()','Date'),clock:classify('NOW()','DateTime'),actor:classify('=USEREMAIL()','Email')});
 const context={businessDate:'2026-10-12',now:'2026-10-11T18:30:45Z',actor:{partnerId:'synthetic',loginEmail:'synthetic@example.invalid'}};
 assert.deepEqual(await resolveNativeDefaults(r,context),{values:{date:'2026-10-12',clock:'2026-10-12 01:30:45',actor:'synthetic@example.invalid'},pending:[]});
 await assert.rejects(resolveNativeDefaults(r,{...context,businessDate:'2026-02-30'}),/invalid_business_date/);
 await assert.rejects(resolveNativeDefaults(r,{...context,now:'2026-10-12 01:30:45'}),/timezone_required/);
 await assert.rejects(resolveNativeDefaults(r,{...context,actor:{loginEmail:'synthetic@example.invalid'}}),/attributed_actor_required/);
});
test('omitted defaults differ from explicit null, false and zero; input remains immutable',async()=>{
 const r=resource({a:classify('=1','Number'),b:classify('=TRUE','Yes/No'),c:classify('=0','Price'),unknown:classify('=UNKNOWN()')});
 const input=Object.freeze({a:null,b:false,c:0,unknown:null});assert.deepEqual(await applyNativeDefaults(input,r),input);
 await assert.rejects(applyNativeDefaults({},r),e=>e.message==='native_defaults_pending'&&e.pending[0].field==='unknown');
 assert.deepEqual(await applyNativeDefaults({unknown:null},r),{a:1,b:true,c:'0',unknown:null});
});
test('identity is deferred until journal context and resolver input must be reviewed',async()=>{
 const r=resource({id:classify('=UNIQUEID()'),day:classify('=MAX(Cash Account Daily Summary Recent[Statement Date])','Date')});
 const pending=await resolveNativeDefaults(r);assert.equal(pending.pending.length,2);assert.deepEqual(pending.values,{});
 let requested;
 const resolved=await resolveNativeDefaults(r,{newId:async identity=>{requested=identity;return 'persisted-synthetic-key';},resolvers:{'latest-statement-date':async()=> '2026-10-11'}});
 assert.equal(requested.field,'id');assert.deepEqual(resolved,{values:{id:'persisted-synthetic-key',day:'2026-10-11'},pending:[]});
 assert.equal((await resolveNativeDefaults(resource({day:r.fields[1].default}),{resolvers:{'latest-statement-date':()=>null}})).pending.length,1);
 await assert.rejects(resolveNativeDefaults(resource({bad:{kind:'resolver',name:'arbitrary-sql'}})),/unknown_default_resolver/);
});
