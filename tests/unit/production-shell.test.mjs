import test from 'node:test';
import assert from 'node:assert/strict';
import { validateShellConfig } from '../../apps/production-foundation/config.mjs';
import { createShellController } from '../../apps/production-foundation/controller.mjs';
import { buildFoundationShell, buildMaintenanceShell } from '../../scripts/production/build-foundation-shell.mjs';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const config={schemaVersion:1,environment:'prod',authIsolation:'shared-default',phase:'enrollment',origin:'https://lm.mw-credit.com',firebase:{projectId:'clever-oasis-508610-n7',apiKey:'AIza'+'a'.repeat(35),appId:'1:737787224638:web:abc123',authDomain:'clever-oasis-508610-n7.firebaseapp.com'},endpoints:null};
const endpoints={reader:'https://mw-credit-app-read-prod-737787224638.asia-southeast1.run.app/api/session',command:'https://mw-credit-app-command-prod-737787224638.asia-southeast1.run.app/api/session'};
const validSession={ok:true,authenticated:true,mode:'foundation',businessAccess:false,membershipVerified:false,capabilities:[]};
function fixture(input=config,initial=null){
  let callback,clears=0;const states=[],calls=[],user={tenantId:null,getIdToken:async force=>{assert.equal(force,true);return 'private-token';}},auth={currentUser:initial};
  const sdk={initializeApp:(c,name)=>{assert.equal(c.projectId,config.firebase.projectId);assert.equal(name,'production-foundation-shell');return{};},inMemoryPersistence:'memory',browserPopupRedirectResolver:'popup',initializeAuth:(app,options)=>{assert.equal(options.persistence,'memory');return auth;},onAuthStateChanged:(a,fn)=>{callback=fn;fn(initial);return()=>{};},signOut:async()=>{clears++;auth.currentUser=null;callback(null);},signInWithPopup:async(a)=>{assert.equal(a.tenantId,null);auth.currentUser=user;callback(user);return{user};},GoogleAuthProvider:class{}};
  const controller=createShellController(input,sdk,s=>states.push(s),async(url,options)=>{calls.push({url,options});return{ok:true,json:async()=>validSession};});
  return{controller,states,calls,auth,user,emit:callback,clears:()=>clears};
}
test('public config separates enrollment from foundation and rejects aliases, secrets and tenant configuration',()=>{
  assert.equal(validateShellConfig(config).phase,'enrollment');
  assert.equal(validateShellConfig({...config,phase:'foundation',endpoints}).endpoints.reader,endpoints.reader);
  for(const change of [{endpoints},{ownerUid:'private'},{phase:'business'},{firebase:{...config.firebase,tenantId:'unexpected'}},{firebase:{...config.firebase,authDomain:'dev-lm.mw-credit.com'}},{firebase:{...config.firebase,projectId:'other'}}])assert.throws(()=>validateShellConfig({...config,...change}));
  for(const reader of ['https://evil.example/api/session',endpoints.reader+'?x=1','https://mw-credit-app-read-dev-x.a.run.app/api/session',endpoints.command])assert.throws(()=>validateShellConfig({...config,phase:'foundation',endpoints:{...endpoints,reader}}));
});
test('enrollment sign-in and explicit access action make zero API calls and never expose identity/token',async()=>{
  const f=fixture();await f.controller.signIn();await f.controller.checkAccess();assert.deepEqual(f.calls,[]);assert.match(f.states.at(-1).status,/Operator verification/);assert.equal(f.states.at(-1).canCheck,false);assert.doesNotMatch(JSON.stringify(f.states),/private-token|synthetic-prod-tenant|welct|uid/);await f.controller.signOut();assert.equal(f.states.at(-1).signedIn,false);
});
test('default auth reestablished for initialization/sign-in; tenant-scoped persisted or callback identity clears',async()=>{
  for(const tenantId of ['tenant-one','tenant-two']){const f=fixture(config,{tenantId});assert.equal(f.clears(),1);assert.equal(f.states.at(-1).signedIn,false);f.auth.tenantId='wrong';await f.controller.signIn();assert.equal(f.auth.tenantId,null);f.emit({tenantId});assert.equal(f.states.at(-1).signedIn,false);assert.equal(f.clears(),2);}
  const reload=fixture();assert.equal(reload.auth.tenantId,null);assert.equal(reload.auth.currentUser,null);
});
test('foundation explicit access checks only two pinned GET sessions and grants no business state',async()=>{
  const f=fixture({...config,phase:'foundation',endpoints});await f.controller.checkAccess();assert.equal(f.calls.length,0);await f.controller.signIn();assert.equal(f.calls.length,0);await f.controller.checkAccess();assert.deepEqual(f.calls.map(c=>c.url),Object.values(endpoints));for(const {options}of f.calls)assert.deepEqual(options,{method:'GET',headers:{Authorization:'Bearer private-token'},credentials:'omit',cache:'no-store',redirect:'error'});assert.match(f.states.at(-1).status,/Business access is disabled/);assert.equal(f.states.at(-1).canCheck,true);
});
test('signout while token acquisition held prevents any session call or revived success',async()=>{
  const f=fixture({...config,phase:'foundation',endpoints});await f.controller.signIn();let release;f.user.getIdToken=()=>new Promise(r=>release=r);const pending=f.controller.checkAccess();await f.controller.signOut();release('private-token');await pending;assert.equal(f.calls.length,0);assert.equal(f.states.at(-1).signedIn,false);
});
test('local immutable shell artifacts are workerless/no-store; maintenance contains no SDK or API code',async()=>{
  const root=await mkdtemp(join(tmpdir(),'mw-phase3b-shell-'));
  for(const phase of ['enrollment','foundation','maintenance']){
    const outDir=join(root,phase),marker=phase==='maintenance'?await buildMaintenanceShell({outDir}):await buildFoundationShell({outDir,config:{...config,phase,endpoints:phase==='foundation'?endpoints:null}});
    const files=await readdir(outDir);assert.equal(files.some(f=>/sw|worker/i.test(f)),false);assert.equal(marker.worker,null);
    const json=await readFile(join(outDir,'public-config.json'),'utf8');assert.equal(marker.configSha256,createHash('sha256').update(json).digest('hex'));
    assert.deepEqual(JSON.parse(await readFile(join(outDir,'firebase.json'),'utf8')).hosting.headers,[{source:'**',headers:[{key:'Cache-Control',value:'no-store'}]}]);
    if(phase==='maintenance'){assert.equal(files.includes('shell.js'),false);assert.doesNotMatch(await readFile(join(outDir,'index.html'),'utf8'),/script|firebase|\/api\//i);}
    else {const code=await readFile(join(outDir,'shell.js'),'utf8');assert.doesNotMatch(code,/serviceWorker\.register|mw-offline|ownerOfflineRepository/);}
    await assert.rejects(buildFoundationShell({outDir,config}),/empty/);
  }
});
