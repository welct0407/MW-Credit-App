// Frontend-only owner-authorized R054 promotion; existing SQL/CI release guards are unchanged.
import {readFile,readdir,lstat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const site='mw-credit-prod-737787224638';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function uiHostingPlan(manifest,{artifactRoot,sourceRoot}){
 if(manifest.release!=='R054'||manifest.scope!=='frontend-only'||manifest.site!==site||manifest.sourceCommit!=='c07ada0e2cf6b73c46c47a049f1aa8976a53cc75'||!manifest.approvalReference?.trim()||manifest.ciRequired!==false)throw Error('Exact authorized R054 UI package required');
 if(!manifest.rollback?.version?.startsWith('sites/'+site+'/versions/')||!manifest.rollback?.release?.startsWith('sites/'+site+'/releases/'))throw Error('Exact PROD rollback required');
 const cfg=JSON.parse(await readFile(path.join(artifactRoot,'production-public-config.json'),'utf8'));
 if(cfg.environment!=='prod'||cfg.canonicalOrigin!=='https://lm.mw-credit.com'||cfg.readerOrigin!=='https://mw-credit-app-read-prod-pvrgvyg3oq-as.a.run.app'||cfg.commandOrigin!=='https://mw-credit-app-command-prod-pvrgvyg3oq-as.a.run.app'||cfg.notificationsEnabled!==true)throw Error('Wrong production bindings');
 if(sha(Buffer.from(JSON.stringify(cfg)))!==manifest.publicConfigSha256)throw Error('Changed public configuration');
 for(const [file,pin]of Object.entries(manifest.sourceFiles??{})){
  if(file.includes('..')||path.isAbsolute(file)||!/^[a-f0-9]{64}$/.test(pin)||sha(await readFile(path.join(sourceRoot,file)))!==pin)throw Error('Changed source');
 }
 for(const required of ['vite.config.ts','apps/pwa/src/live-main.tsx','apps/pwa/src/Notifications.tsx','apps/pwa/src/Dashboard.tsx','apps/pwa/src/assets/loan-manager-logo-prod-pink.png'])if(!manifest.sourceFiles?.[required])throw Error('Required source pin missing');
 const actual=[];async function scan(dir){for(const e of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,e.name);if((await lstat(full)).isSymbolicLink())throw Error('Artifact link refused');if(e.isDirectory())await scan(full);else if(e.isFile())actual.push(path.relative(artifactRoot,full).replaceAll('\\','/'));else throw Error('Unsupported artifact');}}await scan(artifactRoot);
 const contents=new Map(),files={};
 if(actual.sort().join('|')!==manifest.files.map(f=>f.path).sort().join('|'))throw Error('Unpinned or missing artifact');
 for(const f of manifest.files){if(f.path.includes('..')||path.isAbsolute(f.path)||files['/'+f.path])throw Error('Invalid artifact path');const b=await readFile(path.join(artifactRoot,f.path));if(sha(b)!==f.sha256)throw Error('Artifact drift');const z=gzipSync(b),h=sha(z);files['/'+f.path]=h;contents.set(h,z);}
 const marker=JSON.parse(await readFile(path.join(artifactRoot,'build-version.json'),'utf8'));
 const html=await readFile(path.join(artifactRoot,'index.html'),'utf8'),worker=await readFile(path.join(artifactRoot,'sw.js'),'utf8');
 if(marker.version!==manifest.publicVersion||!/^[a-f0-9]{24}$/.test(marker.version)||!/^\/assets\/[^/]+\.js$/.test(marker.entry)||!files[marker.entry]||!html.includes('src="'+marker.entry+'"')||!worker.includes("const VERSION = '"+marker.version+"'")||!worker.includes("const PREFIX = 'mw-credit-prod-public-'")||!worker.includes(JSON.stringify(marker.entry)))throw Error('Entry/worker binding mismatch');
 for(const name of ['index.html','build-version.json','build-mode.json','sw.js','manifest.webmanifest','offline.html','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png','production-public-config.json'])if(!files['/'+name])throw Error('Required artifact missing');
 if(JSON.parse(await readFile(path.join(artifactRoot,'build-mode.json'),'utf8')).mode!=='live-prod')throw Error('Wrong build mode');
 const pwa=JSON.parse(await readFile(path.join(artifactRoot,'manifest.webmanifest'),'utf8'));if(pwa.name!=='MW Credit'||pwa.id!=='/'||pwa.scope!=='/'||pwa.start_url!=='/')throw Error('Wrong PROD PWA identity');
 for(const icon of ['icon-192.png','icon-512.png','apple-touch-icon.png'])if(sha(await readFile(path.join(artifactRoot,'icons',icon)))!==sha(await readFile(path.join(sourceRoot,'apps/pwa/pwa/icons-prod',icon))))throw Error('Wrong production icon');
 const headers=[{glob:'**',headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'}}];
 for(const [glob,type]of [['/build-version.json','application/json; charset=utf-8'],['/sw.js','application/javascript; charset=utf-8'],['/manifest.webmanifest','application/manifest+json; charset=utf-8']])headers.push({glob,headers:{'Content-Type':type,'Cache-Control':'no-store'}});
 return {site,sourceCommit:manifest.sourceCommit,publicVersion:marker.version,files,contents,headers};
}
