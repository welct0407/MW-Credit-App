import {application} from '../test/helpers.mjs';
import {createServer} from 'node:https';import {readFileSync} from 'node:fs';import {createInterface} from 'node:readline';
const port=Number(process.env.SYNTHETIC_BROWSER_PORT),base='https://localhost:'+port;
const app=await application({config:{baseUrl:base,issuer:base+'/oauth',resource:base+'/mcp',redirectUri:base+'/synthetic-return'},google:{begin:async(state,nonce)=>{globalThis.savedNonce=nonce;return {url:base+'/synthetic-google?state='+encodeURIComponent(state),verifier:'synthetic-only'};},complete:async(code,verifier,nonce)=>{if(code!=='synthetic-owner-code'||verifier!=='synthetic-only'||nonce!==globalThis.savedNonce)throw Error('synthetic_login_invalid');return 'owner-sub';}}});
const server=createServer({key:readFileSync(process.env.SYNTHETIC_TLS_DIR+'/key.pem'),cert:readFileSync(process.env.SYNTHETIC_TLS_DIR+'/cert.pem')},(req,res)=>{
 const url=new URL(req.url,base);
 if(url.pathname==='/synthetic-google'){res.writeHead(302,{Location:base+'/oauth/google/callback?'+new URLSearchParams({state:url.searchParams.get('state'),code:'synthetic-owner-code'})});res.end();return;}
 if(url.pathname==='/synthetic-return'){res.writeHead(200,{'Content-Type':'text/plain'});res.end('synthetic_done');return;}
 if(process.env.SYNTHETIC_HEADER_OVERRIDE==='no-referrer') {
  const write=res.writeHead.bind(res);
  res.writeHead=(status,...args)=>{if(status===200 && args[0]?.['Content-Type']==='text/html; charset=utf-8')args[0]['Referrer-Policy']='no-referrer';return write(status,...args);};
 }
 app.server.emit('request',req,res);
});
await new Promise(r=>server.listen(port,'127.0.0.1',r));console.log(JSON.stringify({port}));
try {for await(const line of createInterface({input:process.stdin})) {
 if(line==='counts') {const counts={};for(const model of ['Grant','OwnerConsent','AuthorizationCode','AccessToken','RefreshToken'])counts[model]=(await app.store.query('oauth',[['model','==',model]],100)).length;console.log(JSON.stringify({counts}));}
 if(line==='stop')break;
}}finally{server.closeAllConnections();await app.close();await new Promise(r=>server.close(r));process.stdin.destroy();}
