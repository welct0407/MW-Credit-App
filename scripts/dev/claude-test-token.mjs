#!/usr/bin/env node
/** R095 Part B: a DEV Firebase ID token for the Claude Code test account (owner decisions of 24 October 2026: a real
 * Google test account with a stored refresh token; Partner rights except settlements).
 *
 *   node scripts/dev/claude-test-token.mjs [--out <file>]
 *
 * Reads two DEV secrets with the operator session's own credentials (Application Default Credentials or
 * GOOGLE_OAUTH_ACCESS_TOKEN): mw-credit-app-dev-claude-test-session (latest; the refresh token, as JSON
 * {"refreshToken": …, "email": …} or the bare token) and mw-credit-app-dev-firebase-web (the DEV web app's public
 * apiKey and appId). It exchanges the refresh token at securetoken.googleapis.com and writes the ID token to --out
 * (default: $MW_SCRATCH/claude-dev-id-token, else a new 0700 directory of its own under the system temp directory),
 * created afresh with mode 0600 (an existing regular file is replaced; a symlink or anything else is refused). It prints only
 * {"expiresIn":…,"email":…,"out":…}; no token reaches stdout, stderr or an error message.
 * The Identity Platform user pool is shared with PROD, so the DEV check keys on the DEV web app (appId), not the
 * project: anything else is a refusal (exit 2). Other failures exit 1. */
import {closeSync,lstatSync,mkdtempSync,openSync,unlinkSync,writeSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const PROJECT='clever-oasis-508610-n7';
export const SESSION_SECRET='mw-credit-app-dev-claude-test-session';
export const WEB_SECRET='mw-credit-app-dev-firebase-web';
// The DEV web app (Firebase console, DEV Hosting dev-lm.mw-credit.com); PROD's is 1:737787224638:web:0ed0ba9555749c1cfbe76f.
export const DEV_APP_ID='1:737787224638:web:b98872168121353cfbe76f';
export const TOKEN_URL='https://securetoken.googleapis.com/v1/token';

export class Refusal extends Error {}
const refuse=message=>{throw new Refusal(message);};

/** Secret Manager latest version payload as text (operator credentials; never logged). */
export async function accessSecret(name,{fetchImpl=fetch,accessToken}={}){
 const token=accessToken??process.env.GOOGLE_OAUTH_ACCESS_TOKEN??await (async()=>{
  const {GoogleAuth}=await import('google-auth-library');
  return new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']}).getAccessToken();
 })();
 const response=await fetchImpl(`https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/${name}/versions/latest:access`,{headers:{authorization:'Bearer '+token}});
 if(!response.ok)throw Error(`Secret ${name} unreadable (HTTP ${response.status})`);
 const data=(await response.json())?.payload?.data;
 if(typeof data!=='string')throw Error(`Secret ${name} has no payload`);
 return Buffer.from(data,'base64').toString('utf8');
}

/** The refresh token and the expected email from the session secret (JSON or the bare token). */
export function sessionFrom(text){
 let value=text.trim();let email=null;
 if(value.startsWith('{')){
  let parsed;try{parsed=JSON.parse(value)}catch{refuse('Session secret is not valid JSON')}
  value=parsed?.refreshToken;email=typeof parsed?.email==='string'?parsed.email.trim().toLowerCase():null;
 }
 if(typeof value!=='string'||!/^[A-Za-z0-9._-]{20,4096}$/.test(value))refuse('Session secret holds no refresh token');
 return {refreshToken:value,email};
}

/** The DEV web app's public key, refusing any other app (the user pool is shared with PROD). */
export function webFrom(text){
 let config;try{config=JSON.parse(text)}catch{refuse('Web config secret is not valid JSON')}
 if(config?.appId!==DEV_APP_ID)refuse('Web config is not the DEV web app');
 if(config?.projectId!==PROJECT)refuse('Web config is not the MW Credit project');
 if(typeof config?.apiKey!=='string'||!/^AIza[0-9A-Za-z_-]{35}$/.test(config.apiKey))refuse('Web config has no API key');
 return {apiKey:config.apiKey,appId:config.appId};
}

/** Writes text to a file created afresh with mode 0600 (O_CREAT|O_EXCL): an existing regular file is removed first, so
 * neither its wider mode nor a planted symlink ever holds the token; a symlink or non-file at the path is a refusal. */
export function writePrivate(file,text){
 let existing=null;try{existing=lstatSync(file)}catch(error){if(error.code!=='ENOENT')throw error;}
 if(existing){
  if(existing.isSymbolicLink()||!existing.isFile())refuse('Output path is not a regular file');
  unlinkSync(file);
 }
 const fd=openSync(file,'wx',0o600);
 try{writeSync(fd,text)}finally{closeSync(fd)}
}
// $MW_SCRATCH when set, else a directory of this run's own (mkdtemp, mode 0700), never a fixed shared name.
export const defaultOut=()=>process.env.MW_SCRATCH?join(process.env.MW_SCRATCH,'claude-dev-id-token'):join(mkdtempSync(join(tmpdir(),'mw-claude-token-')),'claude-dev-id-token');

const claims=idToken=>{
 const part=String(idToken).split('.')[1];
 try{return JSON.parse(Buffer.from(part,'base64url').toString('utf8'))}catch{return null}
};

/** Exchange and write; returns the printed summary. Throws Refusal for a refused target, Error otherwise. */
export async function issue({out,fetchImpl=fetch,readSecret=name=>accessSecret(name,{fetchImpl}),write=writePrivate}={}){
 const session=sessionFrom(await readSecret(SESSION_SECRET));
 const web=webFrom(await readSecret(WEB_SECRET));
 const response=await fetchImpl(TOKEN_URL+'?key='+encodeURIComponent(web.apiKey),{method:'POST',
  headers:{'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'refresh_token',refresh_token:session.refreshToken}).toString()});
 let body=null;try{body=await response.json()}catch{}
 if(!response.ok){
  const code=typeof body?.error?.message==='string'?body.error.message.replace(/[^A-Z_ :]/g,'').slice(0,80):'unknown';
  // A revoked, expired or foreign refresh token is a refusal; the code alone is printed, never the token.
  if(response.status===400)refuse('Refresh refused: '+code);
  throw Error(`Token exchange failed (HTTP ${response.status}: ${code})`);
 }
 const idToken=body?.id_token;
 if(typeof idToken!=='string'||idToken.split('.').length!==3)throw Error('Token exchange returned no ID token');
 const c=claims(idToken);
 if(!c||c.aud!==PROJECT||c.iss!=='https://securetoken.google.com/'+PROJECT)refuse('ID token is not for the MW Credit project');
 const email=typeof c.email==='string'?c.email.toLowerCase():null;
 if(session.email&&email!==session.email)refuse('ID token is not for the stored test account');
 const file=resolve(out??defaultOut());
 write(file,idToken);
 return {expiresIn:Number(body.expires_in),email,out:file};
}

export function parseArgs(argv){
 const args={};
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--out'&&typeof argv[i+1]==='string'&&argv[i+1]&&!argv[i+1].startsWith('--'))args.out=argv[++i];
  else refuse('Usage: claude-test-token.mjs [--out <file>]');
 }
 return args;
}

export async function main(argv=process.argv.slice(2),{stdout=process.stdout,stderr=process.stderr,...options}={}){
 try{
  const summary=await issue({...parseArgs(argv),...options});
  stdout.write(JSON.stringify(summary)+'\n');
  return 0;
 }catch(error){
  stderr.write((error instanceof Refusal?'Refused: ':'Failed: ')+error.message+'\n');
  return error instanceof Refusal?2:1;
 }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await main();
