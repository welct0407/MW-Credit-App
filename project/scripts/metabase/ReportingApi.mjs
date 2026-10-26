import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const output=path.join(root,'outputs/r016-20260922');
export const privateDir='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r016-20260922';
export const read=name=>JSON.parse(fs.readFileSync(path.join(output,name),'utf8').replace(/^\uFEFF/,''));
export const write=(name,value)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n');
const diagnosticsDir=process.env.MW_METABASE_PRIVATE_DIR||privateDir;
let cachedKey;
// Administrator API key 3 ("Report development"), regenerated 26 October 2026. Canonical copy: Secret Manager
// mw-metabase-admin-api-key. Resolution order: METABASE_ADMIN_API_KEY, Secret Manager via gcloud, legacy VM-01 file.
export function apiKey(){
 if(cachedKey)return cachedKey;
 const fromEnv=(process.env.METABASE_ADMIN_API_KEY||'').trim();
 if(fromEnv)return cachedKey=fromEnv;
 const secret=spawnSync('gcloud',['secrets','versions','access','latest','--secret=mw-metabase-admin-api-key'],{encoding:'utf8'});
 if(secret.status===0&&secret.stdout.trim())return cachedKey=secret.stdout.trim();
 const legacy='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/metabase-poc/migration-api-key.txt';
 if(fs.existsSync(legacy))return cachedKey=fs.readFileSync(legacy,'utf8').trim();
 throw Error('No Metabase administrator API key: set METABASE_ADMIN_API_KEY or allow gcloud access to mw-metabase-admin-api-key');
}
export async function api(method,route,body){
 const key=apiKey();
 const response=await fetch('https://reports.mw-credit.com/api/'+route,{method,headers:{'X-API-Key':key,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
 const text=await response.text();
 if(!response.ok){fs.mkdirSync(diagnosticsDir,{recursive:true});fs.writeFileSync(path.join(diagnosticsDir,'last-api-error.txt'),text);throw Error(`${method} ${route}: HTTP ${response.status}; diagnostic saved privately`);}
 return JSON.parse(text);
}
export async function assertSource(){const s=await api('GET','database/2');if(s.details.dbname!=='loan_manager_prod'||s.details.user!=='metabase_borrower_reader'||s.details.host!=='127.0.0.1')throw Error('Unexpected reporting source');}
