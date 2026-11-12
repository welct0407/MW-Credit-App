// R144: /health reports the image's release and source commit (services/lib/build-info.mjs), validated, never echoed raw.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {buildInfo} from '../../services/lib/build-info.mjs';
import {createWorkerRuntime} from '../../services/workers/runtime.mjs';
import {createEnvironmentCommandHandler} from '../../services/payment-command/handler.mjs';
import {createReadHandler} from '../../services/api/read-handler.mjs';
import {loadBusinessConfig} from '../../services/production/business-config.mjs';
import {businessEnv} from './business-env-fixture.mjs';

const SHA='0123456789abcdef0123456789abcdef01234567';
test('buildInfo accepts Rnnn or dev and a 7 to 40 hex commit; anything else reads dev/unknown',()=>{
 assert.deepEqual(buildInfo({MW_RELEASE_NUMBER:'R144',MW_SOURCE_COMMIT:SHA}),{release:'R144',commit:SHA});
 assert.deepEqual(buildInfo({MW_RELEASE_NUMBER:'dev',MW_SOURCE_COMMIT:'abcdef1'}),{release:'dev',commit:'abcdef1'});
 assert.deepEqual(buildInfo({}),{release:'dev',commit:'unknown'});
 for(const [release,commit] of [['r144','ABCDEF1'],['R1444','abcdef'],['R144\n','g'.repeat(40)],['$(id)',SHA+'0'],['',' '+SHA]])
  assert.deepEqual(buildInfo({MW_RELEASE_NUMBER:release,MW_SOURCE_COMMIT:commit}),{release:'dev',commit:'unknown'},release);
 assert.ok(Object.isFrozen(buildInfo({})));
});

async function withBuild(fn){
 const prior={release:process.env.MW_RELEASE_NUMBER,commit:process.env.MW_SOURCE_COMMIT};
 process.env.MW_RELEASE_NUMBER='R144';process.env.MW_SOURCE_COMMIT=SHA;
 try{return await fn();}finally{for(const [key,value] of [['MW_RELEASE_NUMBER',prior.release],['MW_SOURCE_COMMIT',prior.commit]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
const call=(handler,url)=>{const res=new EventEmitter(),out={};res.setHeader=()=>{};res.writeHead=status=>{out.status=status;};res.end=body=>{out.status??=res.statusCode;out.body=body?JSON.parse(body):undefined;res.emit('finish');};
 const req=new EventEmitter();Object.assign(req,{method:'GET',url,headers:{}});return Promise.resolve(handler(req,res)).then(()=>out);};

test('worker /health adds release and commit from the worker environment, enabled or not',async()=>{
 const runtime=await createWorkerRuntime({MW_RELEASE_NUMBER:'R144',MW_SOURCE_COMMIT:SHA},new Proxy({},{get(){throw Error('dependency touched');}}));
 assert.deepEqual(await call(runtime.handler,'/health'),{status:200,body:{status:'ok',enabled:false,release:'R144',commit:SHA}});
 const bad=await createWorkerRuntime({MW_RELEASE_NUMBER:'R14',MW_SOURCE_COMMIT:'HEAD'},{});
 assert.deepEqual((await call(bad.handler,'/health')).body,{status:'ok',enabled:false,release:'dev',commit:'unknown'});
});

test('command and read /health keep their fields and add release and commit additively',async()=>withBuild(async()=>{
 const command=createEnvironmentCommandHandler({config:loadBusinessConfig(businessEnv('dev','command')),verifyPrincipal:async()=>assert.fail('health needs no principal'),store:{}});
 assert.deepEqual(await call(command,'/health'),{status:200,body:{ok:true,release:'R144',commit:SHA}});
 const read=createReadHandler({config:loadBusinessConfig(businessEnv('dev','reader')),verifyPrincipal:async()=>assert.fail('health needs no principal'),store:{}});
 assert.deepEqual(await call(read,'/health'),{status:200,body:{status:'ok',environment:'dev',service:'borrower-read',release:'R144',commit:SHA}});
}));
