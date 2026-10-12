import {OAuth2Client} from 'google-auth-library';
const project='clever-oasis-508610-n7';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys.slice().sort().join(',');
export function loadAgentConversationPolicy(env,environment){
 if(env.AGENT_CONVERSATION_API_ENABLED===undefined||env.AGENT_CONVERSATION_API_ENABLED==='false')return null;
 const fail=()=>{throw Error('invalid_agent_conversation_configuration');};
 if(env.AGENT_CONVERSATION_API_ENABLED!=='true'||!['dev','prod'].includes(environment))fail();
 let value;try{value=JSON.parse(env.AGENT_CONVERSATION_POLICY_JSON);}catch{fail();}
 const audience=`https://mw-credit-app-command-${environment}-737787224638.asia-southeast1.run.app`;
 if(!exact(value,['version','environment','audience','callerEmail','callerSubject','readPartnerIds','reviewerPartnerIds','evidenceSha256'])
   ||value.version!==1||value.environment!==environment||value.audience!==audience
   ||typeof value.callerEmail!=='string'||!new RegExp(`^[a-z][a-z0-9-]{4,28}[a-z0-9]@${project}\\.iam\\.gserviceaccount\\.com$`).test(value.callerEmail)
   ||environment==='dev'&&value.callerEmail===`mw-integration-agent@${project}.iam.gserviceaccount.com`
   ||typeof value.callerSubject!=='string'||!/^\d{1,128}$/.test(value.callerSubject)
   ||!/^[a-f0-9]{64}$/.test(value.evidenceSha256??'')
   ||typeof env.AGENT_CONVERSATION_POLICY_SECRET_VERSION!=='string'
   ||!new RegExp(`^projects/${project}/secrets/mw-credit-app-${environment}-agent-conversation-policy/versions/[1-9][0-9]*$`).test(env.AGENT_CONVERSATION_POLICY_SECRET_VERSION))fail();
 for(const key of ['readPartnerIds','reviewerPartnerIds']){
  const ids=value[key];if(!Array.isArray(ids)||ids.length>100||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id||Buffer.byteLength(id)>256||/[\u0000-\u001f]/.test(id)))fail();
 }
 if(!value.readPartnerIds.length||value.reviewerPartnerIds.some(id=>!value.readPartnerIds.includes(id)))fail();
 return Object.freeze({...value,readPartnerIds:Object.freeze(value.readPartnerIds),reviewerPartnerIds:Object.freeze(value.reviewerPartnerIds)});
}

export function createConversationWorkloadVerifier(policy,verifyOidc,now=Date.now){
 const oidc=verifyOidc?null:new OAuth2Client();
 const verify=verifyOidc??(async(token,audience)=>(await oidc.verifyIdToken({idToken:token,audience})).getPayload());
 return async authorization=>{
  if(!policy)throw Error('access_denied');
  const match=/^Bearer ([^\s]+)$/.exec(authorization??'');if(!match)throw Error('access_denied');
  const p=await verify(match[1],policy.audience);
  if(!p||p.aud!==policy.audience||!['accounts.google.com','https://accounts.google.com'].includes(p.iss)
    ||p.email!==policy.callerEmail||p.sub!==policy.callerSubject||p.email_verified!==true
    ||!Number.isFinite(p.exp)||p.exp*1000<=now()||!Number.isFinite(p.iat)||p.iat*1000>now()+60000)throw Error('access_denied');
  return Object.freeze({issuer:'https://accounts.google.com',subject:p.sub});
 };
}

export async function resolveConversationActor(client,policy,workload,partnerId,{write=false}={}){
 const deny=()=>{throw Object.assign(Error('access_denied'),{code:'42501'});};
 if(!policy.readPartnerIds.includes(partnerId)||write&&!policy.reviewerPartnerIds.includes(partnerId))deny();
 const rows=(await client.query(`SELECT p."Row ID" AS id,lower(btrim(p."Login Email")) AS email,
 p."IG Integration Enabled" AS enabled,p."AI Reviewer" AS reviewer,
 (SELECT count(*) FROM public."Partners" other WHERE lower(btrim(other."Login Email"))=lower(btrim(p."Login Email"))) AS matches
 FROM public."Partners" p WHERE p."Row ID"=$1`,[partnerId])).rows;
 const p=rows[0];
 if(rows.length!==1||!p.email||!p.email.includes('@')||p.enabled!==true||Number(p.matches)!==1||write&&p.reviewer!==true)deny();
 return {issuer:workload.issuer,subject:workload.subject,partnerId:p.id,loginEmail:p.email};
}
