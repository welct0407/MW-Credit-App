export type ApplicationEnvironment='synthetic'|'dev'|'prod';
/** Shared Firebase project for DEV and PROD (accepted design, APP-AUTH-04); the one PWA source of the project literal. */
export const firebaseProjectId='clever-oasis-508610-n7';
export const firebaseIssuer='https://securetoken.google.com/'+firebaseProjectId;
export function environmentForMode(mode:string):ApplicationEnvironment {
 if(mode==='synthetic')return 'synthetic';if(mode==='live-dev')return 'dev';if(mode==='live-prod')return 'prod';throw Error('Explicit application environment required');
}
export const applicationEnvironment=environmentForMode(import.meta.env?.MODE??'synthetic');
export const liveOfflineEnabled=applicationEnvironment==='dev'||applicationEnvironment==='prod';
export const canonicalAppOrigin=applicationEnvironment==='prod'?'https://lm.mw-credit.com':'https://dev-lm.mw-credit.com';
export function commandOriginAllowed(value:string,environment:ApplicationEnvironment=applicationEnvironment){
 try{const url=new URL(value);return environment!=='synthetic'&&url.origin===value&&url.protocol==='https:'&&new RegExp('^mw-credit-app-command-'+environment+'-[a-z0-9-]+(?:\\.[a-z0-9-]+)?\\.run\\.app$').test(url.hostname);}catch{return false;}
}
export function liveConfiguration(e:Record<string,string|undefined>){
 const environment=environmentForMode(e.MODE??'');
 if(environment==='synthetic'||e.VITE_FIREBASE_PROJECT_ID!==firebaseProjectId||!e.VITE_FIREBASE_API_KEY||!e.VITE_FIREBASE_APP_ID||e.VITE_FIREBASE_AUTH_DOMAIN!==firebaseProjectId+'.firebaseapp.com'||e.VITE_FIREBASE_AUTH_TENANT_ID!==undefined)throw Error('unavailable');
 const apiOrigin=new URL(e.VITE_API_ORIGIN??'');
 if(apiOrigin.protocol!=='https:'||apiOrigin.origin!==e.VITE_API_ORIGIN||!new RegExp('^mw-credit-app-read-'+environment+'-[a-z0-9-]+(?:\\.[a-z0-9-]+)?\\.run\\.app$').test(apiOrigin.hostname))throw Error('unavailable');
 if(environment==='prod'&&(!commandOriginAllowed(e.VITE_COMMAND_API_ORIGIN??'',environment)||e.VITE_COMMAND_MODE!=='production-business'||e.VITE_COMMAND_FIXTURE_BORROWER_ID!==undefined))throw Error('unavailable');
 return{environment,apiOrigin:apiOrigin.origin,firebase:{apiKey:e.VITE_FIREBASE_API_KEY,appId:e.VITE_FIREBASE_APP_ID,projectId:e.VITE_FIREBASE_PROJECT_ID,authDomain:e.VITE_FIREBASE_AUTH_DOMAIN}};
}
export function offlineNamespace(identity:{issuer:string;uid:string},environment:ApplicationEnvironment=applicationEnvironment){
 if(!['synthetic','dev','prod'].includes(environment)||identity.issuer!==firebaseIssuer||!identity.uid||identity.uid.length>128||/[\u0000-\u001f]/.test(identity.uid))throw Error('Offline owner identity unavailable');
 return 'mw-credit-'+environment+'-owner:'+identity.issuer+':'+identity.uid;
}
