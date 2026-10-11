import {parseNativeProductionCatalog} from '../receipts/production-native-catalog.mjs';
import {PROD_RECEIPT_MAPPING} from '../receipts/dev-receipt-adapter.mjs';
import { parseBusinessPolicy } from './business-policy.mjs';
export const BUSINESS_PROJECT='clever-oasis-508610-n7';
export const BUSINESS_INSTANCE=BUSINESS_PROJECT+':asia-southeast1:appsheet-pg-prod-20260914';
const fail=()=>{throw Error('Invalid production business candidate configuration');};
/** Nothing becomes active through omission, a browser URL, or a foundation mode change. */
export function loadProductionBusinessConfig(env) {
  if(env.BUSINESS_ACTIVATION===undefined||env.BUSINESS_ACTIVATION==='disabled')return null;
  if(env.BUSINESS_ACTIVATION!=='approved-candidate'||env.APP_ENV!=='prod'||env.BUSINESS_MODE!=='business-candidate'||!['reader','command'].includes(env.FOUNDATION_ROLE)
    ||env.APPLICATION_PROJECT_ID!==BUSINESS_PROJECT||env.APPLICATION_PROJECT_NUMBER!=='737787224638'||env.FIREBASE_PROJECT_ID!==BUSINESS_PROJECT||env.AUTH_MODE!=='firebase'
    ||env.DB_NAME!=='loan_manager_prod'||env.INSTANCE_CONNECTION_NAME!==BUSINESS_INSTANCE||env.DATA_PROJECT_ID!==BUSINESS_PROJECT)fail();
  const serviceRole=env.FOUNDATION_ROLE,dbUser=`mw-credit-app-${serviceRole==='reader'?'read':'command'}-prod@${BUSINESS_PROJECT}.iam`;
  if(env.DB_USER!==dbUser||env.RUNTIME_SERVICE_ACCOUNT!==dbUser+'.gserviceaccount.com')fail();
  if(['DATABASE_URL','PGHOST','PGHOSTADDR','PGDATABASE','PGPORT','PGUSER','PGPASSWORD','PGSERVICE','PGSERVICEFILE','PGPASSFILE','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_AUTH_TENANT_ID','STORAGE_EMULATOR_HOST','COMMAND_MODE','COMMAND_FIXTURE_JSON','OWNER_FIREBASE_UID','RECEIPT_NATIVE_CATALOG_JSON'].some(k=>env[k]!==undefined))fail();
  if(env.PWA_NOTIFICATIONS!==undefined&&!['disabled','enabled'].includes(env.PWA_NOTIFICATIONS)||env.WEB_PUSH_PRIVATE_KEY!==undefined||env.WEB_PUSH_VAPID_JSON!==undefined)fail();
  if(env.PWA_NOTIFICATIONS==='enabled'&&(!/^[A-Za-z0-9_-]{87}$/.test(env.WEB_PUSH_PUBLIC_KEY??'')||env.FOUNDATION_ROLE!=='command'))fail();
  const site=env.HOSTING_SITE_ID;
  if(site!=='mw-credit-prod-737787224638')fail();
  let origins;try{origins=JSON.parse(env.ALLOWED_WEB_ORIGINS);}catch{fail();}
  if(!Array.isArray(origins)||origins.length<1||origins.length>2||new Set(origins).size!==origins.length||!origins.includes('https://lm.mw-credit.com')||origins.some(o=>!['https://lm.mw-credit.com',`https://${site}.web.app`].includes(o)))fail();
  let receiptCatalog=null,receiptCompatibility=null;
  if(env.PROD_RECEIPTS!==undefined&&!['disabled','enabled'].includes(env.PROD_RECEIPTS))fail();
  if(env.PROD_RECEIPTS==='enabled'){
   if(env.FOUNDATION_ROLE!=='command'||!/^projects\/clever-oasis-508610-n7\/secrets\/mw-credit-app-prod-native-receipt-catalog\/versions\/[1-9][0-9]*$/.test(env.PROD_RECEIPT_CATALOG_SECRET_VERSION??''))fail();
   receiptCatalog=parseNativeProductionCatalog(env.PROD_RECEIPT_NATIVE_CATALOG_JSON,{environment:'prod',database:'loan_manager_prod',bucket:PROD_RECEIPT_MAPPING.bucket,objectRoot:PROD_RECEIPT_MAPPING.objectPrefix.slice(0,-4),sourceEvidenceSha256:env.PROD_RECEIPT_SOURCE_EVIDENCE_SHA256});
   try{receiptCompatibility=JSON.parse(env.PROD_RECEIPT_COMPATIBILITY_JSON)}catch{fail()}
   // Qualified reuse is explicit: DEV rendering plus exact PROD binding is not a PROD GUI observation.
   if(!receiptCompatibility||Object.keys(receiptCompatibility).sort().join(',')!=='bucket,evidenceReference,objectPrefix,sqlPrefix,status'||!['verified-appsheet-render','verified-dev-render-and-prod-binding'].includes(receiptCompatibility.status)||!/^[a-f0-9]{64}$/.test(receiptCompatibility.evidenceReference??'')||Object.entries(PROD_RECEIPT_MAPPING).some(([k,v])=>receiptCompatibility[k]!==v))fail();
  }
  const policy=parseBusinessPolicy(env.PROD_CAPABILITY_POLICY_JSON);
  if(env.PROD_CAPABILITY_POLICY_SHA256!==policy.evidenceSha256||!/^projects\/clever-oasis-508610-n7\/secrets\/mw-credit-app-prod-capability-policy\/versions\/[1-9][0-9]*$/.test(env.PROD_CAPABILITY_POLICY_SECRET_VERSION??''))fail();
  // Proposed counterpart names require inspected migration/ownership evidence before deployment.
  if(env.PROD_SQL_APPLICATION_ROLE!=='mw_app_prod'||env.PROD_SQL_JOURNAL_OWNER_ROLE!=='mw_app_prod_journal_owner')fail();
  let registeredCreators;try{registeredCreators=JSON.parse(env.PROD_SQL_REGISTERED_CREATORS);}catch{fail();}
  if(!Array.isArray(registeredCreators)||!registeredCreators.length||registeredCreators.length>50||new Set(registeredCreators).size!==registeredCreators.length||registeredCreators.some(v=>typeof v!=='string'||!v||v.length>63||/[\u0000-\u001f]/.test(v)))fail();
  return Object.freeze({receiptCatalog,receiptCompatibility,notificationsEnabled:env.PWA_NOTIFICATIONS==='enabled',pushPublicKey:env.WEB_PUSH_PUBLIC_KEY,environment:'prod',mode:'business-candidate',serviceRole,projectId:BUSINESS_PROJECT,issuer:`https://securetoken.google.com/${BUSINESS_PROJECT}`,database:env.DB_NAME,instance:BUSINESS_INSTANCE,dbUser,origins:Object.freeze(origins),hostingSite:site,policy,registeredCreators:Object.freeze(registeredCreators),applicationRole:env.PROD_SQL_APPLICATION_ROLE,journalOwnerRole:env.PROD_SQL_JOURNAL_OWNER_ROLE});
}
