import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const output=path.join(root,'outputs/r016-20260922');
export const privateDir='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r016-20260922';
export const read=name=>JSON.parse(fs.readFileSync(path.join(output,name),'utf8').replace(/^\uFEFF/,''));
export const write=(name,value)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n');
export async function api(method,route,body){
 const key=fs.readFileSync('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/metabase-poc/migration-api-key.txt','utf8').trim();
 const response=await fetch('https://reports.mw-credit.com/api/'+route,{method,headers:{'X-API-Key':key,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
 const text=await response.text();
 if(!response.ok){fs.writeFileSync(path.join(privateDir,'last-api-error.txt'),text);throw Error(`${method} ${route}: HTTP ${response.status}; diagnostic saved privately`);}
 return JSON.parse(text);
}
export async function assertSource(){const s=await api('GET','database/2');if(s.details.dbname!=='loan_manager_prod'||s.details.user!=='metabase_borrower_reader'||s.details.host!=='127.0.0.1')throw Error('Unexpected reporting source');}
