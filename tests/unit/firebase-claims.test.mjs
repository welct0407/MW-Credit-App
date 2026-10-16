import test from 'node:test';import assert from 'node:assert/strict';
import {createBusinessPrincipalVerifier} from '../../services/production/business-principal.mjs';
import {createProductionPrincipalVerifier} from '../../services/production/principal.mjs';
import {PROJECT_ID,OWNER_EMAIL} from '../../services/lib/identity.mjs';
// APP-AUTH-02: both remaining browser verifiers apply the same strict claim check.
const now=2000000000,claims=()=>({aud:PROJECT_ID,iss:`https://securetoken.google.com/${PROJECT_ID}`,sub:'synthetic-owner-uid',email:OWNER_EMAIL,email_verified:true,exp:now+3600,iat:now-10,auth_time:now-100,firebase:{sign_in_provider:'google.com'}});
const verifiers={
 business:fn=>createBusinessPrincipalVerifier(fn,()=>now*1000),
 foundation:fn=>createProductionPrincipalVerifier(fn,{projectId:PROJECT_ID,issuer:`https://securetoken.google.com/${PROJECT_ID}`,ownerUid:'synthetic-owner-uid',ownerEmail:OWNER_EMAIL},()=>now*1000),
};
for(const [name,make] of Object.entries(verifiers))test(name+' verifier rejects malformed timing, control characters, tenants and other providers',async()=>{
 assert.equal((await make(async()=>claims())('Bearer synthetic')).ok,true);
 for(const [label,patch] of [['fractional exp',{exp:now+1.5}],['iat>=exp',{iat:now+3600}],['auth_time>iat',{auth_time:now-5}],['DEL in sub',{sub:'synthetic\u007fuid'}],['space in sub',{sub:'synthetic uid'}],['tenant',{firebase:{sign_in_provider:'google.com',tenant:'t'}}],['provider',{firebase:{sign_in_provider:'password'}}],['unverified',{email_verified:false}],['audience',{aud:'other'}]])
  assert.deepEqual(await make(async()=>({...claims(),...patch}))('Bearer synthetic'),{ok:false,status:401,code:'session_invalid'},name+' '+label);
});
