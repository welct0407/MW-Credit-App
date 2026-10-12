import test from 'node:test';
import assert from 'node:assert/strict';
import { createBorrowerReadStore } from '../../services/api/borrower-read-store.mjs';

const config={ownerEmail:'owner@example.invalid',database:'synthetic',dbUser:'reader'};
function fixture({code='57014',rollbackFails=false,mappingDenied=false,releaseThrows=false}={}) {
  const releases=[];let connected=0;let failed=false;let idle;
  const pool={async connect(){if(idle){const reused=idle;idle=null;return reused;}const id=++connected;let poisoned=false;const client={release(discard){releases.push({id,discard});if(!discard)idle=client;if(releaseThrows)throw Error('PRIVATE cleanup');},async query(sql){
    if(poisoned)throw Error('PRIVATE poisoned transaction');
    if(sql==='ROLLBACK'&&rollbackFails){poisoned=true;throw Error('PRIVATE rollback');}
    if(sql.includes('current_database'))return {rows:[{database:config.database,principal:config.dbUser}]};
    if(sql.includes('public."Partners"'))return {rows:mappingDenied?[]:[{id:'partner'}]};
    if(sql.includes('public."Borrowers"')&&!failed){failed=true;throw Object.assign(Error('PRIVATE source'),{code});}
    return {rows:[]};
  }};return client;}};
  return {store:createBorrowerReadStore({pool,config}),releases};
}
test('failed rollback discards client; next request succeeds on fresh checkout',async()=>{
  const f=fixture({rollbackFails:true});const first=await f.store.listBorrowers(config.ownerEmail);
  assert.deepEqual(first,{ok:false,status:503,code:'read_unavailable'});
  assert.deepEqual(f.releases,[{id:1,discard:true}]);
  assert.equal((await f.store.listBorrowers(config.ownerEmail)).ok,true);
  assert.deepEqual(f.releases,[{id:1,discard:true},{id:2,discard:false}]);
});
test('ordinary statement timeout with successful rollback permits reuse; transport failure never does',async()=>{
  for(const [code,discard] of [['57014',false],['ECONNRESET',true],['08006',true],['57P01',true]]){
    const f=fixture({code});assert.equal((await f.store.listBorrowers(config.ownerEmail)).status,503);
    assert.deepEqual(f.releases,[{id:1,discard}]);
  }
});
test('mapping-denial rollback failure and throwing release keep sanitized response',async()=>{
  for(const options of [{mappingDenied:true,rollbackFails:true},{rollbackFails:true,releaseThrows:true}]){
    const f=fixture(options);assert.deepEqual(await f.store.listBorrowers(config.ownerEmail),{ok:false,status:503,code:'read_unavailable'});assert.equal(f.releases[0].discard,true);
  }
});
test('only exact installed connection timeout messages classify; public result has no private payload',async()=>{
  for(const [message,category] of [['timeout exceeded when trying to connect','pool_checkout_timeout'],['Connection terminated due to connection timeout','connection_timeout'],['PRIVATE arbitrary timeout','unclassified']]){
    const store=createBorrowerReadStore({config,pool:{async connect(){throw Error(message)}}});
    const result=await store.session(config.ownerEmail);
    assert.deepEqual(result.diagnostic,{stage:'connect',category});
    assert.equal(JSON.stringify(result),'\{"ok":false,"status":503,"code":"read_unavailable"\}');
  }
});
