// R072 troubleshooting file: operator-side decryption (the app encrypts in apps/pwa/src/troubleshooting-envelope.ts).
import {createDecipheriv,createHash,createPrivateKey,createPublicKey,privateDecrypt,constants} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
/** sha256 hex of the SPKI DER of a public key, or of the public half of a private key. */
export const keyIdOf=key=>createHash('sha256').update(createPublicKey(key).export({type:'spki',format:'der'})).digest('hex');
/** The same AAD the app binds: the header fields in exactly this order. */
export const envelopeAad=e=>Buffer.from(JSON.stringify({format:e.format,v:e.v,keyId:e.keyId,alg:e.alg,compressed:e.compressed,environment:e.environment,createdAt:e.createdAt}),'utf8');
export class TroubleshootingError extends Error{constructor(message,code){super(message);this.code=code}}
/** Leading text lines (the heading) are skipped; the envelope is the first line that starts with `{`. */
export function parseTroubleshootingFile(text){
 const line=String(text).split(/\r?\n/).find(value=>value.trimStart().startsWith('{'));
 if(!line)throw new TroubleshootingError('No troubleshooting envelope found','format');
 let envelope;try{envelope=JSON.parse(line)}catch{throw new TroubleshootingError('Envelope is not valid JSON','format')}
 if(envelope?.format!=='mw-credit-troubleshooting'||envelope.v!==1||envelope.alg!=='RSA-OAEP-256+A256GCM'||!['gzip','none'].includes(envelope.compressed)||!['dev','prod','synthetic'].includes(envelope.environment)||!/^[a-f0-9]{64}$/.test(envelope.keyId??'')||typeof envelope.createdAt!=='string')throw new TroubleshootingError('Unsupported troubleshooting envelope','format');
 for(const field of ['wrappedKey','iv','ciphertext'])if(typeof envelope[field]!=='string'||!/^[A-Za-z0-9+/]+=*$/.test(envelope[field]))throw new TroubleshootingError('Invalid envelope field '+field,'format');
 return envelope;
}
/** Verifies the key id, unwraps the AES key (RSA-OAEP SHA-256) and opens AES-256-GCM with the header as AAD. */
export function decryptTroubleshooting(envelope,privateKeyPem){
 const key=createPrivateKey(privateKeyPem);
 if(keyIdOf(key)!==envelope.keyId)throw new TroubleshootingError('The private key does not match the file key id','key');
 let plain;
 try{
  const raw=privateDecrypt({key,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(envelope.wrappedKey,'base64'));
  const data=Buffer.from(envelope.ciphertext,'base64'),iv=Buffer.from(envelope.iv,'base64');
  if(raw.length!==32||iv.length!==12||data.length<17)throw Error('length');
  const decipher=createDecipheriv('aes-256-gcm',raw,iv,{authTagLength:16});decipher.setAAD(envelopeAad(envelope));decipher.setAuthTag(data.subarray(data.length-16));
  plain=Buffer.concat([decipher.update(data.subarray(0,data.length-16)),decipher.final()]);
 }catch{throw new TroubleshootingError('The file could not be decrypted (damaged or altered)','decrypt')}
 return JSON.parse((envelope.compressed==='gzip'?gunzipSync(plain):plain).toString('utf8'));
}
