import {mkdir,readdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
import {liveConfiguration} from '../../apps/pwa/src/environment.ts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export function productionBuildEnvironment(config){
 const keys=['schemaVersion','environment','canonicalOrigin','firebase','readerOrigin','commandOrigin','reportingUrl'];if(config&&Object.hasOwn(config,'notificationsEnabled')){keys.push('notificationsEnabled');if(typeof config.notificationsEnabled!=='boolean')throw Error('Invalid notification public configuration');}
 if(!config||Object.keys(config).sort().join(',')!==keys.sort().join(',')||config.schemaVersion!==1||config.environment!=='prod'||config.canonicalOrigin!=='https://lm.mw-credit.com'||!config.firebase||Object.keys(config.firebase).sort().join(',')!=='apiKey,appId,authDomain,projectId')throw Error('Invalid production public build configuration');
 const f=config.firebase;
 if(!/^AIza[A-Za-z0-9_-]{35}$/.test(f.apiKey??'')||!/^1:737787224638:web:[a-f0-9]+$/.test(f.appId??''))throw Error('Invalid public Firebase identifiers');
 const env={MODE:'live-prod',VITE_FIREBASE_PROJECT_ID:f.projectId,VITE_FIREBASE_AUTH_DOMAIN:f.authDomain,VITE_FIREBASE_API_KEY:f.apiKey,VITE_FIREBASE_APP_ID:f.appId,VITE_API_ORIGIN:config.readerOrigin,VITE_COMMAND_API_ORIGIN:config.commandOrigin,VITE_COMMAND_MODE:'production-business',VITE_REPORTING_URL:config.reportingUrl,VITE_NOTIFICATIONS:config.notificationsEnabled?'enabled':'disabled'};
 liveConfiguration(env);return Object.freeze(env);
}
/** Local immutable candidate only. Deployment tooling must match URLs against actual target readback. */
export async function buildProductionBusinessCandidate({publicConfig,outDir}){
 const env=productionBuildEnvironment(publicConfig),directory=resolve(outDir);
 await mkdir(directory,{recursive:true});if((await readdir(directory)).length)throw Error('Candidate output must be empty');
 const {build}=await import('vite');
 // Vite synthesizes the import.meta.env object from per-key definitions. Defining
 // the whole object is overwritten by that transform and silently loses config.
 // Disable ambient prefixed variables as well as .env files: this reviewed input
 // is the only source for production public runtime configuration.
 const define=Object.fromEntries(Object.entries({...env,PROD:true,DEV:false,BASE_URL:'/'}).map(([key,value])=>['import.meta.env.'+key,JSON.stringify(value)]));
 await build({root,configFile:resolve(root,'vite.config.ts'),mode:'live-prod',envFile:false,envPrefix:[],define,build:{outDir:directory,emptyOutDir:false}});
 await writeFile(resolve(directory,'production-public-config.json'),JSON.stringify(publicConfig,null,2)+'\n');
 return {environment:'prod',mode:'live-prod',entry:'index.html',worker:'sw.js',canonicalOrigin:publicConfig.canonicalOrigin,offlineNamespace:'mw-credit-prod-owner'};
}
