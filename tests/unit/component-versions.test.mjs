// R144 component versioning: scripts/promotion/component-versions.mjs on a synthetic fixture repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {derive,render,checkSource,drift,main,gitIn,loadRegistry,changedRoles,pathMatcher,facts,START,END} from '../../scripts/promotion/component-versions.mjs';
import * as roles from '../../scripts/promotion/generic-roles.mjs';
import * as hosting from '../../scripts/promotion/deploy-business-hosting.mjs';

const env={...process.env,GIT_AUTHOR_NAME:'t',GIT_AUTHOR_EMAIL:'t@example.invalid',GIT_COMMITTER_NAME:'t',GIT_COMMITTER_EMAIL:'t@example.invalid',GIT_CONFIG_NOSYSTEM:'1',HOME:tmpdir()};
const run=(root,...args)=>{const r=spawnSync('git',['-C',root,...args],{encoding:'utf8',env});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const put=(root,files)=>{for(const [file,text] of Object.entries(files)){mkdirSync(path.dirname(path.join(root,file)),{recursive:true});writeFileSync(path.join(root,file),text);}};
const commit=(root,message,files,tag)=>{put(root,files);run(root,'add','-A');run(root,'commit','-q','-m',message);if(tag)run(root,'tag','-a',tag,'-m',tag);return run(root,'rev-parse','HEAD');};
const dashboard=tags=>JSON.stringify({apiVersion:'dashboard.grafana.app/v2',kind:'Dashboard',spec:{title:'a',tags}},null,2); // the shape of infrastructure/grafana/dashboards/*.json
const tracker=open=>`# Release tracker\n\n| Item | Current value |\n| --- | --- |\n| New product work | **${open} — Open** |\n`;
const inventory=`# Inventory\n\n${START}\n${END}\n\n| DEV | row |\n`;
const live=(dev,prod)=>({dev,prod});
const registry={schemaVersion:1,seedAsOf:'R010',components:[
 {id:'pwa',label:'PWA',kind:'app',paths:['apps/pwa'],native:'hosting-version',live:live({kind:'build-version-json',url:'https://dev.example.invalid/build-version.json',field:'release',credentialed:false},{kind:'build-version-json',url:'https://prod.example.invalid/build-version.json',field:'release',credentialed:false}),seed:{release:'R009',native:null}},
 {id:'api-read',label:'Read',kind:'api',derive:'generic-role',role:'read',native:'image-digest',live:live({kind:'health-json',url:'https://read-dev.example.invalid/health',field:'release',commit:'commit',credentialed:false},{kind:'health-json',url:'https://read-prod.example.invalid/health',field:'release',commit:'commit',credentialed:false}),seed:{release:'R010',native:null}},
 {id:'api-notify',label:'Notify',kind:'api',derive:'generic-role',role:'notify',native:'image-digest',live:live({kind:'health-json',url:null,credentialed:false},{kind:'health-json',url:null,credentialed:false}),seed:{release:'R010',native:null}},
 {id:'api-chat',label:'Chat',kind:'api',derive:'generic-role',role:'chat',native:'image-digest',live:live(null,{kind:'health-json',url:null,credentialed:false}),seed:{release:'R010',native:null}},
 {id:'schema',label:'Schema',kind:'schema',paths:['database/migrations'],native:'flyway',live:live({kind:'cloud-sql',url:null,credentialed:true},{kind:'cloud-sql',url:null,credentialed:true}),seed:{release:'R010',native:1}},
 {id:'agent',label:'Agent',kind:'agent',paths:['integration-agent/src','integration-agent/service-catalogue.json'],native:'catalogue-revision',nativeSource:{file:'integration-agent/service-catalogue.json',pointer:'/revision'},live:live(null,{kind:'ready-json',url:null,field:'release',commit:'commit',credentialed:true}),seed:{release:'R010',native:1}},
 {id:'dashboards',label:'Dashboards',kind:'monitoring',paths:['infrastructure/grafana/dashboards'],native:null,stamp:{kind:'grafana-tag',tagPrefix:'release:',files:'infrastructure/grafana/dashboards/*.json',checkSource:true},live:live(null,{kind:'grafana-api',url:null,field:'tags',tagPrefix:'release:',credentialed:true}),seed:{release:'R010',native:null}},
 {id:'vendor-node',label:'Node',kind:'vendor',paths:['Dockerfile'],native:'vendor',nativeSource:{file:'Dockerfile',pattern:'^FROM (node:[^ ]+)'},live:live(null,null),seed:{release:'R010',native:'node:24.0.0-slim'}},
 {id:'vendor-x',label:'Vendor',kind:'vendor',paths:[],native:'vendor',live:live(null,{kind:'metabase-api',url:'https://vendor.example.invalid/props',field:'version.tag',credentialed:false}),seed:{release:null,native:null}}]};

function fixture(t){
 const root=mkdtempSync(path.join(tmpdir(),'component-versions-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 run(root,'init','-q','-b','main');
 const shas={};
 shas.R010=commit(root,'R010',{
  'scripts/promotion/components.json':JSON.stringify(registry),
  'services/production/business-server.mjs':"import './../lib/shared.mjs';\nimport '../api/read.mjs';\n",
  'services/api/read.mjs':'export const read=1;\n','services/lib/shared.mjs':'export const shared=1;\n',
  'services/workers/server.mjs':"import '../lib/shared.mjs';\n",
  'services/chat/server.mjs':"import {engine} from './engine.mjs';\n",'services/chat/engine.mjs':'export const engine=1;\n',
  'apps/pwa/main.ts':'1\n','database/migrations/V1__a.sql':'select 1;\n','integration-agent/service-catalogue.json':'{"revision":1}\n',
  'infrastructure/grafana/dashboards/a.json':dashboard(['mw-credit']),'Dockerfile':'FROM node:24.0.0-slim AS base\nWORKDIR /app\n',
  'package.json':JSON.stringify({name:'x',scripts:{a:'1'},dependencies:{pg:'1'}}),
  'project/Documents/Release_Tracker.md':tracker('R011'),'project/Documents/Environment_Inventory.md':inventory},'R010');
 shas.R011=commit(root,'R011',{'services/chat/engine.mjs':'export const engine=2;\n','project/Documents/Release_Tracker.md':tracker('R012')},'R011');
 shas.R012=commit(root,'R012',{'database/migrations/V2__b.sql':'select 2;\n','package.json':JSON.stringify({name:'x',scripts:{a:'2'},dependencies:{pg:'1'}}),
  'integration-agent/service-catalogue.json':'{"revision":2}\n','project/Documents/Release_Tracker.md':tracker('R013')},'R012');
 shas.head=commit(root,'R013 work',{'apps/pwa/main.ts':'2\n','Dockerfile':'FROM node:24.1.0-slim AS base\nWORKDIR /app\n'});
 return {root,git:gitIn(root),registry:loadRegistry(root),shas};
}
const byId=result=>Object.fromEntries(result.components.map(c=>[c.id,[c.release,c.native,c.changed]]));

test('derive carries unchanged components forward and reads natives at the commit',async t=>{
 const f=fixture(t);
 assert.deepEqual(byId(derive({git:f.git,registry:f.registry,release:'R010'})),{pwa:['R009',null,false],'api-read':['R010',null,false],'api-notify':['R010',null,false],'api-chat':['R010',null,false],
  schema:['R010',1,false],agent:['R010',1,false],dashboards:['R010',null,false],'vendor-node':['R010','node:24.0.0-slim',false],'vendor-x':[null,null,false]});
 const r012=derive({git:f.git,registry:f.registry,release:'R012',commit:f.shas.R012});
 assert.equal(r012.commit,f.shas.R012);assert.equal(r012.previousTag,'R011');
 assert.deepEqual(byId(r012),{pwa:['R009',null,false],'api-read':['R010',null,false],'api-notify':['R010',null,false],'api-chat':['R011',null,false],
  schema:['R012',2,true],agent:['R012',2,true],dashboards:['R010',null,false],'vendor-node':['R010','node:24.0.0-slim',false],'vendor-x':[null,null,false]},'a scripts-only package.json change rebuilds no image');
 const open=byId(derive({git:f.git,registry:f.registry,release:'R013',commit:f.shas.head}));
 assert.deepEqual(open.pwa,['R013',null,true]);assert.deepEqual(open['vendor-node'],['R013','node:24.1.0-slim',true],'a Dockerfile change: every role and the base image');
 for(const id of ['api-read','api-notify','api-chat'])assert.deepEqual(open[id],['R013',null,true]);
 assert.deepEqual(open.schema,['R012',2,false]);
 const out=[];assert.equal(await main(['derive','--release','R012','--commit',f.shas.R012,'--format','md'],{root:f.root,stdout:x=>out.push(x)}),0);
 assert.match(out[0],/^\| Component \| Last changed in \| Native \|\n/);assert.match(out[0],/\| Schema \| R012 \(changed\) \| V2 \|/);assert.match(out[0],/\| Agent \| R012 \(changed\) \| revision 2 \|/);
 assert.equal(await main(['derive','--release','R012','--format','json'],{root:f.root,stdout:x=>out.push(x)}),0);assert.equal(JSON.parse(out[1]).commit,f.shas.R012);
});

test('derive reuses the generic release kind role derivation (parity)',async t=>{
 const f=fixture(t);
 assert.equal(hosting.genericChangedRoles,roles.genericChangedRoles);assert.equal(hosting.genericRoleClosures,roles.genericRoleClosures);
 assert.deepEqual(hosting.GENERIC_ROLES,roles.GENERIC_ROLES);
 const files=new Set(['services/production/business-server.mjs','services/api/read.mjs','services/lib/shared.mjs','services/workers/server.mjs','services/chat/server.mjs','services/chat/engine.mjs']);
 const closures=roles.genericRoleClosures(files,file=>readFileSync(path.join(f.root,file),'utf8'));
 for(const [from,to] of [[f.shas.R010,f.shas.R011],[f.shas.R011,f.shas.R012],[f.shas.R012,f.shas.head]]){
  const names=run(f.root,'diff','--name-only','--no-renames',from,to).split('\n').filter(Boolean);
  const scriptsOnly=names.includes('package.json')&&from===f.shas.R011;
  assert.deepEqual(changedRoles(f.git,from,to),roles.genericChangedRoles(names,{closures,packageScriptsOnly:scriptsOnly}));
 }
 assert.deepEqual(changedRoles(f.git,f.shas.R010,f.shas.R011),['chat']);
 assert.deepEqual(changedRoles(f.git,f.shas.R011,f.shas.R012),[]);
 const shared=commit(f.root,'shared',{'services/lib/shared.mjs':'export const shared=2;\n'});
 assert.deepEqual(changedRoles(f.git,f.shas.head,shared),['read','command','notify','jobs']);
 const deps=commit(f.root,'deps',{'package.json':JSON.stringify({name:'x',scripts:{a:'2'},dependencies:{pg:'2'}})});
 assert.deepEqual(changedRoles(f.git,shared,deps),[...roles.GENERIC_ROLES]);
});

test('a missing release tag (shallow clone) or a moved tag fails closed',t=>{
 const f=fixture(t);
 const shallow=mkdtempSync(path.join(tmpdir(),'component-versions-shallow-'));t.after(()=>rmSync(shallow,{recursive:true,force:true}));
 const clone=spawnSync('git',['clone','-q','--depth','1','--no-tags','file://'+f.root,shallow],{encoding:'utf8',env});assert.equal(clone.status,0,clone.stderr);
 const head=run(shallow,'rev-parse','HEAD');
 assert.throws(()=>derive({git:gitIn(shallow),registry:f.registry,release:'R013',commit:head}),/missing release tag R010 \(shallow clone\? run git fetch --tags\)/);
 run(f.root,'tag','-d','R011');
 assert.throws(()=>derive({git:f.git,registry:f.registry,release:'R012',commit:f.shas.R012}),/missing release tag R011/);
 assert.throws(()=>derive({git:f.git,registry:f.registry,release:'R012',commit:f.shas.head}),/R012 is tagged at .* not /);
 assert.throws(()=>derive({git:f.git,registry:f.registry,release:'R009',commit:f.shas.R010}),/before the registry seed/);
 assert.throws(()=>derive({git:f.git,registry:f.registry,release:'R013'}),/--commit required/);
 assert.throws(()=>derive({git:f.git,registry:f.registry,release:'R13',commit:f.shas.head}),/--release Rnnn required/);
});

test('render writes the marked block idempotently and --check detects edits',t=>{
 const f=fixture(t),file=path.join(f.root,'project/Documents/Environment_Inventory.md');
 assert.deepEqual(render({git:f.git,registry:f.registry,root:f.root,mode:'write'}),{changed:true,release:'R012'});
 const once=readFileSync(file,'utf8');
 assert.match(once,new RegExp('As of \\*\\*R012\\*\\* \\(`'+f.shas.R012+'`\\)'));assert.match(once,/\| Schema \| R012 \(changed\) \| V2 \|/);assert.match(once,/\| DEV \| row \|\n$/);
 assert.deepEqual(render({git:f.git,registry:f.registry,root:f.root,mode:'write'}),{changed:false,release:'R012'});
 assert.equal(readFileSync(file,'utf8'),once);
 assert.deepEqual(render({git:f.git,registry:f.registry,root:f.root,mode:'check'}),{changed:false,release:'R012'});
 writeFileSync(file,once.replace('| Schema | R012 (changed) | V2 |','| Schema | R011 | V2 |'));
 assert.throws(()=>render({git:f.git,registry:f.registry,root:f.root,mode:'check'}),/not the derivation for R012; run render --write/);
 // A closure render before the tag: the block's own untagged release is kept by a later --check.
 render({git:f.git,registry:f.registry,root:f.root,mode:'write',release:'R013',commit:f.shas.head});
 assert.deepEqual(render({git:f.git,registry:f.registry,root:f.root,mode:'check'}),{changed:false,release:'R013'});
 writeFileSync(file,'# no markers\n');
 assert.throws(()=>render({git:f.git,registry:f.registry,root:f.root,mode:'check'}),/exactly one/);
});

test('check-source requires release:<Open> on dashboards changed since the last tag',t=>{
 const f=fixture(t);
 assert.deepEqual(checkSource({git:f.git,registry:f.registry,root:f.root}),{open:'R013',latest:'R012',checked:[],closurePending:null});
 put(f.root,{'infrastructure/grafana/dashboards/a.json':dashboard(['mw-credit'])+'\n'});
 assert.throws(()=>checkSource({git:f.git,registry:f.registry,root:f.root}),/a\.json: tags none, expected release:R013/);
 put(f.root,{'infrastructure/grafana/dashboards/a.json':dashboard(['mw-credit','release:R012'])});
 assert.throws(()=>checkSource({git:f.git,registry:f.registry,root:f.root}),/tags release:R012, expected release:R013/);
 put(f.root,{'infrastructure/grafana/dashboards/a.json':dashboard(['mw-credit','release:R013'])});
 assert.equal(checkSource({git:f.git,registry:f.registry,root:f.root}).checked.length,1);
 const sha=commit(f.root,'tagged dashboard',{});
 assert.equal(checkSource({git:f.git,registry:f.registry,root:f.root,commit:sha}).checked.length,1);
});

const response=(status,body)=>({status,text:async()=>typeof body==='string'?body:JSON.stringify(body)});
function fetcher(bodies,seen=[]){
 return async(url,init)=>{seen.push({url,method:init.method,redirect:init.redirect,headers:init.headers});
  if(!(url in bodies))throw Error('offline');const value=bodies[url];return value instanceof Error?Promise.reject(value):response(200,value);};
}
test('drift matrix: public sources, --observed, commit-only sources and unverified facts',async t=>{
 const f=fixture(t),seen=[];
 const bodies={'https://prod.example.invalid/build-version.json':{schemaVersion:1,release:'R009',token:'SECRET-BODY-VALUE'},
  'https://dev.example.invalid/build-version.json':{release:'R012'},
  'https://read-prod.example.invalid/health':{status:'ok',release:'dev',commit:f.shas.R012},
  'https://read-dev.example.invalid/health':{status:'ok',release:'R013',commit:f.shas.head.slice(0,8)},
  'https://vendor.example.invalid/props':{version:{tag:'v0.1.2'}}};
 const observed={prod:{schema:{native:2},agent:{release:'R012',commit:f.shas.R012},dashboards:{tags:[['mw-credit','release:R010'],['release:R010']]},'api-chat':{commit:f.shas.R010}},
  dev:{schema:{native:1},'api-notify':{release:'dev',commit:'0'.repeat(40)}}};
 const report=await drift({git:f.git,registry:f.registry,root:f.root,env:'all',observed,fetchImpl:fetcher(bodies,seen)});
 const status=Object.fromEntries(report.rows.map(row=>[row.env+':'+row.id,row.status]));
 assert.deepEqual(status,{'dev:pwa':'drift','dev:api-read':'match','dev:api-notify':'unverified','dev:api-chat':'n/a','dev:schema':'drift','dev:agent':'n/a','dev:dashboards':'n/a','dev:vendor-node':'n/a','dev:vendor-x':'n/a',
  'prod:pwa':'match','prod:api-read':'match','prod:api-notify':'unverified','prod:api-chat':'drift','prod:schema':'match','prod:agent':'match','prod:dashboards':'match','prod:vendor-node':'n/a','prod:vendor-x':'info'});
 assert.equal(report.rows.find(row=>row.id==='api-notify'&&row.env==='prod').reason,'source unreadable');
 assert.match(report.rows.find(row=>row.id==='api-notify'&&row.env==='dev').reason,/not in this clone/);
 assert.equal(report.rows.find(row=>row.id==='vendor-x'&&row.env==='prod').observed,'v0.1.2');
 assert.ok(seen.every(call=>call.method==='GET'&&call.redirect==='error'&&!('authorization' in (call.headers??{}))),'GET only, no credentials');
 const matrix=path.join(f.root,'matrix.json');writeFileSync(matrix,JSON.stringify(observed));
 const lines=[];const code=await main(['drift','--env','prod','--json','--observed',matrix],{root:f.root,stdout:x=>lines.push(x),fetchImpl:fetcher(bodies)});
 assert.equal(code,1,'prod api-chat has no observed fact matching');
 assert.doesNotMatch(lines.join('\n'),/SECRET-BODY-VALUE/);
 // Unverified only: exit 0, or 2 with --strict; a credentialed fact never comes from a public fetch.
 const prodOnly={...bodies};
 const quiet=JSON.parse(JSON.stringify(f.registry));quiet.components=quiet.components.filter(c=>['pwa','schema'].includes(c.id));
 writeFileSync(path.join(f.root,'quiet.json'),JSON.stringify(quiet));
 assert.equal(await main(['drift','--env','prod','--registry','quiet.json'],{root:f.root,stdout:()=>{},fetchImpl:fetcher(prodOnly)}),0);
 assert.equal(await main(['drift','--env','prod','--registry','quiet.json','--strict'],{root:f.root,stdout:()=>{},fetchImpl:fetcher(prodOnly)}),2);
 const observedFile=path.join(f.root,'observed.json');writeFileSync(observedFile,JSON.stringify({prod:{schema:{native:2}}}));
 assert.equal(await main(['drift','--env','prod','--registry','quiet.json','--strict','--observed',observedFile],{root:f.root,stdout:()=>{},fetchImpl:fetcher(prodOnly)}),0);
 await assert.rejects(main(['drift','--env','staging'],{root:f.root,stdout:()=>{},fetchImpl:fetcher({})}),/--env dev\|prod\|all/);
});

test('facts reads only validated release, commit and native values; path entries and globs',()=>{
 assert.deepEqual(facts({release:'R144',commit:'abcdef1',native:'x y'},{field:'release',commit:'commit'}),{release:'R144',commit:'abcdef1',native:null,value:'R144'});
 assert.deepEqual(facts({code_release:'R144',code_version:'HEAD'},{field:'code_release',commit:'code_version'}),{release:'R144',commit:null,native:null,value:'R144'});
 assert.deepEqual(facts({stamp:'Reports\n\nMW release: R143'},{field:'stamp'}),{release:'R143',commit:null,native:null,value:null});
 assert.deepEqual(facts({tags:[['release:R143'],['release:R144']]},{field:'tags',tagPrefix:'release:'}).release,'mixed');
 assert.equal(facts([{uid:'a',tags:['mw-credit','release:R144']},{uid:'b',tags:['release:R144']}],{field:'tags',tagPrefix:'release:'}).release,'R144','the Grafana search API list');
 assert.equal(facts(null,{}),null);
 const match=pathMatcher(['apps/pwa','index.html','infrastructure/grafana/dashboards/*.json','docs/**/x.md']);
 assert.deepEqual(['apps/pwa/a.ts','apps/pwa2/a.ts','index.html','infrastructure/grafana/dashboards/a.json','infrastructure/grafana/dashboards/sub/a.json','docs/x.md','docs/a/b/x.md'].map(match),[true,false,true,true,false,true,true]);
});

test('operator --commit and --release values that are not a commit, HEAD or Rnnn never reach git (exit 3)',async t=>{
 const f=fixture(t),out=path.join(mkdtempSync(path.join(tmpdir(),'component-versions-out-')),'x');t.after(()=>rmSync(path.dirname(out),{recursive:true,force:true}));
 const cli=fileURLToPath(new URL('../../scripts/promotion/component-versions.mjs',import.meta.url));
 for(const args of [['derive','--release','R144','--commit','--output='+out],['check-source','--commit','--output='+out],['drift','--env','prod','--commit','-p'],['derive','--release','--output='+out]]){
  const r=spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});
  assert.equal(r.status,3,args.join(' '));assert.match(r.stderr,/must be a 7 to 40 character hex commit, HEAD or an Rnnn tag|must look like R144/);
 }
 assert.equal(existsSync(out),false);
 for(const bad of ['--output='+out,'main','HEAD~1','a'.repeat(41)]){
  assert.throws(()=>derive({git:f.git,registry:f.registry,release:'R013',commit:bad}),/--commit must be/,bad);
  assert.throws(()=>checkSource({git:f.git,registry:f.registry,root:f.root,commit:bad}),/--commit must be/,bad);
  await assert.rejects(drift({git:f.git,registry:f.registry,root:f.root,env:'prod',commit:bad,fetchImpl:fetcher({})}),/--commit must be/,bad);
 }
 assert.equal(derive({git:f.git,registry:f.registry,release:'R013',commit:'HEAD'}).commit,f.shas.head);
 assert.equal(derive({git:f.git,registry:f.registry,release:'R012',commit:'R012'}).commit,f.shas.R012);
 assert.equal(derive({git:f.git,registry:f.registry,release:'R013',commit:f.shas.head.slice(0,7)}).commit,f.shas.head);
});

test('closure window: the tracker still names the tagged release as Open; drift and check-source expect the tag',async t=>{
 const f=fixture(t);
 run(f.root,'tag','-a','R013','-m','R013'); // Release tag on HEAD before the closure pull request opens R014
 const bodies={'https://prod.example.invalid/build-version.json':{release:'R013'},'https://dev.example.invalid/build-version.json':{release:'R013'},
  'https://read-prod.example.invalid/health':{release:'R013',commit:f.shas.head},'https://read-dev.example.invalid/health':{release:'R013',commit:f.shas.head}};
 const report=await drift({git:f.git,registry:f.registry,root:f.root,env:'all',fetchImpl:fetcher(bodies)});
 assert.equal(report.latest,'R013');assert.match(report.closurePending,/Open release R013 is already tagged; R013 is the released release and work after its tag belongs to R014/);
 const row=(env,id)=>report.rows.find(r=>r.env===env&&r.id===id);
 for(const env of ['dev','prod'])for(const id of ['pwa','api-read']){assert.equal(row(env,id).expected,'R013');assert.equal(row(env,id).status,'match',env+' '+id);assert.equal(row(env,id).note,undefined);}
 assert.equal(row('dev','schema').expected,'R012','an unchanged component keeps its release in the window');
 const lines=[];assert.equal(await main(['drift','--env','dev'],{root:f.root,stdout:x=>lines.push(x),fetchImpl:fetcher(bodies)}),0);
 assert.match(lines[0],/^Info: closure pending: /);assert.match(lines[0],/\nExpected: prod = R013 tags, dev = R013 at /);
 // Work after the tag: DEV is compared with the tag (never a false match) and carries the note.
 const after=commit(f.root,'after the tag',{'services/lib/shared.mjs':'export const shared=3;\n'});
 const later={...bodies,'https://read-dev.example.invalid/health':{release:'R013',commit:after}};
 const pending=await drift({git:f.git,registry:f.registry,root:f.root,env:'dev',fetchImpl:fetcher(later)});
 const read=pending.rows.find(r=>r.id==='api-read');
 assert.deepEqual([read.expected,read.status],['R013','drift']);assert.match(read.note,/changed after R013; no Open release until the closure opens R014/);
 assert.equal(pending.rows.find(r=>r.id==='pwa').note,undefined);
 // check-source in the window: a dashboard changed after the tag carries the next number.
 assert.deepEqual(checkSource({git:f.git,registry:f.registry,root:f.root}).checked,[]);
 put(f.root,{'infrastructure/grafana/dashboards/a.json':dashboard(['mw-credit','release:R013'])});
 assert.throws(()=>checkSource({git:f.git,registry:f.registry,root:f.root}),/expected release:R014/);
 put(f.root,{'infrastructure/grafana/dashboards/a.json':dashboard(['mw-credit','release:R014'])});
 const ok=checkSource({git:f.git,registry:f.registry,root:f.root});assert.deepEqual([ok.open,ok.latest,ok.checked.length],['R014','R013',1]);assert.match(ok.closurePending,/closure pending/);
 // The fail-closed checks stay: a missing tag is still refused.
 run(f.root,'tag','-d','R011');
 await assert.rejects(drift({git:f.git,registry:f.registry,root:f.root,env:'prod',fetchImpl:fetcher(bodies)}),/missing release tag R011/);
});
