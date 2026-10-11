// Controlled operator delivery. The promotion manifest itself remains local-only.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {validateAuthorizedPackage} from '../promotion/manifest.mjs';

const REPOSITORY='welct0407/MW-Credit-App';
const PROJECT='clever-oasis-508610-n7';
export function parseDeliveryArguments(args) {
  const allowed=new Set(['--manifest','--artifact-root','--rollback-root','--ci-run','--apply']);const result={};
  for(let i=0;i<args.length;i++){const key=args[i];if(!allowed.has(key)||Object.hasOwn(result,key))throw Error('Invalid delivery arguments');const value=key==='--apply'?true:args[++i];if(!value||typeof value==='string'&&value.startsWith('--'))throw Error('Missing delivery argument');result[key]=value;}
  for(const key of ['--manifest','--artifact-root','--rollback-root','--ci-run'])if(!result[key])throw Error('Explicit package, roots and CI run required');
  if(!/^[1-9][0-9]*$/.test(result['--ci-run']))throw Error('Exact CI run required');return result;
}
export async function verifyFullCheckpoint({runId,sourceCommit,githubToken,request=fetch}) {
  if(!githubToken)throw Error('Existing GitHub read credential required');
  async function get(suffix){const response=await request('https://api.github.com/repos/'+REPOSITORY+suffix,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+githubToken,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});if(!response.ok)throw Error('CI readback failed');return response.json();}
  const run=await get('/actions/runs/'+runId);
  if(String(run.id)!==String(runId)||run.head_sha!==sourceCommit||run.status!=='completed'||run.conclusion!=='success'||run.repository?.full_name!==REPOSITORY)throw Error('Exact-source successful CI required');
  const workflow=await get('/actions/workflows/'+run.workflow_id);if(workflow.path!=='.github/workflows/ci.yml')throw Error('Wrong checkpoint workflow');
  const jobs=await get('/actions/runs/'+runId+'/jobs?per_page=100');if(jobs.total_count>100)throw Error('Unbounded CI job inventory');
  const browser=jobs.jobs?.some(job=>job.conclusion==='success'&&job.steps?.some(step=>step.name==='npm run test:e2e'&&step.conclusion==='success'));
  if(!browser)throw Error('Actual full browser checkpoint required');
  return {runId:String(runId),sourceCommit,fullCheckpoint:'success'};
}
export async function verifyOperatorCredential({token,request=fetch}) {
  if(!token)throw Error('Existing gcloud human operator token required');
  async function get(url,quota=true){const response=await request(url,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+token,...(quota?{'x-goog-user-project':PROJECT}:{})}});if(!response.ok)throw Error('Operator readback failed');return response.json();}
  const identity=await get('https://www.googleapis.com/oauth2/v3/userinfo',false);
  if(identity.email!=='welct0407@mw-credit.com'||identity.email_verified!==true)throw Error('Approved verified human operator required');
  for(const site of ['mw-credit-prod-737787224638','mw-credit-app-dev-737787224638']){const expected='projects/'+PROJECT+'/sites/'+site;const actual=await get('https://firebasehosting.googleapis.com/v1beta1/'+expected);if(actual.name!==expected)throw Error('Wrong actual Hosting site');}
  return {operator:'verified human',productionSite:'mw-credit-prod-737787224638',developmentSite:'mw-credit-app-dev-737787224638',readback:'passed'};
}
export async function prepareHostingDelivery({manifest,artifactRoot,rollbackRoot}) {
  const review=await validateAuthorizedPackage(manifest,{artifactRoot,rollbackRoot});
  if(manifest.target.isolation!=='shared-project-default-auth'||manifest.target.applicationProject.id!==PROJECT||manifest.artifacts.frontend.publicWorker!==false)throw Error('Explicit shared foundation target required');
  const site=manifest.target.hosting.site;if(!/^mw-credit-prod-[0-9]+$/.test(site)||site!=='mw-credit-prod-737787224638')throw Error('Exact production Hosting site required');
  const files={};const contents=new Map();
  for(const file of manifest.artifacts.frontend.files){if(file.path==='firebase.json')continue;const bytes=await readFile(path.resolve(artifactRoot,...file.path.split('/')));if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Changed bytes after package verification');const compressed=gzipSync(bytes);const hash=createHash('sha256').update(compressed).digest('hex');files['/'+file.path]=hash;contents.set(hash,compressed);}
  if(!files['/index.html']||files['/sw.js'])throw Error('Wrong initial Hosting artifact');
  const headers=[{glob:'**',headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'}}];
  return {review,site,sourceCommit:manifest.sourceCommit,targetSha256:manifest.targetSha256,phase:manifest.artifacts.frontend.phase,files,contents,headers};
}
export async function publishHostingDelivery({prepared,token,request=fetch}) {
  if(prepared?.site!=='mw-credit-prod-737787224638'||!/^[a-f0-9]{40}$/.test(prepared.sourceCommit)||!/^[a-f0-9]{64}$/.test(prepared.targetSha256))throw Error('Exact controlled production package required');
  if(!token)throw Error('Existing approved operator credential required');
  async function call(url,method='POST',body,raw=false){const parsed=new URL(url);if(!['firebasehosting.googleapis.com','upload-firebasehosting.googleapis.com'].includes(parsed.hostname)||parsed.protocol!=='https:'||parsed.username||parsed.password)throw Error('Unexpected Hosting API host');const response=await request(url,{method,redirect:'error',headers:{Authorization:'Bearer '+token,'x-goog-user-project':PROJECT,'Content-Type':raw?'application/octet-stream':'application/json'},body:raw?body:body===undefined?undefined:JSON.stringify(body)});if(!response.ok)throw Error('Hosting operation failed HTTP'+response.status);const text=await response.text();return text?JSON.parse(text):{};}
  const api='https://firebasehosting.googleapis.com/v1beta1/';
  const version=await call(api+'sites/'+prepared.site+'/versions','POST',{config:{headers:prepared.headers}});
  if(!new RegExp('^sites/'+prepared.site+'/versions/[A-Za-z0-9_-]+$').test(version.name))throw Error('Wrong created Hosting version');
  const populated=await call(api+version.name+':populateFiles','POST',{files:prepared.files});
  for(const hash of populated.uploadRequiredHashes??[]){if(!prepared.contents.has(hash))throw Error('Unexpected upload content');await call(populated.uploadUrl+'/'+hash,'POST',prepared.contents.get(hash),true);}
  const finalized=await call(api+version.name+'?updateMask=status','PATCH',{status:'FINALIZED'});if(finalized.status!=='FINALIZED'||finalized.name!==version.name)throw Error('Exact Hosting version not finalized');
  const release=await call(api+'sites/'+prepared.site+'/releases?versionName='+encodeURIComponent(version.name),'POST');
  if(!new RegExp('^sites/'+prepared.site+'/releases/[A-Za-z0-9_-]+$').test(release.name)||release.version?.name!==version.name)throw Error('Wrong Hosting release version');
  return {site:prepared.site,phase:prepared.phase,sourceCommit:prepared.sourceCommit,targetSha256:prepared.targetSha256,version:version.name,release:release.name,url:'https://'+prepared.site+'.web.app',cachePolicy:'no-store',worker:false};
}
async function cli(args){
  const options=parseDeliveryArguments(args);const bytes=await readFile(options['--manifest']);if(bytes.length>256*1024)throw Error('Bounded manifest required');const manifest=JSON.parse(bytes);
  const prepared=await prepareHostingDelivery({manifest,artifactRoot:options['--artifact-root'],rollbackRoot:options['--rollback-root']});
  if(!options['--apply']){process.stdout.write(JSON.stringify({dryRun:true,site:prepared.site,phase:prepared.phase,sourceCommit:prepared.sourceCommit,targetSha256:prepared.targetSha256,fileCount:Object.keys(prepared.files).length,ciRun:options['--ci-run'],execution:'not performed'})+'\n');return;}
  const ci=await verifyFullCheckpoint({runId:options['--ci-run'],sourceCommit:manifest.sourceCommit,githubToken:process.env.GITHUB_TOKEN});
  const token=process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  await verifyOperatorCredential({token});
  const result=await publishHostingDelivery({prepared,token});process.stdout.write(JSON.stringify({...result,ci})+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)cli(process.argv.slice(2)).catch(()=>{process.stderr.write('Controlled foundation delivery rejected or stopped. Preserve package and any created version; inspect sanitized stage evidence.\n');process.exitCode=1;});
