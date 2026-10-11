import {createHash} from 'node:crypto';
import {readFile,writeFile,realpath,stat} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseNativeDevCatalog,NATIVE_DEV_ROOT} from '../../services/receipts/native-catalog.mjs';
import {DEV_RECEIPT_MAPPING} from '../../services/receipts/dev-receipt-adapter.mjs';
import {DEV_INSTANCE} from '../../services/api/dev-read-config.mjs';
import {decodeSourceReceipt} from '../../services/receipts/decode-image.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const validTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const invalid=()=>{throw Error('Native receipt reconciliation rejected');};
const DEV_APP='500b27b6-884a-41e8-a9ec-df801b0110ad';
/** Captures are operator-authenticated evidence, not authentication established by this offline verifier. */
export async function reconcileCapturedNative(input,{readMedia,decodeImage=decodeSourceReceipt}={}){
  try {
    if(input?.schemaVersion!==1||input.environment!=='dev'||!Array.isArray(input.entries)||!input.entries.length||input.entries.length>256||typeof readMedia!=='function')invalid();
    const descriptors=[];
    for(const row of input.entries){
      const {database,appsheet,gcs}=row;
      if(!database||database.database!=='loan_manager_dev'||database.instance!==DEV_INSTANCE||database.host!=='34.21.174.215'
        ||database.table!=='Payments'||database.column!=='Uploaded Receipt'||database.readOnly!==true||!validTime(database.capturedAt)
        ||typeof database.rowId!=='string'||!database.rowId||database.rowId.length>256
        ||typeof database.reference!=='string'||!/^manual-receipts\/dev\/[^/\\\u0000-\u001f]+$/u.test(database.reference)
        ||!appsheet||appsheet.appId!==DEV_APP||appsheet.method!=='authenticated-appsheet-media'
        ||appsheet.reference!==database.reference||appsheet.rowId!==database.rowId||!validTime(appsheet.capturedAt)
        ||!gcs||gcs.bucket!==DEV_RECEIPT_MAPPING.bucket||!validTime(gcs.capturedAt))invalid();
      const entry={referenceSha256:sha(database.reference),key:gcs.key,keySha256:sha(gcs.key),generation:gcs.generation,mimeType:gcs.mimeType,sizeBytes:gcs.sizeBytes,sha256:gcs.sha256};
      const candidate={schemaVersion:1,environment:'dev',bucket:DEV_RECEIPT_MAPPING.bucket,objectRoot:NATIVE_DEV_ROOT,entries:[entry]};
      parseNativeDevCatalog(JSON.stringify(candidate));
      const appBytes=await readMedia(appsheet.mediaPath),objectBytes=await readMedia(gcs.mediaPath);
      if(!Buffer.isBuffer(appBytes)||!Buffer.isBuffer(objectBytes)||appBytes.length!==entry.sizeBytes||objectBytes.length!==entry.sizeBytes
        ||appsheet.mimeType!==entry.mimeType||appsheet.sha256!==entry.sha256||sha(appBytes)!==entry.sha256||sha(objectBytes)!==entry.sha256)invalid();
      await decodeImage(appBytes,entry.mimeType);await decodeImage(objectBytes,entry.mimeType);
      descriptors.push(entry);
    }
    descriptors.sort((a,b)=>a.referenceSha256.localeCompare(b.referenceSha256));
    const catalog={schemaVersion:1,environment:'dev',bucket:DEV_RECEIPT_MAPPING.bucket,objectRoot:NATIVE_DEV_ROOT,entries:descriptors};
    parseNativeDevCatalog(JSON.stringify(catalog));
    return {catalog,evidence:{schemaVersion:1,environment:'dev',status:'captured-evidence-verified',count:descriptors.length,
      trustBoundary:'Operator-authenticated DEV SQL/AppSheet/GCS captures required; offline verification does not authenticate capture provenance.',
      entries:descriptors.map(({key,...entry})=>entry)}};
  }catch{invalid();}
}

const appRoot=fileURLToPath(new URL('../../',import.meta.url));
const projectRoot=resolve(appRoot,'../AppSheet-Loan-Project');
const inside=(root,path)=>{const rel=relative(root,path);return rel===''||(!rel.startsWith('..')&&!isAbsolute(rel));};
export async function privatePath(path,{output=false,roots=[appRoot,projectRoot]}={}){
  if(typeof path!=='string'||!isAbsolute(path))invalid();
  const canonical=output?resolve(await realpath(dirname(path)),path.split(/[\\/]/).at(-1)):await realpath(path);
  const blocked=await Promise.all(roots.map(root=>realpath(root)));
  if(blocked.some(root=>inside(root,canonical)))invalid();
  // Existing output symlinks are not followed or overwritten: CLI writes with wx.
  return canonical;
}
async function cli(){
  const args=process.argv.slice(2),options={};
  if(args.length!==6)invalid();
  for(let i=0;i<args.length;i+=2){if(!['--input','--output','--evidence'].includes(args[i])||options[args[i]])invalid();options[args[i]]=args[i+1];}
  const input=await privatePath(options['--input']),output=await privatePath(options['--output'],{output:true});
  if((await stat(input)).size>1048576)invalid();
  const result=await reconcileCapturedNative(JSON.parse(await readFile(input,'utf8')),{readMedia:async path=>{
    const file=await privatePath(path);if((await stat(file)).size>5242880)invalid();return readFile(file);
  }});
  const evidence=resolve(options['--evidence']);
  if(evidence===input||evidence===output)invalid();
  await writeFile(output,JSON.stringify(result.catalog,null,2)+'\n',{flag:'wx',mode:0o600});
  await writeFile(evidence,JSON.stringify(result.evidence,null,2)+'\n',{flag:'wx'});
  process.stdout.write('Verified private catalog and sanitized evidence written. No secret publication or deployment performed.\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){cli().catch(()=>{process.stderr.write('Native receipt reconciliation rejected; inspect private inputs.\n');process.exitCode=1;});}
