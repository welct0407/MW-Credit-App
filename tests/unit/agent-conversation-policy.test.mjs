import test from 'node:test';import assert from 'node:assert/strict';
import {loadAgentConversationPolicy,createConversationWorkloadVerifier,resolveConversationActor} from '../../services/agent-conversations/policy.mjs';
const project='clever-oasis-508610-n7';
const policy={version:1,environment:'dev',audience:'https://mw-credit-app-command-dev-737787224638.asia-southeast1.run.app',callerEmail:`synthetic-agent@${project}.iam.gserviceaccount.com`,callerSubject:'123456789',readPartnerIds:['reader','reviewer'],reviewerPartnerIds:['reviewer'],evidenceSha256:'a'.repeat(64)};
const env={AGENT_CONVERSATION_API_ENABLED:'true',AGENT_CONVERSATION_POLICY_JSON:JSON.stringify(policy),AGENT_CONVERSATION_POLICY_SECRET_VERSION:`projects/${project}/secrets/mw-credit-app-dev-agent-conversation-policy/versions/1`};
test('conversation policy is separate/default-off and exact environment/numeric version scoped',()=>{
 assert.equal(loadAgentConversationPolicy({},'dev'),null);assert.equal(loadAgentConversationPolicy({AGENT_RECEIPT_API_ENABLED:'true'},'dev'),null);
 assert.deepEqual(loadAgentConversationPolicy(env,'dev'),policy);
 for(const change of [{environment:'prod'},{reviewerPartnerIds:['unknown']},{readPartnerIds:['reader','reader']},{callerEmail:`mw-integration-agent@${project}.iam.gserviceaccount.com`},{extra:true}])assert.throws(()=>loadAgentConversationPolicy({...env,AGENT_CONVERSATION_POLICY_JSON:JSON.stringify({...policy,...change})},'dev'));
 for(const version of [undefined,'latest',env.AGENT_CONVERSATION_POLICY_SECRET_VERSION.replace('-dev-','-prod-')])assert.throws(()=>loadAgentConversationPolicy({...env,AGENT_CONVERSATION_POLICY_SECRET_VERSION:version},'dev'));
});
test('workload and Partner authority remain separate and current reviewer revocation denies writes',async()=>{
 const now=Date.now(),claims={aud:policy.audience,iss:'https://accounts.google.com',email:policy.callerEmail,sub:policy.callerSubject,email_verified:true,iat:now/1000,exp:now/1000+60};
 const identity=await createConversationWorkloadVerifier(policy,async()=>claims,()=>now)('Bearer synthetic');
 assert.deepEqual(identity,{issuer:'https://accounts.google.com',subject:policy.callerSubject});
 for(const patch of [{aud:'other'},{email:'other'},{sub:'other'},{iss:'https://securetoken.google.com/'+project},{exp:now/1000}])await assert.rejects(createConversationWorkloadVerifier(policy,async()=>({...claims,...patch}),()=>now)('Bearer synthetic'));
 let row={id:'reviewer',email:'reviewer@example.invalid',enabled:true,reviewer:true,matches:'1'};
 const client={query:async(sql,args)=>{assert.deepEqual(args,['reviewer']);return{rows:[row]};}};
 assert.equal((await resolveConversationActor(client,policy,identity,'reviewer',{write:true})).partnerId,'reviewer');
 row={...row,reviewer:false};await assert.rejects(resolveConversationActor(client,policy,identity,'reviewer',{write:true}));
 assert.equal((await resolveConversationActor(client,policy,identity,'reviewer')).partnerId,'reviewer');
 for(const patch of [{enabled:false},{matches:'2'},{email:''}]){row={...row,...patch};await assert.rejects(resolveConversationActor(client,policy,identity,'reviewer'));}
});
