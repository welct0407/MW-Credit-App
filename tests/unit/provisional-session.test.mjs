import test from 'node:test';
import assert from 'node:assert/strict';
const {persistedSessionIdentity,provisionalUser,unconfirmedSession}=await import('../../apps/pwa/src/provisional-session.ts');

// R132: the provisional session reads only the persisted identity; any doubt turns the fast path off.
const apiKey='synthetic-public-key',key='firebase:authUser:'+apiKey+':[DEFAULT]';
const persisted={uid:'synthetic-owner',email:'synthetic@example.test',emailVerified:true,isAnonymous:false,providerData:[],stsTokenManager:{refreshToken:'synthetic-refresh',accessToken:'synthetic-access',expirationTime:Date.now()+3600000},createdAt:'1',lastLoginAt:'2',apiKey,appName:'[DEFAULT]'};
const storage=(values)=>({getItem:name=>Object.hasOwn(values,name)?values[name]:null});

test('a valid persisted Firebase user yields only its uid and email',()=>{
 const identity=persistedSessionIdentity(apiKey,storage({[key]:JSON.stringify(persisted)}));
 assert.deepEqual(identity,{uid:'synthetic-owner',email:'synthetic@example.test'});
 assert.deepEqual(Object.keys(identity).sort(),['email','uid']);
 assert.ok(!JSON.stringify(identity).includes('synthetic-refresh'));assert.ok(!JSON.stringify(identity).includes('synthetic-access'));
 assert.deepEqual(persistedSessionIdentity(apiKey,storage({[key]:JSON.stringify({...persisted,email:undefined})})),{uid:'synthetic-owner',email:null});
});

test('a wrong key, app name, uid or shape, or unreadable storage gives no identity',()=>{
 const read=(value,k=key,a=apiKey)=>persistedSessionIdentity(a,storage({[k]:typeof value==='string'?value:JSON.stringify(value)}));
 assert.equal(read({...persisted,apiKey:'other-key'}),null);
 assert.equal(read(persisted,'firebase:authUser:other-key:[DEFAULT]'),null);
 assert.equal(read(persisted,key,''),null);
 assert.equal(read({...persisted,appName:'secondary'}),null);
 assert.equal(read(persisted,'firebase:authUser:'+apiKey+':secondary'),null);
 for(const uid of ['',123,null,undefined,'x'.repeat(129)])assert.equal(read({...persisted,uid}),null);
 assert.equal(read({...persisted,email:42}),null);
 for(const raw of ['{not json','null','[]','"text"','42'])assert.equal(read(raw),null);
 assert.equal(persistedSessionIdentity(apiKey,storage({})),null);
 assert.equal(persistedSessionIdentity(apiKey,{getItem(){throw new Error('SecurityError')}}),null);
});

test('the facade token waits for confirmation and then comes from the confirmed user',async()=>{
 const session=provisionalUser({uid:'synthetic-owner',email:'synthetic@example.test'});
 assert.equal(session.uid,'synthetic-owner');assert.equal(session.email,'synthetic@example.test');assert.equal(session.confirmed,false);
 assert.equal(unconfirmedSession(session),session);
 let token=null;const pending=session.getIdToken(true).then(value=>{token=value});
 await new Promise(resolve=>setTimeout(resolve,10));assert.equal(token,null);
 const calls=[];const real={uid:'synthetic-owner',email:'confirmed@example.test',async getIdToken(force){calls.push([this,force]);return 'real-token'}};
 assert.equal(session.confirm(real),true);await pending;await session.ready;
 assert.equal(token,'real-token');assert.deepEqual(calls,[[real,true]]);
 assert.equal(session.confirmed,true);assert.equal(session.email,'confirmed@example.test');assert.equal(unconfirmedSession(session),null);
 assert.equal(await session.getIdToken(),'real-token');
 assert.equal(unconfirmedSession(real),null);assert.equal(unconfirmedSession(null),null);
});

test('rejection rejects waiting tokens, another account rejects, and the session settles once',async()=>{
 const session=provisionalUser({uid:'synthetic-owner',email:null});
 const pending=session.getIdToken();session.reject(new Error('Session unavailable'));
 await assert.rejects(pending,/Session unavailable/);await assert.rejects(session.ready,/Session unavailable/);
 assert.equal(session.confirm({uid:'synthetic-owner',email:null,getIdToken:async()=>'late'}),false);
 assert.equal(session.confirmed,false);await assert.rejects(session.getIdToken(),/Session unavailable/);

 const other=provisionalUser({uid:'synthetic-owner',email:null});
 assert.equal(other.confirm({uid:'another-owner',email:null,getIdToken:async()=>'other'}),false);
 await assert.rejects(other.ready,/Session unavailable/);

 const once=provisionalUser({uid:'synthetic-owner',email:null});
 assert.equal(once.confirm({uid:'synthetic-owner',email:null,getIdToken:async()=>'first'}),true);
 assert.equal(once.confirm({uid:'synthetic-owner',email:null,getIdToken:async()=>'second'}),false);once.reject(new Error('late'));
 await once.ready;assert.equal(await once.getIdToken(),'first');
 assert.ok(Object.isFrozen(once));
});
