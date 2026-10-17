import test from 'node:test';
import assert from 'node:assert/strict';
import {createECDH} from 'node:crypto';
import {validateSubscription} from '../../services/notifications/web-push.mjs';
// APP-NOTIFY-02: Microsoft Edge on Windows subscribes through WNS (*.notify.windows.com); the rule has the Apple rule's shape.
const curve=createECDH('prime256v1');curve.generateKeys();
const subscription=endpoint=>({endpoint,expirationTime:null,keys:{p256dh:curve.getPublicKey().toString('base64url'),auth:Buffer.alloc(16,1).toString('base64url')}});
test('WNS registration accepts canonical notify.windows.com subdomains with a token query',()=>{
 for(const endpoint of ['https://wns2-sg2p.notify.windows.com/w/?token=AwYAAABsynthetic','https://wns2-bl2p.notify.windows.com/w/?token=BQYAAABsynthetic%2Bvalue','https://a.b.notify.windows.com/w/?token=x'])assert.equal(validateSubscription(subscription(endpoint)).endpoint,endpoint);
});
test('WNS registration rejects spoofed suffixes and noncanonical URLs',()=>{
 for(const host of ['notify.windows.com','evilnotify.windows.com','notify.windows.com.evil.example','wns2-sg2p.notify.windows.com.evil.example','-wns.notify.windows.com','wns..notify.windows.com','wns_2.notify.windows.com'])assert.throws(()=>validateSubscription(subscription(`https://${host}/w/?token=x`)),/invalid_subscription/,host);
 for(const endpoint of ['http://wns2-sg2p.notify.windows.com/w/?token=x','https://wns2-sg2p.notify.windows.com:8443/w/?token=x','https://user@wns2-sg2p.notify.windows.com/w/?token=x','https://wns2-sg2p.notify.windows.com/w/?token=x#fragment','https://WNS2-SG2P.notify.windows.com/w/?token=x'])assert.throws(()=>validateSubscription(subscription(endpoint)),/invalid_subscription/,endpoint);
});
test('existing FCM, Apple and Mozilla endpoints are unchanged',()=>{
 for(const endpoint of ['https://fcm.googleapis.com/fcm/send/synthetic','https://web.push.apple.com/synthetic','https://updates.push.services.mozilla.com/wpush/v2/synthetic'])assert.equal(validateSubscription(subscription(endpoint)).endpoint,endpoint);
});
