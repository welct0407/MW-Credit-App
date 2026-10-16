// Bounded read-only proof of one operator-approved current Payment projection.
import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {privatePath} from './reconcile-native.mjs';
import {productionAgentReceiptPath,createProductionAgentReceiptReader} from '../../services/receipts/production-agent-receipts.mjs';
import {decodeSourceReceipt} from '../../services/receipts/decode-image.mjs';
const run=promisify(execFile),sha=v=>createHash('sha256').update(v).digest('hex');
async function main(){
 const args=process.argv.slice(2);if(args.length!==6||args[0]!=='--snapshot'||args[2]!=='--private-dir'||args[4]!=='--evidence')throw Error();
 const snapshotPath=await privatePath(path.resolve(args[1])),dir=await privatePath(path.resolve(args[3]));
 const snapshot=JSON.parse(await readFile(snapshotPath,'utf8'));if(snapshot.database!=='loan_manager_prod'||snapshot.host!=='136.85.127.134'||snapshot.readOnly!==true||snapshot.rows?.length!==1)throw Error();
 const row=snapshot.rows[0],locator=productionAgentReceiptPath(row.reference,row),url='gs://'+locator.bucket+'/'+locator.key;
 const sdk='C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk';
 const execute=async parameters=>(await run(process.platform==='win32'?path.join(sdk,'platform/bundledpython/python.exe'):'gcloud',process.platform==='win32'?[path.join(sdk,'lib/gcloud.py'),...parameters]:parameters,{timeout:30000,maxBuffer:1048576,windowsHide:true})).stdout;
 const raw=await execute(['storage','objects','describe',url,'--format=json']);const observed=JSON.parse(raw),meta={...observed,contentType:observed.content_type};
 await writeFile(path.join(dir,'agent-object-metadata.json'),raw,{flag:'wx'});
 if(meta.bucket!==locator.bucket||meta.name!==locator.key)throw Error();
 const media=await privatePath(path.join(dir,'agent-generation.bin'),{output:true});
 await execute(['storage','cp',url+'#'+meta.generation,media,'--quiet']);
 const reader=createProductionAgentReceiptReader({decodeImage:decodeSourceReceipt,storage:{bucket:bucket=>{if(bucket!==locator.bucket)throw Error();return{file:(key,options)=>{if(key!==locator.key||options&&options.generation!==meta.generation)throw Error();return{getMetadata:async()=>[meta],download:async()=>[await readFile(media)]};}};}}});
 const result=await reader(row.reference,row);
 await writeFile(path.resolve(args[5]),JSON.stringify({schemaVersion:1,environment:'prod',status:'actual-projected-agent-receipt-verified',observedAt:new Date().toISOString(),referenceSha256:sha(row.reference),keySha256:sha(locator.key),generation:meta.generation,sizeBytes:result.bytes.length,mimeType:result.mimeType,sha256:sha(result.bytes),snapshotSha256:sha(await readFile(snapshotPath)),effects:'One SQL projection and exact-generation storage read only; no grants, writes or deployment.'},null,2)+'\n',{flag:'wx'});
 process.stdout.write('One actual projected PROD agent receipt passed generation, SHA256, MIME, size and decoder checks.\n');
}
main().catch(()=>{process.stderr.write('Bounded agent receipt proof failed; inspect private retained evidence.\n');process.exitCode=1;});
