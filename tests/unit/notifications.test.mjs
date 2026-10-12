import {createECDH} from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';
import {validateSubscription} from '../../services/notifications/web-push.mjs';
import {createNotificationDispatcher} from '../../services/notifications/dispatcher.mjs';
const curve=createECDH('prime256v1');curve.generateKeys();
const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/synthetic',expirationTime:null,keys:{p256dh:curve.getPublicKey().toString('base64url'),auth:Buffer.alloc(16,1).toString('base64url')}};
test('push enrollment accepts supported HTTPS providers and rejects SSRF, credentials and malformed keys',()=>{
 assert.match(validateSubscription(subscription).endpointHash,/^[a-f0-9]{64}$/);
 for(const endpoint of ['http://fcm.googleapis.com/path','https://127.0.0.1/path','https://fcm.googleapis.com.attacker.invalid/path','https://private.invalid/path','https://user@fcm.googleapis.com/path','https://fcm.googleapis.com:444/path'])assert.throws(()=>validateSubscription({...subscription,endpoint}));
 assert.throws(()=>validateSubscription({...subscription,keys:{...subscription.keys,auth:'bad'}}));
});
test('disabled dispatcher has zero pool and transport effects',async()=>{
 const dispatch=createNotificationDispatcher({pool:{connect(){throw Error('pool touched')}},transport(){throw Error('transport touched')}});
 assert.deepEqual(await dispatch(),{enabled:false,claimed:0});
});
