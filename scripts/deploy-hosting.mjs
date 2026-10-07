import {readdir,readFile} from "node:fs/promises";
import path from "node:path";
import {gzipSync} from "node:zlib";
import {createHash} from "node:crypto";
import {GoogleAuth} from "google-auth-library";
const site="mw-credit-app-dev-737787224638";
const args=process.argv.slice(2);
if(new Set(args).size!==args.length||args.some(arg=>!["--live-dev","--check","--retire-pwa"].includes(arg))||args.includes("--retire-pwa")&&!args.includes("--live-dev"))throw new Error("Usage: node scripts/deploy-hosting.mjs [--live-dev] [--check] [--retire-pwa]");
const mode=args.includes("--live-dev")?"live-dev":"synthetic";
const retire=args.includes("--retire-pwa");
const root=path.resolve(mode==="live-dev"?"dist-live-dev":"dist");
const config=JSON.parse(await readFile("firebase.json","utf8")).hosting;
if(config.site!==site||config.public!=="dist")throw new Error("Unexpected hosting target");
const marker=JSON.parse(await readFile(path.join(root,"build-mode.json"),"utf8"));
if(marker.schemaVersion!==1||marker.mode!==mode)throw new Error("Build mode does not match explicit delivery mode");
let token;
async function request(url,method="POST",body,raw=false){
 const parsed=new URL(url);if(!["firebasehosting.googleapis.com","upload-firebasehosting.googleapis.com"].includes(parsed.hostname))throw new Error("Unexpected upload host");
 const response=await fetch(url,{method,redirect:"error",headers:{Authorization:"Bearer "+token,"x-goog-user-project":"clever-oasis-508610-n7","Content-Type":raw?"application/octet-stream":"application/json"},body:raw?body:body===undefined?undefined:JSON.stringify(body)});
 const text=await response.text();if(!response.ok)throw new Error("Hosting API failed: "+response.status+" "+text);return text?JSON.parse(text):{};
}
const api="https://firebasehosting.googleapis.com/v1beta1/";
const files={};const contents=new Map();
async function collect(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.name.startsWith("."))throw new Error("Hidden file in deployment");const full=path.join(dir,entry.name);if(entry.isDirectory())await collect(full);else if(entry.isFile()){const compressed=gzipSync(await readFile(full));const hash=createHash("sha256").update(compressed).digest("hex");files["/"+path.relative(root,full).split(path.sep).join("/")]=hash;contents.set(hash,compressed);}else throw new Error("Unsupported asset type");}}
await collect(root);if(!files["/index.html"])throw new Error("Build output missing");
const headers=[{glob:"**",headers:{"X-Content-Type-Options":"nosniff","Referrer-Policy":"strict-origin-when-cross-origin","Cache-Control":mode==="live-dev"?"no-store":"public,max-age=300"}}];
if(mode==="live-dev"){
 if(retire){
  const compressed=gzipSync(await readFile("scripts/pwa-retirement-worker.js"));
  const hash=createHash("sha256").update(compressed).digest("hex");files["/sw.js"]=hash;contents.set(hash,compressed);
 }else{
  for(const asset of ["/sw.js","/manifest.webmanifest","/offline.html","/icons/icon-192.png","/icons/icon-512.png","/icons/apple-touch-icon.png"])if(!files[asset])throw new Error("Required PWA asset missing: "+asset);
  const manifest=JSON.parse(await readFile(path.join(root,"manifest.webmanifest"),"utf8"));
  if(manifest.id!=="/"||manifest.start_url!=="/"||manifest.scope!=="/"||manifest.display!=="standalone")throw new Error("Unexpected PWA identity/scope");
  const worker=await readFile(path.join(root,"sw.js"),"utf8");
  if(!worker.trim()||/^\s*</.test(worker))throw new Error("Worker must be JavaScript, not HTML");
 }
 headers.push({glob:"/sw.js",headers:{"Content-Type":"application/javascript; charset=utf-8","Cache-Control":"no-store"}}, {glob:"/manifest.webmanifest",headers:{"Content-Type":"application/manifest+json; charset=utf-8","Cache-Control":"no-store"}}, {glob:"/offline.html",headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}});
}
if(args.includes("--check")){console.log(JSON.stringify({site,mode,retirePwa:retire,fileCount:Object.keys(files).length,headers}));process.exit(0);}
token=process.env.GOOGLE_OAUTH_ACCESS_TOKEN||await new GoogleAuth({scopes:["https://www.googleapis.com/auth/cloud-platform"]}).getAccessToken();
if(!token)throw new Error("Google authentication unavailable");
const version=await request(api+"sites/"+site+"/versions","POST",{config:{rewrites:[{glob:"**",path:"/index.html"}],headers}});
const entries=Object.entries(files);for(let i=0;i<entries.length;i+=1000){const populated=await request(api+version.name+":populateFiles","POST",{files:Object.fromEntries(entries.slice(i,i+1000))});for(const hash of populated.uploadRequiredHashes||[])await request(populated.uploadUrl+"/"+hash,"POST",contents.get(hash),true);}
const finalized=await request(api+version.name+"?updateMask=status","PATCH",{status:"FINALIZED"});if(finalized.status!=="FINALIZED")throw new Error("Version not finalized");
const release=await request(api+"sites/"+site+"/releases?versionName="+encodeURIComponent(version.name),"POST");
console.log(JSON.stringify({site,mode,retirePwa:retire,version:version.name,release:release.name,url:"https://"+site+".web.app"}));
