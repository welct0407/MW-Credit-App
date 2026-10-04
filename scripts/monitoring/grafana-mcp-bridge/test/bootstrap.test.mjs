import {test} from 'node:test';
import assert from 'node:assert/strict';
import {server} from '../deploy/bootstrap.mjs';

test('inert bootstrap exposes health only and cannot trigger authentication or delivery',async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(origin+'/health')).status,200);
    for(const path of ['/mcp','/grafana','/internal/dispatch','/oauth','/oauth/google/callback']) {
      const response=await fetch(origin+path,{method:'POST',body:'{}'});
      assert.equal(response.status,503);
      assert.equal(response.headers.get('referrer-policy'),'no-referrer');
      assert.deepEqual(await response.json(),{status:'inactive'});
    }
    assert.equal((await fetch(origin+'/health',{method:'POST'})).status,503);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
