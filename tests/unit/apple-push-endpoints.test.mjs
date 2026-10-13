import test from 'node:test';
import assert from 'node:assert/strict';
import {createECDH} from 'node:crypto';
import {validateSubscription} from '../../services/notifications/web-push.mjs';

const curve=createECDH('prime256v1');curve.generateKeys();
const subscription=endpoint=>({endpoint,expirationTime:null,keys:{p256dh:curve.getPublicKey().toString('base64url'),auth:Buffer.alloc(16,1).toString('base64url')}});

test('Apple registration accepts canonical valid push.apple.com subdomains',()=>{
 for(const host of ['web.push.apple.com','webpush.push.apple.com','webpush-123.push.apple.com','a.b.push.apple.com','a'.repeat(63)+'.push.apple.com','fcm.googleapis.com','updates.push.services.mozilla.com']) {
  const endpoint=`https://${host}/synthetic-token`;
  assert.equal(validateSubscription(subscription(endpoint)).endpoint,endpoint);
 }
});

test('Apple registration rejects spoofed suffixes and noncanonical provider URLs',()=>{
 for(const host of ['push.apple.com','evilpush.apple.com','push.apple.com.evil.invalid','web.push.apple.com.evil.invalid','web.push.apple.com.','-web.push.apple.com','web-.push.apple.com','web..push.apple.com','web_push.push.apple.com','a'.repeat(64)+'.push.apple.com']) {
  assert.throws(()=>validateSubscription(subscription(`https://${host}/synthetic-token`)),/invalid_subscription/,host);
 }
 for(const endpoint of ['http://webpush.push.apple.com/token','https://webpush.push.apple.com:8443/token','https://webpush.push.apple.com:443/token','https://user@webpush.push.apple.com/token','https://webpush.push.apple.com@evil.invalid/token','https://webpush.push.apple.com/token#fragment','https://WEBPUSH.push.apple.com/token']) {
  assert.throws(()=>validateSubscription(subscription(endpoint)),/invalid_subscription/,endpoint);
 }
});

test('Apple endpoint widening preserves subscription shape and expiry checks',()=>{
 const value=subscription('https://webpush.push.apple.com/token');
 const {expirationTime,...missing}=value;
 for(const invalid of [missing,{...value,expirationTime:0},{...value,extra:true},{...value,keys:{...value.keys,auth:'bad'}}])assert.throws(()=>validateSubscription(invalid),/invalid_subscription/);
});
