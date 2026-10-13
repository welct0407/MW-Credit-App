import test from 'node:test';
import assert from 'node:assert/strict';
import {createECDH} from 'node:crypto';
import {validateSubscription} from '../../services/notifications/web-push.mjs';
const receiver=createECDH('prime256v1');receiver.generateKeys();
const keys={p256dh:receiver.getPublicKey().toString('base64url'),auth:Buffer.alloc(16,3).toString('base64url')};
const value=endpoint=>({endpoint,expirationTime:null,keys});
test('R056 independent: Apple regional push enrollment retains provider boundary',()=>{
 for(const endpoint of ['https://web.push.apple.com/Qsynthetic','https://a.push.apple.com/Qsynthetic','https://web.push.apple.com:443/Qsynthetic']){
  if(endpoint.includes(':443/'))assert.throws(()=>validateSubscription(value(endpoint)));
  else assert.match(validateSubscription(value(endpoint)).endpointHash,/^[a-f0-9]{64}$/);
 }
 for(const endpoint of ['http://a.push.apple.com/path','https://push.apple.com/path','https://evilpush.apple.com/path','https://a.push.apple.com.attacker.invalid/path','https://a.push.apple.com./path','https://a.push.apple.com:444/path','https://user@a.push.apple.com/path','https://a.push.apple.com/path#secret','https://127.0.0.1/path'])assert.throws(()=>validateSubscription(value(endpoint)),endpoint);
 for(const endpoint of ['https://fcm.googleapis.com/synthetic','https://updates.push.services.mozilla.com/synthetic'])assert.match(validateSubscription(value(endpoint)).endpointHash,/^[a-f0-9]{64}$/);
});
