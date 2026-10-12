import test from 'node:test';import assert from 'node:assert/strict';
import {classifyNativeDefault,resolveNativeDefaults,applyNativeDefaults} from '../../services/agent-conversations/defaults.mjs';
const descriptor=(expression,type='Text')=>classifyNativeDefault({scope:'oltp',resource:'Synthetic',field:'Synthetic',type,expression});
const resource=fields=>({scope:'oltp',name:'Synthetic',writable:false,fields:Object.entries(fields).map(([name,defaultValue])=>({name,writable:false,default:defaultValue}))});

test('default decimal metadata retains precision above binary-number range and never exposes unknown source literals',async()=>{
 const precise='9007199254740993.000000000001',negative='-0.000000000001';
 assert.deepEqual((await resolveNativeDefaults(resource({price:descriptor(precise,'Price'),rate:descriptor(negative,'Percent')}))).values,{price:precise,rate:negative});
 assert.equal(descriptor(precise,'Number').kind,'pending');
 for(const expression of ['"PRIVATE-DEFAULT-SENTINEL"','ANY(Private[PRIVATE-DEFAULT-SENTINEL])','IMPORTDATA("https://PRIVATE-DEFAULT-SENTINEL.invalid")']){
  const value=descriptor(expression);assert.equal(value.kind,'pending');assert.match(value.sourceSha256,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(value).includes('PRIVATE-DEFAULT-SENTINEL'),false);
 }
});

test('only omitted own fields receive defaults; explicit null false zero and unknown pending remain unchanged',async()=>{
 const defaults=resource({nullable:descriptor('TRUE','Yes/No'),boolean:descriptor('TRUE','Yes/No'),amount:descriptor('1.5','Price'),unknown:descriptor('UNKNOWN()')});
 const explicit=Object.freeze({nullable:null,boolean:false,amount:0,unknown:null});assert.deepEqual(await applyNativeDefaults(explicit,defaults),explicit);
 const inherited=Object.create({nullable:null});Object.assign(inherited,{unknown:null});
 assert.deepEqual(await applyNativeDefaults(inherited,defaults),{nullable:true,boolean:true,amount:'1.5',unknown:null});
 await assert.rejects(applyNativeDefaults({},defaults),error=>error.message==='native_defaults_pending'&&error.pending.length===1&&error.pending[0].field==='unknown');
});

test('Bangkok clock crosses midnight from UTC without losing zero hour or accepting timezone-free input',async()=>{
 const defaults=resource({clock:descriptor('NOW()','DateTime')});
 for(const [now,expected]of [['2026-10-12T16:59:59Z','2026-10-12 23:59:59'],['2026-10-12T17:00:00Z','2026-10-13 00:00:00'],['2026-10-13T00:00:00+07:00','2026-10-13 00:00:00']])assert.equal((await resolveNativeDefaults(defaults,{now})).values.clock,expected);
 await assert.rejects(resolveNativeDefaults(defaults,{now:'2026-10-13 00:00:00'}),/timezone_required/);
 await assert.rejects(resolveNativeDefaults(defaults,{now:new Date(NaN)}),/invalid_business_clock/);
});

test('resolution is metadata not write authority; relationship and journal identities remain pending without trusted callbacks',async()=>{
 const defaults=resource({id:descriptor('UNIQUEID()'),day:descriptor('MAX(Cash Account Daily Summary Recent[Statement Date])','Date')});let writes=0;
 const context={authorizeWrite(){writes++;throw Error('must not authorize');},executeCommand(){writes++;throw Error('must not write');}};
 const result=await resolveNativeDefaults(defaults,context);assert.deepEqual(Object.keys(result),['values','pending']);assert.deepEqual(result.values,{});assert.equal(result.pending.length,2);assert.equal(writes,0);
 const unresolved=await resolveNativeDefaults(resource({day:defaults.fields[1].default}),{resolvers:{'latest-statement-date':()=>null}});assert.equal(unresolved.pending.length,1);assert.deepEqual(unresolved.values,{});
 assert.deepEqual(await applyNativeDefaults({id:null,day:null},defaults,context),{id:null,day:null});assert.equal(writes,0);
});
