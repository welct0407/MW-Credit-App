// R095 Part B: scripts/dev/claude-test-token.mjs with mocked secret reads and fetch. It exchanges the stored refresh
// token for a DEV ID token, writes it with mode 0600 and prints only the expiry, email and path; any target but the
// DEV web app (the user pool is shared with PROD) and a refused refresh exit 2; no token is ever printed.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,statSync,lstatSync,rmSync,writeFileSync,chmodSync,symlinkSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {main,issue,accessSecret,sessionFrom,webFrom,defaultOut,DEV_APP_ID,SESSION_SECRET,WEB_SECRET,TOKEN_URL,PROJECT} from '../../scripts/dev/claude-test-token.mjs';

const REFRESH='AMf-vB'+'r'.repeat(40),API_KEY='AIza'+'k'.repeat(35);
const jwt=claims=>['eyJhbGciOiJSUzI1NiJ9',Buffer.from(JSON.stringify(claims)).toString('base64url'),'c2ln'].join('.');
const ID_TOKEN=jwt({aud:PROJECT,iss:'https://securetoken.google.com/'+PROJECT,email:'claude-test@example.invalid',sub:'u1'});
const web=(changes={})=>JSON.stringify({apiKey:API_KEY,appId:DEV_APP_ID,authDomain:PROJECT+'.firebaseapp.com',projectId:PROJECT,...changes});
const session=JSON.stringify({refreshToken:REFRESH,email:'Claude-Test@example.invalid'});
function harness({secrets={},status=200,body={id_token:ID_TOKEN,refresh_token:'rotated-'+REFRESH,expires_in:'3600',user_id:'u1',project_id:'737787224638'}}={}){
 const calls=[],writes=[],out=[],err=[];
 const values={[SESSION_SECRET]:session,[WEB_SECRET]:web(),...secrets};
 return {calls,writes,out,err,run:argv=>main(argv,{stdout:{write:t=>out.push(t)},stderr:{write:t=>err.push(t)},
  readSecret:async name=>{calls.push('secret '+name);if(!(name in values))throw Error('unexpected secret '+name);return values[name];},
  fetchImpl:async(url,init)=>{calls.push({url,init});return {ok:status<300,status,json:async()=>body};},
  write:(file,text)=>writes.push([file,text])})};
}
const leaks=h=>[...h.out,...h.err].join('').match(new RegExp([REFRESH,ID_TOKEN.split('.')[1],'rotated'].join('|')));

test('exchanges the refresh token at securetoken with the DEV web key and writes the ID token, printing no token',async()=>{
 const h=harness();
 assert.equal(await h.run(['--out','/tmp/x/id-token']),0);
 assert.deepEqual(h.calls.slice(0,2),['secret '+SESSION_SECRET,'secret '+WEB_SECRET]);
 const {url,init}=h.calls[2];
 assert.equal(url,TOKEN_URL+'?key='+API_KEY);
 assert.equal(init.method,'POST');
 assert.deepEqual(Object.fromEntries(new URLSearchParams(init.body)),{grant_type:'refresh_token',refresh_token:REFRESH});
 assert.deepEqual(h.writes,[['/tmp/x/id-token',ID_TOKEN]]);
 assert.deepEqual(JSON.parse(h.out.join('')),{expiresIn:3600,email:'claude-test@example.invalid',out:'/tmp/x/id-token'});
 assert.equal(leaks(h),null);assert.deepEqual(h.err,[]);
});
test('the default output is under MW_SCRATCH, and a bare refresh token secret works',async()=>{
 const previous=process.env.MW_SCRATCH;process.env.MW_SCRATCH='/tmp/scratch-r095';
 try{
  const h=harness({secrets:{[SESSION_SECRET]:REFRESH+'\n'}});
  assert.equal(await h.run([]),0);
  assert.equal(h.writes[0][0],'/tmp/scratch-r095/claude-dev-id-token');
 }finally{if(previous===undefined)delete process.env.MW_SCRATCH;else process.env.MW_SCRATCH=previous;}
});
const secretsOk=async name=>name===SESSION_SECRET?session:web();
const exchangeOk=async()=>({ok:true,status:200,json:async()=>({id_token:ID_TOKEN,expires_in:'3600'})});
test('an existing 0644 file is replaced by a new 0600 regular file; a symlink at the path is refused (exit 2)',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'r095-token-'));
 try{
  const file=join(dir,'id-token');writeFileSync(file,'old');chmodSync(file,0o644);
  await issue({out:file,readSecret:secretsOk,fetchImpl:exchangeOk});
  const st=lstatSync(file);assert.ok(st.isFile());assert.equal(st.mode&0o777,0o600);assert.equal(readFileSync(file,'utf8'),ID_TOKEN);
  const target=join(dir,'elsewhere');writeFileSync(target,'keep');const link=join(dir,'link');symlinkSync(target,link);
  const err=[];
  assert.equal(await main(['--out',link],{stdout:{write:()=>{}},stderr:{write:t=>err.push(t)},readSecret:secretsOk,fetchImpl:exchangeOk}),2);
  assert.equal(err.join(''),'Refused: Output path is not a regular file\n');
  assert.equal(readFileSync(target,'utf8'),'keep');assert.ok(lstatSync(link).isSymbolicLink());
  assert.equal(await main(['--out',dir],{stdout:{write:()=>{}},stderr:{write:()=>{}},readSecret:secretsOk,fetchImpl:exchangeOk}),2,'a directory is refused');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('without MW_SCRATCH the default is a new private directory, never a fixed shared name',()=>{
 const previous=process.env.MW_SCRATCH;delete process.env.MW_SCRATCH;
 const made=[];
 try{
  for(let i=0;i<2;i++){const file=defaultOut();made.push(file);const dir=file.slice(0,file.lastIndexOf('/'));
   assert.ok(dir.startsWith(join(tmpdir(),'mw-claude-token-')));assert.equal(statSync(dir).mode&0o777,0o700);}
  assert.notEqual(made[0],made[1]);
 }finally{if(previous!==undefined)process.env.MW_SCRATCH=previous;for(const f of made)rmSync(f.slice(0,f.lastIndexOf('/')),{recursive:true,force:true});}
});
test('the real writer leaves the file at mode 0600',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'r095-token-'));
 try{
  const file=join(dir,'id-token');
  const summary=await issue({out:file,readSecret:async name=>name===SESSION_SECRET?session:web(),fetchImpl:async()=>({ok:true,status:200,json:async()=>({id_token:ID_TOKEN,expires_in:'3600'})})});
  assert.equal(readFileSync(file,'utf8'),ID_TOKEN);assert.equal(statSync(file).mode&0o777,0o600);assert.equal(summary.expiresIn,3600);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
for(const [name,secrets] of [['the PROD web app',{[WEB_SECRET]:web({appId:'1:737787224638:web:0ed0ba9555749c1cfbe76f'})}],
 ['another project',{[WEB_SECRET]:web({projectId:'other-project'})}],['a malformed API key',{[WEB_SECRET]:web({apiKey:'nope'})}],
 ['a session secret without a token',{[SESSION_SECRET]:JSON.stringify({email:'x@example.invalid'})}],['unreadable web JSON',{[WEB_SECRET]:'{'}]])
 test(`refuses ${name} before any exchange (exit 2)`,async()=>{
  const h=harness({secrets});
  assert.equal(await h.run([]),2);
  assert.equal(h.calls.some(c=>typeof c==='object'),false);assert.deepEqual(h.writes,[]);
  assert.match(h.err.join(''),/^Refused: /);assert.equal(leaks(h),null);
 });
test('a refused refresh (400) exits 2 with the error code only; a server failure exits 1; nothing is written',async()=>{
 const refused=harness({status:400,body:{error:{code:400,message:'TOKEN_EXPIRED',errors:[{message:REFRESH}]}}});
 assert.equal(await refused.run([]),2);assert.equal(refused.err.join(''),'Refused: Refresh refused: TOKEN_EXPIRED\n');
 const down=harness({status:503,body:{}});
 assert.equal(await down.run([]),1);assert.match(down.err.join(''),/^Failed: Token exchange failed \(HTTP 503/);
 for(const h of [refused,down]){assert.deepEqual(h.writes,[]);assert.deepEqual(h.out,[]);assert.equal(leaks(h),null);}
});
test('an ID token for another project or another account is refused and not written',async()=>{
 for(const claims of [{aud:'other',iss:'https://securetoken.google.com/other',email:'claude-test@example.invalid'},
  {aud:PROJECT,iss:'https://securetoken.google.com/'+PROJECT,email:'someone-else@example.invalid'}]){
  const h=harness({body:{id_token:jwt(claims),expires_in:'3600'}});
  assert.equal(await h.run([]),2,JSON.stringify(claims));assert.deepEqual(h.writes,[]);assert.equal(leaks(h),null);
 }
});
test('unknown arguments are a refusal',async()=>{
 for(const argv of [['--print'],['--out'],['--out','--x']]){const h=harness();assert.equal(await h.run(argv),2,argv.join(' '));assert.equal(h.calls.length,0);}
});
test('Secret Manager access reads the latest version of the named DEV secret with the bearer token',async()=>{
 const seen=[];
 const text=await accessSecret(WEB_SECRET,{accessToken:'operator-token',fetchImpl:async(url,init)=>{seen.push([url,init.headers.authorization]);
  return {ok:true,status:200,json:async()=>({payload:{data:Buffer.from(web()).toString('base64')}})};}});
 assert.deepEqual(seen,[[`https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/${WEB_SECRET}/versions/latest:access`,'Bearer operator-token']]);
 assert.equal(webFrom(text).appId,DEV_APP_ID);
 await assert.rejects(accessSecret(WEB_SECRET,{accessToken:'t',fetchImpl:async()=>({ok:false,status:403,json:async()=>({})})}),/unreadable \(HTTP 403\)/);
 assert.deepEqual(sessionFrom(' '+REFRESH+' '),{refreshToken:REFRESH,email:null});
});
