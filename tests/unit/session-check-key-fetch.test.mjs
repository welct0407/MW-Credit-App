import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {generateKeyPairSync,createSign} from 'node:crypto';
import {sessionCheckFailure} from '../../services/api/session-check.mjs';
import {createBusinessPrincipalVerifier} from '../../services/production/business-principal.mjs';
import {createFirebasePrincipalVerifier} from '../../services/api/firebase-principal.mjs';
// APP-AUTH-01 gap: firebase-admin 14.5.0 reports a Google public-key fetch failure as auth/argument-error with the raw transport
// message. That is an outage (503), not an invalid session (401). Real firebase-admin with the key fetcher stubbed.
const require=createRequire(import.meta.url);
const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const jwt=require(new URL('../../node_modules/firebase-admin/lib/utils/jwt.js',import.meta.url).pathname);
const project='synthetic-project',issuer='https://securetoken.google.com/'+project;
const app=initializeApp({projectId:project},'session-check-key-fetch');
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
function token({kid='k1',aud=project,iss=issuer,exp}={}){
 const now=Math.floor(Date.now()/1000);
 const head=b64({alg:'RS256',kid,typ:'JWT'}),body=b64({aud,iss,sub:'synthetic-uid',iat:now-10,exp:exp??now+3000,auth_time:now-10});
 return head+'.'+body+'.'+createSign('RSA-SHA256').update(head+'.'+body).sign(privateKey).toString('base64url');
}
const verify=(value,revoked)=>getAuth(app).verifyIdToken(value,revoked);
const withKeys=async(fetchPublicKeys,run)=>{const original=jwt.UrlKeyFetcher.prototype.fetchPublicKeys;jwt.UrlKeyFetcher.prototype.fetchPublicKeys=fetchPublicKeys;try{return await run()}finally{jwt.UrlKeyFetcher.prototype.fetchPublicKeys=original}};
const unavailable={ok:false,status:503,code:'session_check_unavailable'},invalid={ok:false,status:401,code:'session_invalid'};
test('a public-key fetch outage is 503 session_check_unavailable in every verifier',async()=>{
 for(const outage of [new Error('getaddrinfo ENOTFOUND www.googleapis.com'),new Error('Error fetching public keys for Google certs: <!DOCTYPE html>'),Object.assign(new Error('socket hang up'),{code:'ECONNRESET'})]){
  await withKeys(()=>Promise.reject(outage),async()=>{
   let error;try{await verify(token(),true)}catch(caught){error=caught}
   assert.equal(error?.code,'auth/argument-error','firebase-admin reports the outage as argument-error');
   assert.deepEqual(sessionCheckFailure(error),unavailable,outage.message);
   assert.deepEqual(await createBusinessPrincipalVerifier(verify)('Bearer '+token()),unavailable);
   assert.deepEqual(await createFirebasePrincipalVerifier(verify,{ownerUid:'synthetic-uid',identityMode:'uid-pinned'})('Bearer '+token()),unavailable);
  });
 }
});
test('genuine token failures stay 401 session_invalid',async()=>{
 const keys={k1:publicKey.export({type:'spki',format:'pem'})};
 await withKeys(()=>Promise.resolve(keys),async()=>{
  const business=createBusinessPrincipalVerifier(verify);
  for(const [name,value] of [['malformed','not-a-jwt'],['wrong audience',token({aud:'other-project'})],['wrong issuer',token({iss:'https://securetoken.google.com/other'})],['unknown kid',token({kid:'k2'})],['expired',token({exp:Math.floor(Date.now()/1000)-100})],['bad signature',token().slice(0,-8)+'AAAAAAAA']]){
   assert.deepEqual(await business('Bearer '+value),invalid,name);
  }
 });
 for(const message of ['Firebase ID token has invalid signature. See https://firebase.google.com/docs/auth/admin/verify-id-tokens for details on how to retrieve an ID token.','Firebase ID token has "kid" claim which does not correspond to a known public key. Most likely the ID token is expired, so get a fresh token from your client app and try again.','First argument to verifyIdToken() must be a Firebase ID token string.','Decoding Firebase ID token failed. Make sure you passed the entire string JWT which represents an ID token.','verifyIdToken() expects an ID token, but was given a custom token.'])assert.deepEqual(sessionCheckFailure(Object.assign(Error(message),{code:'auth/argument-error'})),invalid,message);
 for(const message of ['Error fetching Json Web Keys: timeout','getaddrinfo EAI_AGAIN www.googleapis.com','The provided public client certificate URL is an invalid URL.',''])assert.deepEqual(sessionCheckFailure(Object.assign(Error(message),{code:'auth/argument-error'})),unavailable,message);
});
