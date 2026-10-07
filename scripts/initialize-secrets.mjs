import {createECDH} from "node:crypto";
import {spawnSync} from "node:child_process";
const gcloud=process.env.GCLOUD_EXECUTABLE||"C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd";
function run(args,input){const r=spawnSync(process.platform==="win32"?process.env.CLOUDSDK_PYTHON:gcloud,process.platform==="win32"?["C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/lib/gcloud.py",...args]:args,{input,encoding:"utf8",windowsHide:true});if(r.status!==0)throw new Error("Secret Manager operation failed: "+r.stderr);return r.stdout;}
const existing=run(["secrets","versions","list","mw-credit-app-dev-vapid","--project=clever-oasis-508610-n7","--format=value(name)"]);
if(existing.trim()){console.log("Existing VAPID secret retained; no rotation performed.");}else{const pair=createECDH("prime256v1");pair.generateKeys();const payload=JSON.stringify({publicKey:pair.getPublicKey().toString("base64url"),privateKey:pair.getPrivateKey().toString("base64url")});run(["secrets","versions","add","mw-credit-app-dev-vapid","--project=clever-oasis-508610-n7","--data-file=-"],payload);console.log("VAPID secret initialized directly in Secret Manager.");}
