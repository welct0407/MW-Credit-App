import {createHash} from 'node:crypto';
import {readFile,writeFile,realpath,stat} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseNativeDevCatalog,NATIVE_DEV_ROOT} from '../../services/receipts/native-catalog.mjs';
import {DEV_RECEIPT_MAPPING} from '../../services/receipts/dev-receipt-adapter.mjs';
import {INSTANCE_CONNECTION_NAME as DEV_INSTANCE} from '../../services/lib/identity.mjs';
import {decodeSourceReceipt} from '../../services/receipts/decode-image.mjs';
import {parseNativeProductionCatalog} from '../../services/receipts/production-native-catalog.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const validTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const invalid=()=>{throw Error('Native receipt reconciliation rejected');};
const DEV_APP='500b27b6-884a-41e8-a9ec-df801b0110ad';
/** Captures are operator-authenticated evidence, not authentication established by this offline verifier. */
export async function reconcileCapturedNative(input,{readMedia,decodeImage=decodeSourceReceipt}={}){
  try {
    const prod=input?.environment==='prod';
    if(input?.schemaVersion!==1||!['dev','prod'].includes(input.environment)||!Array.isArray(input.entries)||!input.entries.length||input.entries.length>256||typeof readMedia!=='function')invalid();
    const binding=prod?input.binding:null;
    const base=prod?{schemaVersion:1,...binding}:{schemaVersion:1,environment:'dev',bucket:DEV_RECEIPT_MAPPING.bucket,objectRoot:NATIVE_DEV_ROOT};
    const parse=catalog=>prod?parseNativeProductionCatalog(JSON.stringify(catalog),binding):parseNativeDevCatalog(JSON.stringify(catalog));
    if(prod)parse({...base,entries:[]});
    const descriptors=[],aliasGroups=new Map(),aliasKeySets=new Map(),reservedKeys=new Set();
    for(const row of input.entries){
      const {database,appsheet,gcs}=row;
      if(!database||database.database!==(prod?'loan_manager_prod':'loan_manager_dev')||database.instance!==DEV_INSTANCE||database.host!=='136.85.127.134'
        ||database.table!=='Payments'||database.column!=='Uploaded Receipt'||database.readOnly!==true||!validTime(database.capturedAt)
        ||typeof database.rowId!=='string'||!database.rowId||database.rowId.length>256
        ||typeof database.reference!=='string'||!(prod?/^manual-receipts\/prod\/[^/\\\u0000-\u001f]+$/u:/^manual-receipts\/dev\/[^/\\\u0000-\u001f]+$/u).test(database.reference)
        ||!appsheet||appsheet.appId!==(prod?'93844270-6aa5-420b-a960-bcdf08abd357':DEV_APP)||appsheet.method!=='authenticated-appsheet-media'
        ||appsheet.reference!==database.reference||appsheet.rowId!==database.rowId||!validTime(appsheet.capturedAt)
        ||!gcs||gcs.bucket!==base.bucket||!validTime(gcs.capturedAt))invalid();
      const entry={referenceSha256:sha(database.reference),key:gcs.key,keySha256:sha(gcs.key),generation:gcs.generation,mimeType:gcs.mimeType,sizeBytes:gcs.sizeBytes,sha256:gcs.sha256};
      parse({...base,entries:[entry]});
      const appBytes=await readMedia(appsheet.mediaPath),objectBytes=await readMedia(gcs.mediaPath);
      if(!Buffer.isBuffer(appBytes)||!Buffer.isBuffer(objectBytes)||appBytes.length!==entry.sizeBytes||objectBytes.length!==entry.sizeBytes
        ||appsheet.mimeType!==entry.mimeType||appsheet.sha256!==entry.sha256||sha(appBytes)!==entry.sha256||sha(objectBytes)!==entry.sha256)invalid();
      await decodeImage(appBytes,entry.mimeType);await decodeImage(objectBytes,entry.mimeType);
      if(gcs.provenance!==undefined||gcs.aliases!==undefined){
        if(!prod||gcs.provenance!=='content-equivalent-alias'||!Array.isArray(gcs.aliases)||gcs.aliases.length<2||gcs.aliases.length>36)invalid();
        const ordered=[...gcs.aliases].sort((a,b)=>a.key.localeCompare(b.key)||a.generation.localeCompare(b.generation));
        if(!ordered.some(a=>a.key===entry.key&&a.generation===entry.generation))invalid();
        const keys=new Set();
        for(const alias of ordered){
          parse({...base,entries:[{...entry,key:alias.key,keySha256:sha(alias.key),generation:alias.generation}]});
          if(keys.has(alias.key+'#'+alias.generation)||alias.sha256!==entry.sha256||alias.mimeType!==entry.mimeType||alias.sizeBytes!==entry.sizeBytes)invalid();keys.add(alias.key+'#'+alias.generation);
          const aliasBytes=await readMedia(alias.mediaPath);
          if(!Buffer.isBuffer(aliasBytes)||aliasBytes.length!==entry.sizeBytes||sha(aliasBytes)!==entry.sha256)invalid();
          await decodeImage(aliasBytes,entry.mimeType);
        }
        // Allocate distinct verified content aliases without weakening catalog key uniqueness.
        const signature=JSON.stringify(ordered.map(a=>[a.key,a.generation,a.sha256,a.mimeType,a.sizeBytes]));
        for(const alias of ordered){if(aliasKeySets.has(alias.key)&&aliasKeySets.get(alias.key)!==signature)invalid();aliasKeySets.set(alias.key,signature);}
        const group=aliasGroups.get(signature)||[];group.push({entry,ordered});aliasGroups.set(signature,group);
      }else{if(reservedKeys.has(entry.key))invalid();reservedKeys.add(entry.key);}
      descriptors.push(entry);
    }
    for(const group of aliasGroups.values()){
      group.sort((a,b)=>a.entry.referenceSha256.localeCompare(b.entry.referenceSha256));
      const candidates=group[0].ordered.filter((a,i,list)=>!reservedKeys.has(a.key)&&list.findIndex(b=>b.key===a.key)===i);
      if(group.length>candidates.length)invalid();
      for(let i=0;i<group.length;i++){const alias=candidates[i];Object.assign(group[i].entry,{key:alias.key,keySha256:sha(alias.key),generation:alias.generation});reservedKeys.add(alias.key);}
    }
    descriptors.sort((a,b)=>a.referenceSha256.localeCompare(b.referenceSha256));
    const catalog={...base,entries:descriptors};
    parse(catalog);
    return {catalog,evidence:{schemaVersion:1,environment:input.environment,status:'captured-evidence-verified',count:descriptors.length,
      trustBoundary:'Operator-authenticated environment-matched SQL/AppSheet/GCS captures required; offline verification does not authenticate capture provenance.',
      contentEquivalentAliases:input.entries.filter(r=>r.gcs.provenance==='content-equivalent-alias').map(r=>({referenceSha256:sha(r.database.reference),provenance:'content-equivalent-alias',storageIdentityProven:false,candidates:r.gcs.aliases.map(a=>({keySha256:sha(a.key),generation:a.generation,sha256:a.sha256,mimeType:a.mimeType,sizeBytes:a.sizeBytes}))})),
      entries:descriptors.map(({key,...entry})=>entry)}};
  }catch{invalid();}
}

const appRoot=fileURLToPath(new URL('../../',import.meta.url));
const projectRoot=resolve(appRoot,'project');
const inside=(root,path)=>{const rel=relative(root,path);return rel===''||(rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel));};
async function canonicalBlockedRoot(root){
  const absolute=resolve(root);let ancestor=absolute;
  for(;;){
    try{return resolve(await realpath(ancestor),relative(ancestor,absolute));}
    catch(error){
      // A sibling checkout is optional in CI. Preserve its reserved subtree,
      // resolving existing ancestors so aliases cannot evade the exclusion.
      if(error?.code!=='ENOENT'||dirname(ancestor)===ancestor)throw error;
      ancestor=dirname(ancestor);
    }
  }
}
export async function privatePath(path,{output=false,roots=[appRoot,projectRoot]}={}){
  if(typeof path!=='string'||!isAbsolute(path))invalid();
  const canonical=output?resolve(await realpath(dirname(path)),path.split(/[\\/]/).at(-1)):await realpath(path);
  const blocked=await Promise.all(roots.map(canonicalBlockedRoot));
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
