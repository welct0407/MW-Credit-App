import {open} from '../dist/events.js';
import {application} from '../test/helpers.mjs';
import {createServer} from 'node:https';import {readFileSync} from 'node:fs';import {createInterface} from 'node:readline';
const port=Number(process.env.SYNTHETIC_BROWSER_PORT),base='https://localhost:'+port;
const callback='https://127.0.0.1:'+port+'/synthetic-return';
const app=await application({config:{baseUrl:base,issuer:base+'/oauth',resource:base+'/mcp',redirectUri:callback},google:{begin:async(state,nonce)=>{globalThis.savedNonce=nonce;return {url:base+'/synthetic-google?state='+encodeURIComponent(state),verifier:'synthetic-only'};},complete:async(code,verifier,nonce)=>{if(code!=='synthetic-owner-code'||verifier!=='synthetic-only'||nonce!==globalThis.savedNonce)throw Error('synthetic_login_invalid');return 'owner-sub';}}});
const server=createServer({key:readFileSync(process.env.SYNTHETIC_TLS_DIR+'/key.pem'),cert:readFileSync(process.env.SYNTHETIC_TLS_DIR+'/cert.pem')},(req,res)=>{
 const url=new URL(req.url,base);
 if(url.pathname==='/synthetic-google'){res.writeHead(302,{Location:base+'/oauth/google/callback?'+new URLSearchParams({state:url.searchParams.get('state'),code:'synthetic-owner-code'})});res.end();return;}
 if(url.pathname==='/synthetic-return'){res.writeHead(200,{'Content-Type':'text/plain'});res.end('synthetic_done');return;}
 if(['no-referrer','legacy-self'].includes(process.env.SYNTHETIC_HEADER_OVERRIDE)) {
  const write=res.writeHead.bind(res);
  res.writeHead=(status,...args)=>{if(status===200 && args[0]?.['Content-Type']==='text/html; charset=utf-8') {if(process.env.SYNTHETIC_HEADER_OVERRIDE==='no-referrer')args[0]['Referrer-Policy']='no-referrer';else args[0]['Content-Security-Policy']=args[0]['Content-Security-Policy'].replace(' '+callback,'');}return write(status,...args);};
 }
 app.server.emit('request',req,res);
});
await new Promise(r=>server.listen(port,'127.0.0.1',r));console.log(JSON.stringify({port}));
try {for await(const line of createInterface({input:process.stdin})) {
 if(line==='counts') {
  const counts={},payloads={};for(const model of ['Grant','OwnerConsent','AuthorizationCode','AccessToken','RefreshToken']) {const rows=await app.store.query('oauth',[['model','==',model]],100);counts[model]=rows.length;payloads[model]=rows.map(row=>JSON.parse(open(row.encrypted,app.conf.stateKey)));}
  const refresh=payloads.RefreshToken[0],grant=payloads.Grant[0],consent=payloads.OwnerConsent[0];
  const token_metadata={refresh_expires_with_session:refresh?!!refresh.expiresWithSession:null,durable_consent_lifetime_seconds:consent?consent.expiresAt-consent.approvedAt:null,grant_deadline_matches_consent:consent?grant?.exp===consent.expiresAt:null,refresh_within_grant_deadline:refresh?refresh.exp<=grant?.exp:null};
  console.log(JSON.stringify({counts,token_metadata}));
 }
 if(line==='stop')break;
}}finally{server.closeAllConnections();await app.close();await new Promise(r=>server.close(r));process.stdin.destroy();}
