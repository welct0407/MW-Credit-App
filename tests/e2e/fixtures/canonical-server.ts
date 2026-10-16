import {createServer} from 'node:https';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve,sep} from 'node:path';
export async function startCanonicalFixture(buildRoot='dist-live-dev'){
 let credentials:{key:string;cert:string};
 if(process.platform==='win32'){
  // Ephemeral test identity only; no machine/user trust-store writes.
  credentials=JSON.parse(execFileSync('pwsh',['-NoProfile','-Command',`$rsa=[System.Security.Cryptography.RSA]::Create(2048);$req=[System.Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=dev-lm.mw-credit.com',$rsa,[System.Security.Cryptography.HashAlgorithmName]::SHA256,[System.Security.Cryptography.RSASignaturePadding]::Pkcs1);$cert=$req.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-1),[DateTimeOffset]::UtcNow.AddDays(1));@{key=$rsa.ExportPkcs8PrivateKeyPem();cert=$cert.ExportCertificatePem()}|ConvertTo-Json -Compress`],{encoding:'utf8'}));
 }else{
  const dir=mkdtempSync(join(tmpdir(),'mw-pwa-tls-'));try{execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','1','-subj','/CN=dev-lm.mw-credit.com'],{stdio:'ignore'});credentials={key:readFileSync(join(dir,'key.pem'),'utf8'),cert:readFileSync(join(dir,'cert.pem'),'utf8')}}finally{rmSync(dir,{recursive:true,force:true})}
 }
 const requests:{path:string;status:number}[]=[];let version:string|null=null,root=resolve(buildRoot);const held=new Map<string,Set<()=>void>>(),failures=new Map<string,number>();
 const release=(path:string)=>{const callbacks=held.get(path);held.delete(path);callbacks?.forEach(done=>done())};
 const server=createServer(credentials,async(req,res)=>{const u=new URL(req.url!,'https://dev-lm.mw-credit.com');res.on('finish',()=>requests.push({path:u.pathname,status:res.statusCode}));if(held.has(u.pathname))await new Promise<void>(done=>held.get(u.pathname)!.add(done));if(failures.has(u.pathname)){res.writeHead(failures.get(u.pathname)!);res.end();return}const path=resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!path.startsWith(root+sep)){res.writeHead(404);res.end();return}try{let data=readFileSync(path);if(version&&u.pathname==='/sw.js')data=Buffer.from(data.toString().replace(/const VERSION = '[^']+'/,`const VERSION = '${version}'`));if(version&&u.pathname==='/build-version.json')data=Buffer.from(JSON.stringify({...JSON.parse(data.toString()),version}));res.writeHead(200,{'Cache-Control':'no-store','Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.png')?'image/png':path.endsWith('.json')?'application/json':path.endsWith('.webmanifest')?'application/manifest+json':'text/html'});res.end(data)}catch{res.writeHead(404);res.end()}});
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();if(!address||typeof address==='string')throw Error('missing test port');return {requests,port:address.port,setVersion:(v:string)=>{version=createHash('sha256').update('fixture_'+v).digest('hex').slice(0,24)},setBuildRoot:(next:string)=>{root=resolve(next);version=null},hold:(path:string)=>held.set(path,new Set()),heldCount:(path:string)=>held.get(path)?.size??0,release,fail:(path:string,status:number|null)=>status===null?failures.delete(path):failures.set(path,status),close:()=>{for(const path of held.keys())release(path);return new Promise<void>((done,reject)=>server.close(e=>e?reject(e):done()))}};
}
/**
 * APP-TEST-01: Chromium launch arguments that send the canonical hosts to this fixture.
 * `--no-proxy-server` is not enough where the container injects a proxy (Chromium tunnels the mapped host through it and
 * fails with ERR_TUNNEL_CONNECTION_FAILED); an explicit direct proxy wins over the inherited one.
 */
export function fixtureLaunchArgs(port:number,extraHosts:string[]=[],host='dev-lm.mw-credit.com'){
 return ['--ignore-certificate-errors','--host-resolver-rules='+[host,...extraHosts].map(name=>`MAP ${name} 127.0.0.1:${port}`).join(','),'--proxy-server=direct://'];
}
/** Call after the first navigation: fails clearly when the browser reached something other than the fixture. */
export function assertServed(fixture:{requests:unknown[]},host='dev-lm.mw-credit.com'){
 if(fixture.requests.length===0)throw Error(`canonical fixture served nothing: this environment routes ${host} elsewhere`);
}
