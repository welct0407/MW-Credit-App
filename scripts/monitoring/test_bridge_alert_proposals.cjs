const assert=require('node:assert/strict'),{execFileSync}=require('child_process'),{rules}=require('./build-bridge-alert-proposals');
const now=Math.floor(Date.now()/1000);
function evaluate(id,value,age=0){const q=rules.find(r=>r.uid==='mw-dots-'+id).data[0].model;
 const input=value===null?{}:{timeSeries:[{points:[{interval:{endTime:new Date((now-age)*1000).toISOString()},value:{int64Value:String(value)}}]}]};
 return JSON.parse(execFileSync('jq',['-c',q.root_selector],{input:JSON.stringify(input)})).value;
}
for(const r of rules){assert.equal(r.isPaused,true);assert.equal(r.notification_settings.receiver,'MW Bridge IRM');assert.equal(r.folderUID,'REPLACE_WITH_VERIFIED_FOLDER_UID');}
assert.equal(evaluate('dispatch',now-301),1);assert.equal(evaluate('dispatch',now-60),0);
assert.equal(evaluate('availability',1,361),1);assert.equal(evaluate('inspection',null),1);
assert.equal(evaluate('subscription',4),0);assert.equal(evaluate('subscription',0),1);
assert.equal(evaluate('outbox-warning',301),1);assert.equal(evaluate('outbox-urgent',900),0);assert.equal(evaluate('outbox-urgent',901),1);
assert.equal(evaluate('renewal',4),0);assert.equal(evaluate('renewal',2),1);
assert.equal(evaluate('delivery',1),0);assert.equal(evaluate('delivery',0),1);
console.log('PASS: independent paused routing, raw dispatch age, stale/missing telemetry, unknown expected state, warning/urgent boundaries');
