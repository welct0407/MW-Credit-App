// R144 component versioning: the release stamp of the Metabase reports. Metabase cannot report a release itself, so the
// reporting collection (collection 10 "Loan Reports · dashboard", which holds dashboard 32 "Loan Reports"; see
// DecommissionLoanReports.mjs and the Environment Inventory) carries a trailing description line `MW release: Rnnn`.
//   --check (default)          read-only: prints {"collection","name","stamp"}; `stamp` is the release or null. The JSON is
//                              the metabase-reports entry for `component-versions.mjs drift --observed`.
//   --apply --release Rnnn     PROD write (promotion only, owner-authorized): writes or replaces that one line, keeps the
//                              rest of the description, then reads it back. A run that changes nothing writes nothing.
// The administrator key comes from ReportingApi.mjs (Secret Manager); it is never printed.
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const COLLECTION=10,COLLECTION_NAME='Loan Reports · dashboard';
const RELEASE=/^R\d{3}$/,LINE=/(?:^|\n)MW release: (R\d{3})[ \t]*$/;

/** The release in a description's trailing `MW release: Rnnn` line, else null. */
export function readStamp(description){
 return typeof description==='string'?LINE.exec(description.replace(/\s+$/,''))?.[1]??null:null;
}
/** The description with its trailing stamp line written or replaced; every other line is kept as it was. */
export function stampDescription(description,release){
 if(!RELEASE.test(release??''))throw Error('--release must look like R144');
 const text=typeof description==='string'?description.replace(/\s+$/,''):'';
 const body=text.replace(LINE,'').replace(/\s+$/,'');
 return (body?body+'\n\n':'')+'MW release: '+release;
}
async function collection(api){
 const value=await api('GET','collection/'+COLLECTION);
 if(value?.id!==COLLECTION||value.name!==COLLECTION_NAME||value.archived)throw Error('Collection '+COLLECTION+' is not the active "'+COLLECTION_NAME+'"; refusing');
 return value;
}
export async function check({api}){
 const value=await collection(api);
 return {collection:COLLECTION,name:value.name,stamp:readStamp(value.description)};
}
export async function apply({api,release}){
 const value=await collection(api),next=stampDescription(value.description,release);
 if(next===value.description)return {collection:COLLECTION,stamp:release,changed:false};
 await api('PUT','collection/'+COLLECTION,{description:next});
 const after=await collection(api);
 if(readStamp(after.description)!==release||after.description!==next)throw Error('Stamp read-back mismatch; inspect collection '+COLLECTION+' before retrying');
 return {collection:COLLECTION,stamp:release,changed:true,previous:readStamp(value.description)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),applying=args.includes('--apply'),at=args.indexOf('--release');
 const release=at>=0?args[at+1]:undefined;
 const unknown=args.filter((arg,i)=>!['--apply','--check','--release'].includes(arg)&&!(i===at+1&&at>=0));
 try{
  if(unknown.length||(applying&&args.includes('--check'))||(applying!==(release!==undefined)))throw Error('Usage: Stamp-Release.mjs [--check] | --apply --release Rnnn');
  if(applying&&!RELEASE.test(release))throw Error('--release must look like R144');
  const {api}=await import('./ReportingApi.mjs');
  console.log(JSON.stringify(applying?await apply({api,release}):await check({api})));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
