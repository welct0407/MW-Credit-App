// R144 component versioning: each component's version is the last Rnnn release that changed it plus its native counter.
// Registry: scripts/promotion/components.json (Dewey). Node built-ins only: the Release tag workflow runs this without npm ci.
//   derive --release Rnnn [--commit <sha>] [--format md|json]   stateless; walks the Rnnn tags after the registry seed
//   render --write|--check [--release Rnnn --commit <sha>]       the marked block in project/Documents/Environment_Inventory.md
//   check-source [--commit <sha>]                                 Grafana dashboards changed since the last tag carry release:<Open>
//   drift --env dev|prod|all [--observed file.json] [--json] [--strict] [--commit <sha>]   GET only; exit 1 drift, 2 unverified (--strict)
// A missing release tag between the seed and the release (a shallow clone) fails closed. Nothing here writes to a live target,
// and only validated release, commit and version strings are printed (never a response body, header, token or env value).
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {genericRoleClosures,genericChangedRoles} from './generic-roles.mjs';
import {openRelease} from '../build-live-dev.mjs';

export const REPO_ROOT=fileURLToPath(new URL('../..',import.meta.url));
export const REGISTRY_FILE='scripts/promotion/components.json';
export const INVENTORY_FILE='project/Documents/Environment_Inventory.md';
export const TRACKER_FILE='project/Documents/Release_Tracker.md';
export const START='<!-- component-versions:start -->',END='<!-- component-versions:end -->';
const RELEASE=/^R\d{3}$/,SHORT=/^[0-9a-f]{7,40}$/;
const fail=message=>{throw Error('component-versions: '+message);};
const num=release=>Number(release.slice(1));
const name=n=>'R'+String(n).padStart(3,'0');

/** git in `root`; returns stdout (Buffer when raw). Throws on a non-zero exit unless `allowFail`. */
export function gitIn(root){
 return (args,{allowFail=false,input,raw=false}={})=>{
  const r=spawnSync('git',['-C',root,...args],{input,maxBuffer:256*1024*1024,...(raw?{}:{encoding:'utf8'})});
  if(r.status!==0){if(allowFail)return null;fail('git '+args[0]+' failed'+(r.stderr?': '+String(r.stderr).trim().split('\n')[0]:''));}
  return r.stdout;
 };
}
const verifyCommit=(git,ref)=>{const out=git(['rev-parse','--verify','--quiet',ref+'^{commit}'],{allowFail:true});return out?out.trim():null;};
/** Local release tags → peeled commit. */
export function releaseTags(git){
 const tags=new Map();
 for(const line of git(['for-each-ref','--format=%(refname:short) %(objectname) %(*objectname)','refs/tags']).split('\n')){
  const [tag,object,peeled]=line.trim().split(' ');
  if(RELEASE.test(tag??''))tags.set(tag,peeled||object);
 }
 return tags;
}
export const latestTag=tags=>[...tags.keys()].sort().at(-1)??null;
const namesBetween=(git,from,to)=>git(['diff','--name-only','--no-renames','-z',from,...(to?[to]:[])]).split('\0').filter(Boolean);
const escapeRegex=s=>s.replace(/[.+^${}()|[\]\\]/g,'\\$&');
/** A path entry: a file or directory (prefix) without glob characters, else a glob (** any depth, * one segment, ? one char). */
export function pathMatcher(entries){
 const tests=(entries??[]).map(entry=>{
  if(!/[*?]/.test(entry))return file=>file===entry||file.startsWith(entry.replace(/\/$/,'')+'/');
  const source=entry.split(/(\*\*\/?|\*|\?)/).map(part=>part==='**/'?'(?:.*/)?':part==='**'?'.*':part==='*'?'[^/]*':part==='?'?'[^/]':escapeRegex(part)).join('');
  const re=new RegExp('^'+source+'$');return file=>re.test(file);
 });
 return file=>tests.some(test=>test(file));
}
export function loadRegistry(root=REPO_ROOT,file=REGISTRY_FILE){
 const registry=JSON.parse(readFileSync(path.resolve(root,file),'utf8'));
 if(registry?.schemaVersion!==1||!RELEASE.test(registry.seedAsOf??'')||!Array.isArray(registry.components))fail('registry: schemaVersion 1, seedAsOf and components required');
 const ids=new Set();
 for(const c of registry.components){
  if(typeof c?.id!=='string'||!/^[a-z0-9-]+$/.test(c.id)||ids.has(c.id))fail('registry: unique kebab-case id required');ids.add(c.id);
  if(c.derive!==undefined&&(c.derive!=='generic-role'||!['read','command','notify','jobs','chat'].includes(c.role)))fail('registry: '+c.id+' derive generic-role needs a GENERIC_ROLES role');
  if(c.derive===undefined&&!Array.isArray(c.paths))fail('registry: '+c.id+' needs paths or derive');
  if(c.seed?.release!==null&&!RELEASE.test(c.seed?.release??''))fail('registry: '+c.id+' seed.release must be Rnnn or null');
 }
 return registry;
}

/** Reads many blobs at one commit with one `git cat-file --batch`. */
function readBlobs(git,commit,files){
 const out=new Map();if(!files.length)return out;
 const buffer=git(['cat-file','--batch'],{input:files.map(file=>commit+':'+file).join('\n')+'\n',raw:true});
 let at=0;
 for(const file of files){
  const eol=buffer.indexOf(10,at),header=buffer.subarray(at,eol).toString('utf8');at=eol+1;
  const match=/^[0-9a-f]+ blob (\d+)$/.exec(header);if(!match)continue;
  const size=Number(match[1]);out.set(file,buffer.subarray(at,at+size).toString('utf8'));at+=size+1;
 }
 return out;
}
const withoutScripts=text=>{try{const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))return null;const {scripts:_scripts,...rest}=value;return JSON.stringify(rest);}catch{return null;}};
/** The generic roles whose image changes between two commits (closures at `to`), as the generic release kind derives them. */
export function changedRoles(git,from,to,changed=namesBetween(git,from,to)){
 if(!changed.length)return [];
 const tree=git(['ls-tree','-r','-z','--name-only',to,'--','services']).split('\0').filter(Boolean),files=new Set(tree);
 const blobs=readBlobs(git,to,tree.filter(file=>/\.(?:mjs|js|cjs)$/.test(file)));
 const closures=genericRoleClosures(files,file=>blobs.get(file)??'');
 const show=commit=>git(['show',commit+':package.json'],{allowFail:true});
 const packageScriptsOnly=changed.includes('package.json')&&(()=>{const a=withoutScripts(show(from)??''),b=withoutScripts(show(to)??'');return a!==null&&a===b;})();
 return genericChangedRoles(changed,{closures,packageScriptsOnly});
}
/** Whether a component changed between two commits (`changed` = the file names between them). */
export function touched(git,component,from,to,changed=namesBetween(git,from,to),roleCache){
 if(component.derive==='generic-role'){
  const roles=roleCache?.get(from+to)??changedRoles(git,from,to,changed);roleCache?.set(from+to,roles);
  return roles.includes(component.role);
 }
 const match=pathMatcher(component.paths);return changed.some(match);
}
const migrationVersion=file=>{const match=/^database\/migrations\/V([1-9][0-9]*)__[^/]+\.sql$/.exec(file);return match?Number(match[1]):null;};
const pointer=(value,ptr)=>ptr.split('/').slice(1).reduce((v,key)=>v==null?undefined:v[key.replace(/~1/g,'/').replace(/~0/g,'~')],value);
/** The component's native counter read at `commit`; null when it only exists live (then the seed's value while unchanged). */
export function nativeAt(git,component,commit,version){
 const source=component.nativeSource;
 if(component.native==='flyway'){
  const files=git(['ls-tree','-r','--name-only',commit,'--',source?.file??'database/migrations']).split('\n').filter(Boolean);
  const versions=files.map(migrationVersion).filter(v=>v!==null);return versions.length?Math.max(...versions):null;
 }
 if(source?.file&&(source.pointer||String(source.pattern??'').startsWith('^'))){
  const text=git(['show',commit+':'+source.file],{allowFail:true});if(text===null)return null;
  if(source.pointer){try{const value=pointer(JSON.parse(text),source.pointer);return value===undefined?null:value;}catch{return null;}}
  const re=new RegExp(source.pattern); // one line at a time: ^ is a line start and no match runs across lines
  for(const line of text.split(/\r?\n/)){const match=re.exec(line);if(match)return match[1]??match[0];}
  return null;
 }
 return version===component.seed?.release?(component.seed?.native??null):null;
}

/** Each component's version at `release` (tagged at, or to be tagged at, `commit`): the last release whose tag diff touched it. */
export function derive({git,registry,release,commit,walkFrom}){
 if(!RELEASE.test(release??''))fail('--release Rnnn required');
 const tags=releaseTags(git),seed=walkFrom??registry.seedAsOf;
 if(!RELEASE.test(seed))fail('seed release invalid');
 if(num(release)<num(seed))fail(release+' is before the registry seed '+seed);
 const resolved=commit?verifyCommit(git,commit):tags.get(release);
 if(!resolved)fail(commit?'unknown commit '+commit:'--commit required ('+release+' is not tagged)');
 if(tags.has(release)&&tags.get(release)!==resolved)fail(release+' is tagged at '+tags.get(release)+', not '+resolved);
 for(let n=num(seed);n<num(release);n++)if(!tags.has(name(n)))fail('missing release tag '+name(n)+' (shallow clone? run git fetch --tags); refusing to derive');
 const steps=[];for(let n=num(seed)+1;n<=num(release);n++)steps.push([name(n),n===num(release)?resolved:tags.get(name(n))]);
 const state=new Map(registry.components.map(c=>[c.id,walkFrom?null:(c.seed?.release??null)]));
 const changedIn=new Map(),roleCache=new Map();
 let previous=tags.get(seed);
 for(const [label,to] of steps){
  const changed=namesBetween(git,previous,to);
  for(const c of registry.components){
   if(c.derive!=='generic-role'&&!(c.paths??[]).length)continue;
   if(touched(git,c,previous,to,changed,roleCache)){state.set(c.id,label);changedIn.set(c.id,label);}
  }
  previous=to;
 }
 const components=registry.components.map(c=>{
  const version=state.get(c.id);
  return {id:c.id,label:c.label??c.id,kind:c.kind??null,release:version,changed:version===release&&changedIn.get(c.id)===release,
   native:walkFrom?null:nativeAt(git,c,resolved,version),nativeKind:c.native??null};
 });
 return {schemaVersion:1,release,commit:resolved,seedAsOf:seed,previousTag:steps.length?name(num(release)-1):null,components};
}

const nativeText=(kind,value)=>{
 if(value===null||value===undefined)return '–';
 if(typeof value==='object')return Object.entries(value).map(([env,v])=>env+' '+nativeText(kind,v)).join(', ');
 if(kind==='flyway')return 'V'+value;
 if(kind==='catalogue-revision')return 'revision '+value;
 return '`'+String(value)+'`';
};
export function markdown(result){
 const rows=result.components.map(c=>'| '+c.label+' | '+(c.release??'–')+(c.changed?' (changed)':'')+' | '+nativeText(c.nativeKind,c.native)+' |');
 return ['| Component | Last changed in | Native |','| --- | --- | --- |',...rows].join('\n');
}

// ---- render: the marked block of the Environment Inventory ----
const AS_OF=/As of \*\*(R\d{3})\*\* \(`([0-9a-f]{40})`\)/;
export function renderBlock(result){
 return [START,
  'Generated by `node scripts/promotion/component-versions.mjs render --write` from the release tags and `scripts/promotion/components.json`; do not edit by hand (deployment receipts stay in the rows below). As of **'+result.release+'** (`'+result.commit+'`).',
  '',markdown(result),END].join('\n');
}
function blockOf(text){
 const start=text.indexOf(START),end=text.indexOf(END);
 if(start<0||end<start||text.indexOf(START,start+1)>=0||text.indexOf(END,end+1)>=0)fail('exactly one '+START+' … '+END+' block required in the inventory');
 return {start,end:end+END.length,body:text.slice(start,end+END.length)};
}
/** --write fills the block; --check compares it. The target is --release/--commit, else the block's own untagged as-of
 *  release when it is newer than every tag (a closure render before the tag), else the latest release tag. */
export function render({git,registry,root=REPO_ROOT,file=INVENTORY_FILE,mode,release,commit}){
 const target=path.resolve(root,file),text=readFileSync(target,'utf8'),block=blockOf(text);
 if(!release){
  const tags=releaseTags(git),latest=latestTag(tags),asOf=AS_OF.exec(block.body);
  if(!latest)fail('no release tag (shallow clone? run git fetch --tags)');
  if(asOf&&num(asOf[1])>num(latest)){release=asOf[1];commit=asOf[2];}else{release=latest;commit=tags.get(latest);}
 }
 const next=renderBlock(derive({git,registry,release,commit}));
 if(mode==='check'){if(block.body!==next)fail('the component versions block in '+file+' is not the derivation for '+release+'; run render --write');return {changed:false,release};}
 if(block.body===next)return {changed:false,release};
 writeFileSync(target,text.slice(0,block.start)+next+text.slice(block.end));return {changed:true,release};
}

// ---- check-source: Grafana dashboards carry release:<Open> once changed after the last tag ----
// A Grafana v2 resource keeps its tags in spec (infrastructure/grafana/dashboards/*.json); a classic export in dashboard.
const dashboardTags=json=>{const value=JSON.parse(json);const tags=value?.spec?.tags??value?.dashboard?.tags??value?.tags;return Array.isArray(tags)?tags:[];};
export function checkSource({git,registry,root=REPO_ROOT,commit}){
 const tags=releaseTags(git),latest=latestTag(tags);
 if(!latest)fail('no release tag (shallow clone? run git fetch --tags)');
 const read=file=>commit?git(['show',commit+':'+file],{allowFail:true}):(()=>{try{return readFileSync(path.resolve(root,file),'utf8');}catch{return null;}})();
 const open=openRelease(read(TRACKER_FILE)??fail('no release tracker'));
 const stamped=registry.components.filter(c=>c.stamp?.kind==='grafana-tag'&&c.stamp.checkSource);
 const problems=[],checked=[];
 const changed=commit?namesBetween(git,tags.get(latest),verifyCommit(git,commit)??fail('unknown commit '+commit)):namesBetween(git,tags.get(latest));
 for(const c of stamped){
  const match=pathMatcher([c.stamp.files??'infrastructure/grafana/dashboards/*.json']),prefix=c.stamp.tagPrefix??'release:';
  for(const file of changed.filter(match)){
   const text=read(file);if(text===null)continue; // deleted
   let found;try{found=dashboardTags(text).filter(tag=>typeof tag==='string'&&tag.startsWith(prefix));}catch{problems.push(file+': not JSON');continue;}
   checked.push(file);
   if(found.length!==1||found[0]!==prefix+open)problems.push(file+': tags '+(found.join(', ')||'none')+', expected '+prefix+open);
  }
 }
 if(problems.length)fail('dashboards changed since '+latest+' must carry the Open release tag:\n  '+problems.join('\n  '));
 return {open,latest,checked};
}

// ---- drift: GET-only comparison of the expected versions with live facts ----
const safe=value=>typeof value==='number'&&Number.isFinite(value)?value:typeof value==='string'&&/^[A-Za-z0-9._:+@/-]{1,96}$/.test(value)?value:null;
const field=(body,key)=>key?.split('.').reduce((v,k)=>v==null?undefined:v[k],body);
/** Release, commit and native from a public body or an --observed entry, per the live descriptor's field names. */
export function facts(body,descriptor){
 if(!body||typeof body!=='object')return null;
 // A list (the Grafana search API) contributes each item's field, e.g. every dashboard's tags.
 const raw=Array.isArray(body)?body.map(item=>field(item,descriptor.field)):field(body,descriptor.field);
 let release=raw??body.release;
 if(Array.isArray(release)||descriptor.tagPrefix){
  const prefix=descriptor.tagPrefix??'release:';
  const all=[release??body.tags??[]].flat(2).filter(tag=>typeof tag==='string'&&tag.startsWith(prefix)).map(tag=>tag.slice(prefix.length));
  release=new Set(all).size===1?all[0]:all.length?'mixed':undefined;
 }
 if(typeof release==='string'&&!RELEASE.test(release))release=/MW release: (R\d{3})/.exec(release)?.[1]??(release==='mixed'?'mixed':undefined);
 const commit=field(body,descriptor.commit)??body.commit,native=field(body,descriptor.nativeField)??body.native;
 return {release:release??null,commit:typeof commit==='string'&&SHORT.test(commit)?commit:null,native:safe(native)??null,value:safe(raw)};
}
async function fetchJson(url,{fetchImpl=fetch,timeoutMs=15000}={}){
 try{
  const response=await fetchImpl(url,{method:'GET',redirect:'error',headers:{accept:'application/json'},signal:AbortSignal.timeout(timeoutMs)});
  if(response.status!==200)return null;
  const text=await response.text();if(text.length>2*1024*1024)return null; // Metabase session properties are large (about 100 KB)
  return JSON.parse(text);
 }catch{return null;}
}
const descriptorUrl=d=>typeof d?.url==='string'&&d.url?d.url+(d.path&&!d.url.endsWith(d.path)?d.path:''):null;
/** One component in one environment: match | drift | unverified | info | n/a, with a short reason. */
export function assess({git,component,descriptor,expected,fact}){
 if(!descriptor)return {status:'n/a'};
 if(component.kind==='vendor'){const value=fact?.native??fact?.value??null;return value!==null?{status:'info',observed:String(value)}:{status:'unverified',reason:'not observed'};}
 if(!expected)return {status:'unverified',reason:'no expectation'};
 if(!fact)return {status:'unverified',reason:descriptor.credentialed?'credentialed; not in --observed':'source unreadable'};
 const nativeDiffers=expected.native!=null&&typeof expected.native!=='object'&&fact.native!=null&&String(fact.native)!==String(expected.native);
 const full=fact.commit?verifyCommit(git,fact.commit):null;
 if(full&&expected.ref){
  const changed=namesBetween(git,expected.ref,full);
  const same=!touched(git,component,expected.ref,full,changed);
  return same&&!nativeDiffers?{status:'match',observed:fact.commit.slice(0,8)+(fact.release?' '+fact.release:'')}:{status:'drift',observed:fact.commit.slice(0,8)+(fact.release?' '+fact.release:''),reason:same?'native differs':'component differs from '+expected.release};
 }
 if(fact.release&&fact.release!=='dev'){
  return fact.release===expected.release&&!nativeDiffers?{status:'match',observed:fact.release}:{status:'drift',observed:fact.release,reason:nativeDiffers?'native differs':'release differs'};
 }
 if(fact.native!=null&&expected.native!=null&&typeof expected.native!=='object')return nativeDiffers?{status:'drift',observed:String(fact.native),reason:'native differs'}:{status:'match',observed:String(fact.native)};
 return {status:'unverified',reason:fact.commit?'commit '+fact.commit.slice(0,8)+' not in this clone':'no release, commit or native reported'};
}
/** The expected state per environment: PROD the latest tag, DEV the Open release at `commit` (default HEAD). */
export function expectations({git,registry,root=REPO_ROOT,commit}){
 const tags=releaseTags(git),latest=latestTag(tags);
 if(!latest)fail('no release tag (shallow clone? run git fetch --tags)');
 const head=verifyCommit(git,commit??'HEAD')??fail('unknown commit');
 const open=openRelease(git(['show',head+':'+TRACKER_FILE],{allowFail:true})??readFileSync(path.resolve(root,TRACKER_FILE),'utf8'));
 if(num(open)<=num(latest))fail('the Open release '+open+' is already tagged');
 const prod=derive({git,registry,release:latest,commit:tags.get(latest)}),dev=derive({git,registry,release:open,commit:head});
 const ref=(result,c)=>c.release===result.release?result.commit:c.release?tags.get(c.release)??null:null;
 const view=result=>new Map(result.components.map(c=>[c.id,{release:c.release,native:c.native,ref:ref(result,c)}]));
 return {open,latest,head,prod:view(prod),dev:view(dev)};
}
export async function drift({git,registry,root=REPO_ROOT,env='all',observed={},commit,fetchImpl}){
 if(!['dev','prod','all'].includes(env))fail('--env dev|prod|all');
 const expect=expectations({git,registry,root,commit}),rows=[];
 for(const envName of env==='all'?['dev','prod']:[env]){
  for(const component of registry.components){
   const descriptor=component.live?.[envName]??null;
   let body=observed?.[envName]?.[component.id]??null,source=body?'observed':null;
   if(!body&&descriptor&&!descriptor.credentialed&&descriptorUrl(descriptor)){body=await fetchJson(descriptorUrl(descriptor),{fetchImpl});source=body?'public':null;}
   const fact=descriptor?facts(body,descriptor):null;
   const expected=expect[envName].get(component.id)??null;
   const result=assess({git,component,descriptor,expected,fact});
   rows.push({env:envName,id:component.id,expected:expected?.release??null,source,...result});
  }
 }
 const count=status=>rows.filter(row=>row.status===status).length;
 return {open:expect.open,latest:expect.latest,commit:expect.head,rows,drift:count('drift'),unverified:count('unverified')};
}
export function driftText(report){
 const lines=['Expected: prod = '+report.latest+' tags, dev = '+report.open+' at '+report.commit.slice(0,8)];
 for(const row of report.rows)if(row.status!=='n/a')lines.push([row.env.padEnd(4),row.id.padEnd(20),(row.expected??'–').padEnd(5),row.status.padEnd(10),(row.observed??'–')+(row.reason?' ('+row.reason+')':'')].join(' '));
 lines.push('drift '+report.drift+', unverified '+report.unverified);
 return lines.join('\n');
}

function options(argv){
 const out={_:[]};
 for(let i=0;i<argv.length;i++){
  const arg=argv[i];
  if(['--write','--check','--json','--strict'].includes(arg))out[arg.slice(2)]=true;
  else if(arg.startsWith('--')){if(i+1>=argv.length)fail(arg+' needs a value');out[arg.slice(2)]=argv[++i];}
  else out._.push(arg);
 }
 return out;
}
export async function main(argv,{root=REPO_ROOT,stdout=console.log,fetchImpl}={}){
 const o=options(argv),command=o._[0],git=gitIn(root),registry=loadRegistry(root,o.registry??REGISTRY_FILE);
 if(command==='derive'){
  const result=derive({git,registry,release:o.release,commit:o.commit,walkFrom:o['walk-from']});
  if(!['md','json',undefined].includes(o.format))fail('--format md|json');
  stdout(o.format==='json'?JSON.stringify(result,null,2):markdown(result));return 0;
 }
 if(command==='render'){
  if(Boolean(o.write)===Boolean(o.check))fail('render needs --write or --check');
  if(Boolean(o.release)!==Boolean(o.commit))fail('render takes --release and --commit together');
  const result=render({git,registry,root,file:o.file??INVENTORY_FILE,mode:o.write?'write':'check',release:o.release,commit:o.commit});
  stdout(o.check?'render --check: ok ('+result.release+')':result.changed?'render --write: updated ('+result.release+')':'render --write: unchanged ('+result.release+')');return 0;
 }
 if(command==='check-source'){const result=checkSource({git,registry,root,commit:o.commit});stdout('check-source: ok (Open '+result.open+', since '+result.latest+': '+result.checked.length+' dashboard file(s) checked)');return 0;}
 if(command==='drift'){
  const observed=o.observed?JSON.parse(readFileSync(path.resolve(o.observed),'utf8')):{};
  const report=await drift({git,registry,root,env:o.env??'all',observed,commit:o.commit,fetchImpl});
  stdout(o.json?JSON.stringify(report,null,2):driftText(report));
  return report.drift?1:o.strict&&report.unverified?2:0;
 }
 fail('usage: derive | render | check-source | drift (see the header of scripts/promotion/component-versions.mjs)');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.exitCode=await main(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=3;}
}
