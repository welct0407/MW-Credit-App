import {parseNativeProductionCatalog} from '../receipts/production-native-catalog.mjs';
import {parseNativeDevCatalog} from '../receipts/native-catalog.mjs';
import {DEV_RECEIPT_MAPPING,PROD_RECEIPT_MAPPING} from '../receipts/dev-receipt-adapter.mjs';
import {PROJECT_ID,PROJECT_NUMBER,INSTANCE_CONNECTION_NAME} from '../lib/identity.mjs';
import { parseBusinessPolicy } from './business-policy.mjs';
export const BUSINESS_PROJECT=PROJECT_ID;
export const BUSINESS_INSTANCE=INSTANCE_CONNECTION_NAME;
/**
 * One business runtime, two environment profiles (ALL-ARCH-01). Variable names keep the
 * PROD_ prefix in production and use DEV_ in development, so production plans stay no-op.
 */
const PROFILES=Object.freeze({
  dev:Object.freeze({prefix:'DEV_',foreign:'PROD_',label:'DEV',hostingSite:`mw-credit-app-dev-${PROJECT_NUMBER}`,canonicalOrigin:'https://dev-lm.mw-credit.com'}),
  prod:Object.freeze({prefix:'PROD_',foreign:'DEV_',label:'production',hostingSite:`mw-credit-prod-${PROJECT_NUMBER}`,canonicalOrigin:'https://lm.mw-credit.com'}),
});
const AMBIENT=['DATABASE_URL','PGHOST','PGHOSTADDR','PGDATABASE','PGPORT','PGUSER','PGPASSWORD','PGSERVICE','PGSERVICEFILE','PGPASSFILE','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_AUTH_TENANT_ID','STORAGE_EMULATOR_HOST','COMMAND_MODE','COMMAND_FIXTURE_JSON','OWNER_FIREBASE_UID','ALLOWED_WEB_ORIGIN'];
const DEV_RECEIPT_KEYS=['RECEIPT_BUCKET','RECEIPT_SQL_PREFIX','RECEIPT_OBJECT_PREFIX','RECEIPT_COMPATIBILITY_EVIDENCE','RECEIPT_NATIVE_CATALOG_JSON'];
/**
 * Nothing becomes active through omission, a browser URL, or a foundation mode change.
 * @param {Record<string,string|undefined>} env
 */
export function loadBusinessConfig(env) {
  if(env.BUSINESS_ACTIVATION===undefined||env.BUSINESS_ACTIVATION==='disabled')return null;
  const environment=env.APP_ENV,profile=PROFILES[environment==='dev'?'dev':'prod'];
  const fail=()=>{throw Error(`Invalid ${profile.label} business candidate configuration`);};
  const prefixed=name=>env[profile.prefix+name];
  if(env.BUSINESS_ACTIVATION!=='approved-candidate'||!['dev','prod'].includes(environment)||env.BUSINESS_MODE!=='business-candidate'||!['reader','command'].includes(env.FOUNDATION_ROLE)
    ||env.APPLICATION_PROJECT_ID!==PROJECT_ID||env.APPLICATION_PROJECT_NUMBER!==PROJECT_NUMBER||env.FIREBASE_PROJECT_ID!==PROJECT_ID||env.AUTH_MODE!=='firebase'
    ||env.DB_NAME!==`loan_manager_${environment}`||env.INSTANCE_CONNECTION_NAME!==INSTANCE_CONNECTION_NAME||env.DATA_PROJECT_ID!==PROJECT_ID)fail();
  const serviceRole=env.FOUNDATION_ROLE,dbUser=`mw-credit-app-${serviceRole==='reader'?'read':'command'}-${environment}@${PROJECT_ID}.iam`;
  if(env.DB_USER!==dbUser||env.RUNTIME_SERVICE_ACCOUNT!==dbUser+'.gserviceaccount.com')fail();
  // Ambient credentials, retired DEV owner/fixture modes and the other environment's names are refused.
  if(AMBIENT.some(k=>env[k]!==undefined)||Object.keys(env).some(k=>k.startsWith(profile.foreign)&&env[k]!==undefined))fail();
  if(environment==='prod'&&env.RECEIPT_NATIVE_CATALOG_JSON!==undefined)fail();
  if(env.PWA_NOTIFICATIONS!==undefined&&!['disabled','enabled'].includes(env.PWA_NOTIFICATIONS)||env.WEB_PUSH_PRIVATE_KEY!==undefined||env.WEB_PUSH_VAPID_JSON!==undefined)fail();
  if(env.PWA_NOTIFICATIONS==='enabled'&&(!/^[A-Za-z0-9_-]{87}$/.test(env.WEB_PUSH_PUBLIC_KEY??'')||env.FOUNDATION_ROLE!=='command'))fail();
  const site=env.HOSTING_SITE_ID;
  if(site!==profile.hostingSite)fail();
  let origins;try{origins=JSON.parse(env.ALLOWED_WEB_ORIGINS);}catch{fail();}
  if(!Array.isArray(origins)||origins.length<1||origins.length>2||new Set(origins).size!==origins.length||!origins.includes(profile.canonicalOrigin)||origins.some(o=>![profile.canonicalOrigin,`https://${site}.web.app`].includes(o)))fail();
  let receiptCatalog=null,receiptCompatibility=null,nativeReceiptDescriptors=null;
  const receipts=prefixed('RECEIPTS');
  if(receipts!==undefined&&!['disabled','enabled'].includes(receipts))fail();
  if(receipts==='enabled'&&environment==='prod'){
   if(env.FOUNDATION_ROLE!=='command'||!new RegExp(`^projects/${PROJECT_ID}/secrets/mw-credit-app-prod-native-receipt-catalog/versions/[1-9][0-9]*$`).test(env.PROD_RECEIPT_CATALOG_SECRET_VERSION??''))fail();
   receiptCatalog=parseNativeProductionCatalog(env.PROD_RECEIPT_NATIVE_CATALOG_JSON,{environment:'prod',database:'loan_manager_prod',bucket:PROD_RECEIPT_MAPPING.bucket,objectRoot:PROD_RECEIPT_MAPPING.objectPrefix.slice(0,-4),sourceEvidenceSha256:env.PROD_RECEIPT_SOURCE_EVIDENCE_SHA256});
   try{receiptCompatibility=JSON.parse(env.PROD_RECEIPT_COMPATIBILITY_JSON)}catch{fail()}
   // Native PWA verification is independent of AppSheet; retained historical evidence remains readable.
   if(!receiptCompatibility||Object.keys(receiptCompatibility).sort().join(',')!=='bucket,evidenceReference,objectPrefix,sqlPrefix,status'||!['verified-native-render','verified-appsheet-render','verified-dev-render-and-prod-binding'].includes(receiptCompatibility.status)||!/^[a-f0-9]{64}$/.test(receiptCompatibility.evidenceReference??'')||Object.entries(PROD_RECEIPT_MAPPING).some(([k,v])=>receiptCompatibility[k]!==v))fail();
  }else if(receipts==='enabled'){
   // DEV keeps its verified receipt mapping and native catalog variable names.
   if(env.FOUNDATION_ROLE!=='command'||env.RECEIPT_BUCKET!==DEV_RECEIPT_MAPPING.bucket||env.RECEIPT_SQL_PREFIX!==DEV_RECEIPT_MAPPING.sqlPrefix
     ||env.RECEIPT_OBJECT_PREFIX!==DEV_RECEIPT_MAPPING.objectPrefix||typeof env.RECEIPT_COMPATIBILITY_EVIDENCE!=='string'||!env.RECEIPT_COMPATIBILITY_EVIDENCE.trim())fail();
   nativeReceiptDescriptors=parseNativeDevCatalog(env.RECEIPT_NATIVE_CATALOG_JSON);
   receiptCompatibility=Object.freeze({...DEV_RECEIPT_MAPPING,status:'verified-appsheet-render',evidenceReference:env.RECEIPT_COMPATIBILITY_EVIDENCE});
  }else if(environment==='dev'&&DEV_RECEIPT_KEYS.some(k=>env[k]!==undefined))fail();
  const policy=parseBusinessPolicy(prefixed('CAPABILITY_POLICY_JSON'),environment);
  if(prefixed('CAPABILITY_POLICY_SHA256')!==policy.evidenceSha256||!new RegExp(`^projects/${PROJECT_ID}/secrets/mw-credit-app-${environment}-capability-policy/versions/[1-9][0-9]*$`).test(prefixed('CAPABILITY_POLICY_SECRET_VERSION')??''))fail();
  // Proposed counterpart names require inspected migration/ownership evidence before deployment.
  const applicationRole=`mw_app_${environment}`,journalOwnerRole=`mw_app_${environment}_journal_owner`;
  if(prefixed('SQL_APPLICATION_ROLE')!==applicationRole||prefixed('SQL_JOURNAL_OWNER_ROLE')!==journalOwnerRole)fail();
  let registeredCreators;try{registeredCreators=JSON.parse(prefixed('SQL_REGISTERED_CREATORS'));}catch{fail();}
  if(!Array.isArray(registeredCreators)||!registeredCreators.length||registeredCreators.length>50||new Set(registeredCreators).size!==registeredCreators.length||registeredCreators.some(v=>typeof v!=='string'||!v||v.length>63||/[\u0000-\u001f]/.test(v)))fail();
  return Object.freeze({receiptCatalog,receiptCompatibility,nativeReceiptDescriptors,notificationsEnabled:env.PWA_NOTIFICATIONS==='enabled',pushPublicKey:env.WEB_PUSH_PUBLIC_KEY,environment,mode:'business-candidate',serviceRole,projectId:PROJECT_ID,issuer:`https://securetoken.google.com/${PROJECT_ID}`,database:env.DB_NAME,instance:INSTANCE_CONNECTION_NAME,dbUser,origins:Object.freeze(origins),canonicalOrigin:profile.canonicalOrigin,hostingSite:site,policy,registeredCreators:Object.freeze(registeredCreators),applicationRole,journalOwnerRole});
}
/** Retained name for existing build smoke checks and promotion tooling. */
export const loadProductionBusinessConfig=loadBusinessConfig;
