import {createServer} from 'node:https';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve,sep} from 'node:path';
export async function startCanonicalFixture(){
 let credentials:{key:string;cert:string};
 if(process.platform==='win32'){
  // Ephemeral test identity only; no machine/user trust-store writes.
  credentials=JSON.parse(execFileSync('pwsh',['-NoProfile','-Command',`$rsa=[System.Security.Cryptography.RSA]::Create(2048);$req=[System.Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=dev-lm.mw-credit.com',$rsa,[System.Security.Cryptography.HashAlgorithmName]::SHA256,[System.Security.Cryptography.RSASignaturePadding]::Pkcs1);$cert=$req.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-1),[DateTimeOffset]::UtcNow.AddDays(1));@{key=$rsa.ExportPkcs8PrivateKeyPem();cert=$cert.ExportCertificatePem()}|ConvertTo-Json -Compress`],{encoding:'utf8'}));
 }else{
  const dir=mkdtempSync(join(tmpdir(),'mw-pwa-tls-'));try{execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','1','-subj','/CN=dev-lm.mw-credit.com'],{stdio:'ignore'});credentials={key:readFileSync(join(dir,'key.pem'),'utf8'),cert:readFileSync(join(dir,'cert.pem'),'utf8')}}finally{rmSync(dir,{recursive:true,force:true})}
 }
 let version='A';const root=resolve('dist-live-dev');const server=createServer(credentials,(req,res)=>{const u=new URL(req.url!,'https://dev-lm.mw-credit.com');const path=resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!path.startsWith(root+sep)){res.writeHead(404);res.end();return}try{let data=readFileSync(path);if(u.pathname==='/sw.js')data=Buffer.from(data.toString().replace(/const VERSION = '[^']+'/,`const VERSION = 'fixture-${version}'`));res.writeHead(200,{'Cache-Control':'no-store','Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.png')?'image/png':path.endsWith('.webmanifest')?'application/manifest+json':'text/html'});res.end(data)}catch{res.writeHead(404);res.end()}});
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();if(!address||typeof address==='string')throw Error('missing test port');return {port:address.port,setVersion:(v:string)=>{version=v},close:()=>new Promise<void>((done,reject)=>server.close(e=>e?reject(e):done()))};
}
