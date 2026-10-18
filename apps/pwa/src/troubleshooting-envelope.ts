// Self-contained (no relative imports) so unit tests and vite.config.ts can load it directly.
/** sha256 of the committed SPKI DER (apps/pwa/troubleshooting-public-key.pem); the private key is Secret Manager mw-credit-app-troubleshooting-private-key. */
export const troubleshootingKeyId='77c23e74520a272b6b43d872d7bcf6d88cbae219db8c447e921479abe5783dd6';
export const troubleshootingFileHeading='MW Credit troubleshooting file (encrypted). Send it only to the app owner.';
export type TroubleshootingEnvironment='dev'|'prod'|'synthetic';
export type TroubleshootingEnvelope={format:'mw-credit-troubleshooting';v:1;keyId:string;alg:'RSA-OAEP-256+A256GCM';compressed:'gzip'|'none';environment:TroubleshootingEnvironment;createdAt:string;wrappedKey:string;iv:string;ciphertext:string};
/** Additional authenticated data: the header fields in exactly this order (scripts/troubleshooting/envelope.mjs repeats it). */
export const envelopeAad=(e:Pick<TroubleshootingEnvelope,'format'|'v'|'keyId'|'alg'|'compressed'|'environment'|'createdAt'>)=>new TextEncoder().encode(JSON.stringify({format:e.format,v:e.v,keyId:e.keyId,alg:e.alg,compressed:e.compressed,environment:e.environment,createdAt:e.createdAt}));
export function pemToDer(pem:string){const body=pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g,'').replace(/\s+/g,'');if(!/^[A-Za-z0-9+/]+=*$/.test(body))throw Error('Invalid public key');return fromBase64(body)}
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
export const keyIdOf=async(der:Uint8Array,subtle:SubtleCrypto=globalThis.crypto.subtle)=>hex(await subtle.digest('SHA-256',der as BufferSource));
export function toBase64(bytes:Uint8Array){let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary)}
export function fromBase64(text:string){const binary=atob(text),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes}
/** No plaintext fallback: without WebCrypto or a public key the file cannot be made. */
export const troubleshootingSupported=(publicKeyPem:string|undefined)=>!!publicKeyPem&&typeof globalThis.crypto?.subtle?.encrypt==='function';
async function gzip(bytes:Uint8Array){return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())}
/** JSON → gzip (when CompressionStream exists) → AES-256-GCM with a random key → that key wrapped with RSA-OAEP SHA-256. */
export async function encryptTroubleshooting(payload:unknown,{publicKeyPem,environment,createdAt=new Date(),compress=typeof CompressionStream==='function',subtle=globalThis.crypto.subtle}:{publicKeyPem:string;environment:TroubleshootingEnvironment;createdAt?:Date;compress?:boolean;subtle?:SubtleCrypto}):Promise<TroubleshootingEnvelope>{
 const der=pemToDer(publicKeyPem),keyId=await keyIdOf(der,subtle);
 const rsa=await subtle.importKey('spki',der as BufferSource,{name:'RSA-OAEP',hash:'SHA-256'},false,['wrapKey']);
 const aes=await subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']),iv=globalThis.crypto.getRandomValues(new Uint8Array(12));
 const json=new TextEncoder().encode(JSON.stringify(payload)),plain=compress?await gzip(json):json;
 const header={format:'mw-credit-troubleshooting' as const,v:1 as const,keyId,alg:'RSA-OAEP-256+A256GCM' as const,compressed:compress?'gzip' as const:'none' as const,environment,createdAt:createdAt.toISOString()};
 const ciphertext=new Uint8Array(await subtle.encrypt({name:'AES-GCM',iv,additionalData:envelopeAad(header),tagLength:128},aes,plain as BufferSource));
 const wrappedKey=new Uint8Array(await subtle.wrapKey('raw',aes,rsa,{name:'RSA-OAEP'}));
 return {...header,wrappedKey:toBase64(wrappedKey),iv:toBase64(iv),ciphertext:toBase64(ciphertext)};
}
/** .txt content: one heading line, then the envelope JSON on one line. */
export const troubleshootingFileText=(envelope:TroubleshootingEnvelope)=>troubleshootingFileHeading+'\n'+JSON.stringify(envelope);
