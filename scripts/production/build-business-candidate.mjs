import {mkdir,readdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
import {liveConfiguration} from '../../apps/pwa/src/environment.ts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export function productionBuildEnvironment(config){
 const keys=['schemaVersion','environment','canonicalOrigin','firebase','readerOrigin','commandOrigin'];if(config&&Object.hasOwn(config,'reportingUrl'))keys.push('reportingUrl');
 // R090: optional chat origin; absent keeps the Chat menu hidden and older manifests valid.
 if(config&&Object.hasOwn(config,'chatOrigin')){keys.push('chatOrigin');if(!chatOriginAllowed(config.chatOrigin))throw Error('Invalid chat public configuration');}if(config&&Object.hasOwn(config,'notificationsEnabled')){keys.push('notificationsEnabled');if(typeof config.notificationsEnabled!=='boolean')throw Error('Invalid notification public configuration');}
 if(!config||Object.keys(config).sort().join(',')!==keys.sort().join(',')||config.schemaVersion!==1||config.environment!=='prod'||config.canonicalOrigin!=='https://lm.mw-credit.com'||!config.firebase||Object.keys(config.firebase).sort().join(',')!=='apiKey,appId,authDomain,projectId')throw Error('Invalid production public build configuration');
 // Accept the pinned historical field for rollback manifests; never emit it into new builds.
 if(Object.hasOwn(config,'reportingUrl')&&config.reportingUrl!=='https://www.appsheet.com/start/e74dd368-654f-44d7-bccf-83cf361d1cdb')throw Error('Invalid legacy reporting configuration');
 const f=config.firebase;
 if(!/^AIza[A-Za-z0-9_-]{35}$/.test(f.apiKey??'')||!/^1:737787224638:web:[a-f0-9]+$/.test(f.appId??''))throw Error('Invalid public Firebase identifiers');
 const env={MODE:'live-prod',VITE_FIREBASE_PROJECT_ID:f.projectId,VITE_FIREBASE_AUTH_DOMAIN:f.authDomain,VITE_FIREBASE_API_KEY:f.apiKey,VITE_FIREBASE_APP_ID:f.appId,VITE_API_ORIGIN:config.readerOrigin,VITE_COMMAND_API_ORIGIN:config.commandOrigin,VITE_COMMAND_MODE:'production-business',VITE_NOTIFICATIONS:config.notificationsEnabled?'enabled':'disabled',...(Object.hasOwn(config,'chatOrigin')?{VITE_CHAT_API_ORIGIN:config.chatOrigin}:{})};
 liveConfiguration(env);return Object.freeze(env);
}
/** Exact https origin of the PROD chat service (mw-credit-app-chat-prod on run.app). */
function chatOriginAllowed(value){try{const url=new URL(value);return url.origin===value&&url.protocol==='https:'&&/^mw-credit-app-chat-prod-[a-z0-9-]+(?:\.[a-z0-9-]+)?\.run\.app$/.test(url.hostname);}catch{return false;}}
/** Local immutable candidate only. Deployment tooling must match URLs against actual target readback. */
export async function buildProductionBusinessCandidate({publicConfig,outDir,releaseNumber}){
 // R075: the release number is part of the reviewed input; vite.config.ts reads it from MW_RELEASE_NUMBER.
 if(typeof releaseNumber!=='string'||!/^R\d{3}$/.test(releaseNumber))throw Error('Release number like R075 required');
 const env=productionBuildEnvironment(publicConfig),directory=resolve(outDir);
 await mkdir(directory,{recursive:true});if((await readdir(directory)).length)throw Error('Candidate output must be empty');
 const {build}=await import('vite');
 // Vite synthesizes the import.meta.env object from per-key definitions. Defining
 // the whole object is overwritten by that transform and silently loses config.
 // Disable ambient prefixed variables as well as .env files: this reviewed input
 // is the only source for production public runtime configuration.
 const define=Object.fromEntries(Object.entries({...env,PROD:true,DEV:false,BASE_URL:'/'}).map(([key,value])=>['import.meta.env.'+key,JSON.stringify(value)]));
 const prior=process.env.MW_RELEASE_NUMBER;process.env.MW_RELEASE_NUMBER=releaseNumber;
 try{await build({root,configFile:resolve(root,'vite.config.ts'),mode:'live-prod',envFile:false,envPrefix:[],define,build:{outDir:directory,emptyOutDir:false}});}
 finally{if(prior===undefined)delete process.env.MW_RELEASE_NUMBER;else process.env.MW_RELEASE_NUMBER=prior;}
 const {reportingUrl:legacyReportingUrl,...emittedPublicConfig}=publicConfig;
 await writeFile(resolve(directory,'production-public-config.json'),JSON.stringify(emittedPublicConfig,null,2)+'\n');
 return {environment:'prod',mode:'live-prod',entry:'index.html',worker:'sw.js',canonicalOrigin:publicConfig.canonicalOrigin,offlineNamespace:'mw-credit-prod-owner',release:releaseNumber};
}
