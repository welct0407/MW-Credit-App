import {OAuth2Client} from 'google-auth-library';
import {agentCloseIdentity,agentIdentity,canonicalAgentClose,canonicalAgentCommand} from './contract.mjs';
import {readLoanCloseQuote} from '../payment-command/store.mjs';
import {validBorrowerId} from '../business/borrowers.mjs';
import {PROJECT_ID as project,runUrl} from '../lib/identity.mjs';
import {UUID_V4} from '../lib/ids.mjs';
import {statementTimeoutSql,lockTimeoutSql} from '../lib/budget.mjs';
const uuid=UUID_V4.source.slice(1,-1);
const receiptRoute=new RegExp(`^/internal/agent/receipt-payments(?:/(${uuid}))?$`);
// R128: the Instagram-approved Loan Close (reviewed mode only): its quote, the close command and its status.
const closeRoute=new RegExp(`^/internal/agent/loan-closes(?:/(${uuid}))?$`),quoteRoute=/^\/internal\/agent\/loan-closes\/quote\/([^/?#]+)$/;
const fail=()=>{throw Error('invalid_agent_receipt_configuration');};
export function loadAgentReceiptPolicy(env,environment){
 if(env.AGENT_RECEIPT_API_ENABLED===undefined||env.AGENT_RECEIPT_API_ENABLED==='false')return null;
 if(env.AGENT_RECEIPT_API_ENABLED!=='true'||!['dev','prod'].includes(environment))fail();
 let p;try{p=JSON.parse(env.AGENT_RECEIPT_POLICY_JSON);}catch{fail();}
 if(!p||Object.keys(p).sort().join(',')!==['environment','audience','callerEmail','callerSubject','automaticPartnerId','reviewerPartnerIds','evidenceSha256'].sort().join(',')||p.environment!==environment
  ||p.audience!==runUrl(`mw-credit-app-command-${environment}`)
  ||typeof p.callerEmail!=='string'||!new RegExp(`^[a-z][a-z0-9-]{4,28}[a-z0-9]@${project}\\.iam\\.gserviceaccount\\.com$`).test(p.callerEmail)
  ||environment==='dev'&&p.callerEmail===`mw-integration-agent@${project}.iam.gserviceaccount.com`
  ||typeof p.callerSubject!=='string'||!/^\d{1,128}$/.test(p.callerSubject)||typeof p.automaticPartnerId!=='string'||!p.automaticPartnerId||p.automaticPartnerId.length>256
  ||!Array.isArray(p.reviewerPartnerIds)||p.reviewerPartnerIds.length>100||p.reviewerPartnerIds.some(v=>typeof v!=='string'||!v||v.length>256)||new Set(p.reviewerPartnerIds).size!==p.reviewerPartnerIds.length
  ||!/^[a-f0-9]{64}$/.test(p.evidenceSha256)||!new RegExp(`^projects/${project}/secrets/mw-credit-app-${environment}-agent-receipt-policy/versions/[1-9][0-9]*$`).test(env.AGENT_RECEIPT_POLICY_SECRET_VERSION??''))fail();
 return Object.freeze(p);
}

/** The route a machine request names: {kind: receipt|close|quote, id} or null (unknown path or method). */
function route(req){
 const url=req.url??'',receipt=receiptRoute.exec(url),quote=quoteRoute.exec(url),close=closeRoute.exec(url);
 if(receipt)return req.method===(receipt[1]?'GET':'POST')?{kind:'receipt',id:receipt[1]??null}:null;
 if(quote){if(req.method!=='GET')return null;let loanId;try{loanId=decodeURIComponent(quote[1]);}catch{return null;}return validBorrowerId(loanId)?{kind:'quote',id:loanId}:null;}
 if(close)return req.method===(close[1]?'GET':'POST')?{kind:'close',id:close[1]??null}:null;
 return null;
}

/** Exact machine-only routes are evaluated before human Origin/Firebase middleware. */
export function createAgentReceiptHandler({next,policy,pool,guardConnection,afterCommit,verifyOidc,now=Date.now}){
 const oidc=verifyOidc?null:new OAuth2Client();
 const verify=verifyOidc??(async(token,audience)=>(await oidc.verifyIdToken({idToken:token,audience})).getPayload());
 const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 return async(req,res)=>{
  if(!req.url?.startsWith('/internal/agent/'))return next(req,res);
  const target=route(req);
  if(!policy||!target)return send(res,404,{error:'not_found'});
  const received=now();let claims;
  try{
   const token=/^Bearer ([^\s]+)$/.exec(req.headers.authorization??'');if(!token)throw Error();
   claims=await verify(token[1],policy.audience);
   if(!claims||claims.aud!==policy.audience||!['https://accounts.google.com','accounts.google.com'].includes(claims.iss)||claims.email!==policy.callerEmail||claims.sub!==policy.callerSubject||claims.email_verified!==true||!Number.isFinite(claims.exp)||claims.exp*1000<=now()||!Number.isFinite(claims.iat)||claims.iat*1000>now()+60000)throw Error();
  }catch{return send(res,401,{error:'unauthorized'});}
  const write=target.kind!=='quote'&&!target.id,close=target.kind==='close',invalid=close?'invalid_close_command':'invalid_receipt_command';
  let input,command;
  if(write){
   try{const chunks=[];let length=0;for await(const chunk of req){const bytes=Buffer.from(chunk);length+=bytes.length;if(length>(close?16384:65536))throw Error();/* R112: 65536 for schemaVersion 9; SQL keeps 7 and 8 at 16384. */chunks.push(bytes);}
    input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));if(!input||Object.keys(input).sort().join(',')!=='actorPartnerId,command')throw Error();
    if(close){
     // R128: reviewed mode only, so the actor is one of the policy's Reviewers.
     command=canonicalAgentClose(input.command);if(command.environment!==policy.environment||!policy.reviewerPartnerIds.includes(input.actorPartnerId))throw Error();
    }else{
     command=canonicalAgentCommand(input.command);if(command.environment!==policy.environment||(command.mode==='automatic'?input.actorPartnerId!==policy.automaticPartnerId:!policy.reviewerPartnerIds.includes(input.actorPartnerId)))throw Error();
    }
   }catch{return send(res,400,{error:invalid});}
  }
  let client,value,status=200,commitStarted=false,quarantine=false;
  try{
   client=await pool.connect();await client.query(target.kind==='quote'?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':write?'BEGIN':'BEGIN READ ONLY');await guardConnection(client);
   await client.query(statementTimeoutSql('command'));await client.query(lockTimeoutSql);
   if(target.kind==='quote'){const quote=await readLoanCloseQuote(client,target.id);if(quote.ok)value=quote.value;else{status=quote.status;value={error:quote.code};}}
   else if(close&&target.id)value=(await client.query('SELECT public.pwa_operation_status_v2($1::uuid,$2,$3) value',[target.id,'https://accounts.google.com',claims.sub])).rows[0].value;
   else if(target.id)value=(await client.query('SELECT public.pwa_agent_receipt_status_v1($1::uuid,$2,$3) value',[target.id,'https://accounts.google.com',claims.sub])).rows[0].value;
   else{
    const rows=(await client.query('SELECT "Row ID" id,lower(btrim("Login Email")) email,"AI Reviewer" reviewer,"IG Integration Enabled" enabled,(SELECT count(*) FROM public."Partners" q WHERE lower(btrim(q."Login Email"))=lower(btrim(p."Login Email"))) matches FROM public."Partners" p WHERE "Row ID"=$1',[input.actorPartnerId])).rows;
    const actor=rows[0];if(rows.length!==1||!actor.email||Number(actor.matches)!==1||(close||!('operation' in command)&&command.mode==='reviewed')&&(!actor.reviewer||!actor.enabled)){throw Object.assign(Error('actor_denied'),{code:'42501'});}
    const who={issuer:'https://accounts.google.com',subject:claims.sub,partnerId:actor.id,loginEmail:actor.email};
    // R128: the close is the PWA's contract-2 loan.close under the agent's actor; pwa_apply_loan_close_v2 checks it.
    value=close?(await client.query('SELECT public.pwa_submit_operation_v2($1) value',[agentCloseIdentity(input.command,who).canonicalJson])).rows[0].value
     :(await client.query('SELECT public.pwa_submit_agent_receipt_v1($1) value',[agentIdentity(command,who).canonicalJson])).rows[0].value;
   }
   commitStarted=true;await client.query('COMMIT');
  }catch(error){quarantine=commitStarted;try{await client?.query('ROLLBACK');}catch{quarantine=true;}
   const subject=close||target.kind==='quote'?'close':'receipt';
   return send(res,error.code==='42501'&&!commitStarted?403:503,{error:commitStarted&&target.kind!=='quote'?subject+'_outcome_unknown':subject+'_unavailable'});
  }finally{try{client?.release(quarantine);}catch{}}
  if(target.kind==='quote')return send(res,status,value);
  if(write&&value?.kind==='recorded'&&['posted','applied'].includes(value.originalOutcome?.status)){
   const raw=req.headers['x-mw-wake-deadline'];const deadline=typeof raw==='string'&&/^\d{13}$/.test(raw)?Math.min(received+14000,Number(raw)-1000):received;
   // R107: no response-close signal: a closed response must not cancel notify's pass; the ≤14 s deadline bounds the wake.
   try{await afterCommit?.({deadline});}catch{ /* Commit is already acknowledged. */ }
  }
  return send(res,value?.kind==='conflict'?409:value?.originalOutcome?.status==='rejected'?422:200,value);
 };
}
