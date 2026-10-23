// Firebase Hosting response headers for the DEV and PROD sites (APP-SEC-01, APP-PERF-01).
// DEV applies them with scripts/deploy-hosting.mjs; PROD takes them at its next promotion
// through scripts/promotion/deploy-business-hosting.mjs. firebase.json mirrors the DEV rules.
const ORIGINS=Object.freeze({
 'live-dev':['https://mw-credit-app-read-dev-pvrgvyg3oq-as.a.run.app','https://mw-credit-app-command-dev-pvrgvyg3oq-as.a.run.app','https://mw-credit-app-chat-dev-pvrgvyg3oq-as.a.run.app'],
 'live-prod':['https://mw-credit-app-read-prod-pvrgvyg3oq-as.a.run.app','https://mw-credit-app-command-prod-pvrgvyg3oq-as.a.run.app','https://mw-credit-app-chat-prod-pvrgvyg3oq-as.a.run.app'],
});
/** Content-Security-Policy: Firebase popup sign-in (gapi + auth iframe), Firebase Auth REST and the three API origins (reader, command, R090 chat). */
export function contentSecurityPolicy(mode){
 const api=ORIGINS[mode==='synthetic'?'live-dev':mode];
 if(!api)throw Error('Unknown hosting mode');
 return ["default-src 'self'","base-uri 'none'","object-src 'none'","frame-ancestors 'none'","form-action 'self'",
  "script-src 'self' https://apis.google.com","style-src 'self' 'unsafe-inline'","img-src 'self' data: blob:",
  `connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com ${api.join(' ')}`,
  'frame-src https://clever-oasis-508610-n7.firebaseapp.com https://accounts.google.com',"worker-src 'self'","manifest-src 'self'"].join('; ');
}
/** Complete Hosting header rules for 'synthetic' (DEV site), 'live-dev' or 'live-prod'. Later rules win for the same key. */
export function hostingHeaders(mode){
 const live=mode==='live-dev'||mode==='live-prod';
 if(!live&&mode!=='synthetic')throw Error('Unknown hosting mode');
 const rules=[{glob:'**',headers:{'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':live?'no-store':'public,max-age=300','Content-Security-Policy':contentSecurityPolicy(mode),'X-Frame-Options':'DENY'}}];
 if(!live)return rules;
 // Vite emits content-hashed file names under /assets; the worker fetches them with cache:'no-store'.
 rules.push({glob:'/assets/**',headers:{'Cache-Control':'public,max-age=31536000,immutable'}});
 for(const [glob,type] of [['/build-version.json','application/json; charset=utf-8'],['/sw.js','application/javascript; charset=utf-8'],['/manifest.webmanifest','application/manifest+json; charset=utf-8'],['/offline.html','text/html; charset=utf-8']])rules.push({glob,headers:{'Content-Type':type,'Cache-Control':'no-store'}});
 return rules;
}
