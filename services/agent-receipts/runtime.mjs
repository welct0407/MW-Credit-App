import {OAuth2Client} from 'google-auth-library';
import {agentIdentity,canonicalAgentCommand} from './contract.mjs';
const project='clever-oasis-508610-n7';
const fail=()=>{throw Error('invalid_agent_receipt_configuration');};
export function loadAgentReceiptPolicy(env,environment){
 if(env.AGENT_RECEIPT_API_ENABLED===undefined||env.AGENT_RECEIPT_API_ENABLED==='false')return null;
 if(env.AGENT_RECEIPT_API_ENABLED!=='true'||!['dev','prod'].includes(environment))fail();
 let p;try{p=JSON.parse(env.AGENT_RECEIPT_POLICY_JSON);}catch{fail();}
 if(!p||Object.keys(p).sort().join(',')!==['environment','audience','callerEmail','callerSubject','automaticPartnerId','reviewerPartnerIds','evidenceSha256'].sort().join(',')||p.environment!==environment
  ||p.audience!==`https://mw-credit-app-command-${environment}-737787224638.asia-southeast1.run.app`
  ||typeof p.callerEmail!=='string'||!new RegExp(`^[a-z][a-z0-9-]{4,28}[a-z0-9]@${project}\\.iam\\.gserviceaccount\\.com$`).test(p.callerEmail)
  ||environment==='dev'&&p.callerEmail===`mw-integration-agent@${project}.iam.gserviceaccount.com`
  ||typeof p.callerSubject!=='string'||!/^\d{1,128}$/.test(p.callerSubject)||typeof p.automaticPartnerId!=='string'||!p.automaticPartnerId||p.automaticPartnerId.length>256
  ||!Array.isArray(p.reviewerPartnerIds)||p.reviewerPartnerIds.length>100||p.reviewerPartnerIds.some(v=>typeof v!=='string'||!v||v.length>256)||new Set(p.reviewerPartnerIds).size!==p.reviewerPartnerIds.length
  ||!/^[a-f0-9]{64}$/.test(p.evidenceSha256)||!new RegExp(`^projects/${project}/secrets/mw-credit-app-${environment}-agent-receipt-policy/versions/[1-9][0-9]*$`).test(env.AGENT_RECEIPT_POLICY_SECRET_VERSION??''))fail();
 return Object.freeze(p);
}

/** Exact machine-only routes are evaluated before human Origin/Firebase middleware. */
export function createAgentReceiptHandler({next,policy,pool,guardConnection,afterCommit,verifyOidc,now=Date.now}){
 const oidc=verifyOidc?null:new OAuth2Client();
 const verify=verifyOidc??(async(token,audience)=>(await oidc.verifyIdToken({idToken:token,audience})).getPayload());
 const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 return async(req,res)=>{
  const match=/^\/internal\/agent\/receipt-payments(?:\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}))?$/.exec(req.url??'');
  if(!req.url?.startsWith('/internal/agent/'))return next(req,res);
  if(!policy||!match||req.method!==(match[1]?'GET':'POST'))return send(res,404,{error:'not_found'});
  const controller=new AbortController();res.once?.('close',()=>controller.abort());
  const received=now();let claims;
  try{
   const token=/^Bearer ([^\s]+)$/.exec(req.headers.authorization??'');if(!token)throw Error();
   claims=await verify(token[1],policy.audience);
   if(!claims||claims.aud!==policy.audience||!['https://accounts.google.com','accounts.google.com'].includes(claims.iss)||claims.email!==policy.callerEmail||claims.sub!==policy.callerSubject||claims.email_verified!==true||!Number.isFinite(claims.exp)||claims.exp*1000<=now()||!Number.isFinite(claims.iat)||claims.iat*1000>now()+60000)throw Error();
  }catch{return send(res,401,{error:'unauthorized'});}
  let input,command;
  if(!match[1]){
   try{const chunks=[];let length=0;for await(const chunk of req){const bytes=Buffer.from(chunk);length+=bytes.length;if(length>16384)throw Error();chunks.push(bytes);}
    input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));if(!input||Object.keys(input).sort().join(',')!=='actorPartnerId,command')throw Error();
    command=canonicalAgentCommand(input.command);if(command.environment!==policy.environment||(command.mode==='automatic'?input.actorPartnerId!==policy.automaticPartnerId:!policy.reviewerPartnerIds.includes(input.actorPartnerId)))throw Error();
   }catch{return send(res,400,{error:'invalid_receipt_command'});}
  }
  let client,value,commitStarted=false,quarantine=false;
  try{
   client=await pool.connect();await client.query(match[1]?'BEGIN READ ONLY':'BEGIN');await guardConnection(client);
   await client.query("SET LOCAL statement_timeout='10000ms'");await client.query("SET LOCAL lock_timeout='3000ms'");
   if(match[1])value=(await client.query('SELECT public.pwa_agent_receipt_status_v1($1::uuid,$2,$3) value',[match[1],'https://accounts.google.com',claims.sub])).rows[0].value;
   else{
    const rows=(await client.query('SELECT "Row ID" id,lower(btrim("Login Email")) email,"AI Reviewer" reviewer,"IG Integration Enabled" enabled,(SELECT count(*) FROM public."Partners" q WHERE lower(btrim(q."Login Email"))=lower(btrim(p."Login Email"))) matches FROM public."Partners" p WHERE "Row ID"=$1',[input.actorPartnerId])).rows;
    const actor=rows[0];if(rows.length!==1||!actor.email||Number(actor.matches)!==1||command.mode==='reviewed'&&(!actor.reviewer||!actor.enabled)){const error=Error('actor_denied');error.code='42501';throw error;}
    const identity=agentIdentity(command,{issuer:'https://accounts.google.com',subject:claims.sub,partnerId:actor.id,loginEmail:actor.email});
    value=(await client.query('SELECT public.pwa_submit_agent_receipt_v1($1) value',[identity.canonicalJson])).rows[0].value;
   }
   commitStarted=true;await client.query('COMMIT');
  }catch(error){quarantine=commitStarted;try{await client?.query('ROLLBACK');}catch{quarantine=true;}
   return send(res,error.code==='42501'&&!commitStarted?403:503,{error:commitStarted?'receipt_outcome_unknown':'receipt_unavailable'});
  }finally{try{client?.release(quarantine);}catch{}}
  if(!match[1]&&value?.kind==='recorded'&&value.originalOutcome?.status==='posted'){
   const raw=req.headers['x-mw-wake-deadline'];const deadline=typeof raw==='string'&&/^\d{13}$/.test(raw)?Math.min(received+14000,Number(raw)-1000):received;
   try{await afterCommit?.({deadline,signal:controller.signal});}catch{ /* Commit is already acknowledged. */ }
  }
  return send(res,value?.kind==='conflict'?409:value?.originalOutcome?.status==='rejected'?422:200,value);
 };
}
