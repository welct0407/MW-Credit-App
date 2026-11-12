// The generic release kind's service-role derivation (R105 onwards), shared by deploy-business-hosting.mjs and
// component-versions.mjs (R144). Node built-ins only: the Release tag workflow runs component-versions.mjs without npm ci.
import path from 'node:path';

const requireValue=(ok,message)=>{if(!ok)throw Error('App-only promotion: '+message);};
export const GENERIC_ROLES=Object.freeze(['read','command','notify','jobs','chat']);
// Each service's entry point in the image (Dockerfile copies services/; infrastructure/production/runtime.tf runs read and
// command on services/production/business-server.mjs, or services/production/server.mjs before the business runtime;
// the workers module runs notify and jobs on services/workers/server.mjs; chat-service.tf runs services/chat/server.mjs).
export const GENERIC_ROLE_ENTRIES=Object.freeze({
 read:Object.freeze(['services/production/business-server.mjs','services/production/server.mjs']),
 command:Object.freeze(['services/production/business-server.mjs','services/production/server.mjs']),
 notify:Object.freeze(['services/workers/server.mjs']),
 jobs:Object.freeze(['services/workers/server.mjs']),
 chat:Object.freeze(['services/chat/server.mjs'])});
export const GENERIC_IMAGE_INPUTS=Object.freeze(['services','Dockerfile','.dockerignore','.gcloudignore','package.json','package-lock.json','cloudbuild-command.yaml','cloudbuild-business.yaml']);
const underAny=(file,prefixes)=>prefixes.some(prefix=>file===prefix||file.startsWith(prefix+'/'));
// Relative references a module makes: static and side-effect imports, re-exports, literal dynamic imports (also JSDoc
// import() types, an over-approximation) and `new URL('./file', import.meta.url)` files read at run time.
const referencePatterns=[/\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]/g,/\bimport\s*['"](\.{1,2}\/[^'"]+)['"]/g,/\bimport\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g,/\bnew\s+URL\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g];
/** Per service, every file under services/ its entry points reach through relative references (`read` returns a file's text). */
export function genericRoleClosures(files,read){
 const closures={};
 for(const [role,entries] of Object.entries(GENERIC_ROLE_ENTRIES)){
  requireValue(entries.some(entry=>files.has(entry)),'generic role entry missing for '+role);
  const seen=new Set(),stack=entries.filter(entry=>files.has(entry));
  while(stack.length){
   const file=stack.pop();if(seen.has(file))continue;seen.add(file);
   if(!/\.(?:mjs|js|cjs)$/.test(file))continue;
   const text=read(file);
   for(const pattern of referencePatterns)for(const match of text.matchAll(pattern)){const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1]));if(files.has(target)&&!seen.has(target))stack.push(target);}
  }
  closures[role]=seen;
 }
 return closures;
}
/** The services whose image the changed files change, in canonical order. A services/ file changes the services whose
 * entry points reach it; one no entry reaches, and every other image input, changes all five. Type declarations and a
 * scripts-only package.json change none. */
export function genericChangedRoles(files,{closures,packageScriptsOnly=false}){
 const roles=new Set();
 for(const file of files){
  if((file==='package.json'&&packageScriptsOnly)||!underAny(file,GENERIC_IMAGE_INPUTS)||/^services\/.+\.d\.[cm]?ts$/.test(file))continue;
  const reached=file.startsWith('services/')?GENERIC_ROLES.filter(role=>closures[role].has(file)):[];
  for(const role of reached.length?reached:GENERIC_ROLES)roles.add(role);
 }
 return GENERIC_ROLES.filter(role=>roles.has(role));
}
