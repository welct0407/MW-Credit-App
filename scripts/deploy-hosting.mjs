import {readdir,readFile} from "node:fs/promises";
import path from "node:path";
import {gzipSync} from "node:zlib";
import {createHash} from "node:crypto";
import {GoogleAuth} from "google-auth-library";
const site="mw-credit-app-dev-737787224638";
const root=path.resolve("dist");
const config=JSON.parse(await readFile("firebase.json","utf8")).hosting;
if(config.site!==site||config.public!=="dist")throw new Error("Unexpected hosting target");
const token=process.env.GOOGLE_OAUTH_ACCESS_TOKEN||await new GoogleAuth({scopes:["https://www.googleapis.com/auth/cloud-platform"]}).getAccessToken();
if(!token)throw new Error("Google authentication unavailable");
async function request(url,method="POST",body,raw=false){
 const parsed=new URL(url);if(!["firebasehosting.googleapis.com","upload-firebasehosting.googleapis.com"].includes(parsed.hostname))throw new Error("Unexpected upload host");
 const response=await fetch(url,{method,redirect:"error",headers:{Authorization:"Bearer "+token,"x-goog-user-project":"clever-oasis-508610-n7","Content-Type":raw?"application/octet-stream":"application/json"},body:raw?body:body===undefined?undefined:JSON.stringify(body)});
 const text=await response.text();if(!response.ok)throw new Error("Hosting API failed: "+response.status+" "+text);return text?JSON.parse(text):{};
}
const api="https://firebasehosting.googleapis.com/v1beta1/";
const files={};const contents=new Map();
async function collect(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.name.startsWith("."))throw new Error("Hidden file in deployment");const full=path.join(dir,entry.name);if(entry.isDirectory())await collect(full);else if(entry.isFile()){const compressed=gzipSync(await readFile(full));const hash=createHash("sha256").update(compressed).digest("hex");files["/"+path.relative(root,full).split(path.sep).join("/")]=hash;contents.set(hash,compressed);}else throw new Error("Unsupported asset type");}}
await collect(root);if(!files["/index.html"])throw new Error("Build output missing");
const version=await request(api+"sites/"+site+"/versions","POST",{config:{rewrites:[{glob:"**",path:"/index.html"}],headers:[{glob:"**",headers:{"X-Content-Type-Options":"nosniff","Referrer-Policy":"strict-origin-when-cross-origin","Cache-Control":"public,max-age=300"}}]}});
const entries=Object.entries(files);for(let i=0;i<entries.length;i+=1000){const populated=await request(api+version.name+":populateFiles","POST",{files:Object.fromEntries(entries.slice(i,i+1000))});for(const hash of populated.uploadRequiredHashes||[])await request(populated.uploadUrl+"/"+hash,"POST",contents.get(hash),true);}
const finalized=await request(api+version.name+"?updateMask=status","PATCH",{status:"FINALIZED"});if(finalized.status!=="FINALIZED")throw new Error("Version not finalized");
const release=await request(api+"sites/"+site+"/releases?versionName="+encodeURIComponent(version.name),"POST");
console.log(JSON.stringify({site,version:version.name,release:release.name,url:"https://"+site+".web.app"}));
