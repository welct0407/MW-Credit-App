// Synthetic business runtime environments for DEV and PROD profiles. No real identities or data.
import {PROJECT_ID,PROJECT_NUMBER,INSTANCE_CONNECTION_NAME} from '../../services/lib/identity.mjs';
export const syntheticMember={partnerId:'partner-1',loginEmail:'member@example.invalid',partnerRole:'B',capabilities:['read','command']};
export const syntheticPolicy=(environment,members=[syntheticMember])=>({schemaVersion:1,environment,evidenceSha256:'a'.repeat(64),members});
export const origins={dev:['https://dev-lm.mw-credit.com',`https://mw-credit-app-dev-${PROJECT_NUMBER}.web.app`],prod:['https://lm.mw-credit.com',`https://mw-credit-prod-${PROJECT_NUMBER}.web.app`]};
/** Complete activated business environment for one profile and service role. */
export function businessEnv(environment,role='reader',{members}={}){
  const prefix=environment==='dev'?'DEV_':'PROD_',user=`mw-credit-app-${role==='reader'?'read':'command'}-${environment}@${PROJECT_ID}.iam`;
  return {BUSINESS_ACTIVATION:'approved-candidate',APP_ENV:environment,BUSINESS_MODE:'business-candidate',FOUNDATION_ROLE:role,APPLICATION_PROJECT_ID:PROJECT_ID,APPLICATION_PROJECT_NUMBER:PROJECT_NUMBER,FIREBASE_PROJECT_ID:PROJECT_ID,AUTH_MODE:'firebase',
    DB_NAME:`loan_manager_${environment}`,DATA_PROJECT_ID:PROJECT_ID,INSTANCE_CONNECTION_NAME,DB_USER:user,RUNTIME_SERVICE_ACCOUNT:user+'.gserviceaccount.com',
    HOSTING_SITE_ID:environment==='dev'?`mw-credit-app-dev-${PROJECT_NUMBER}`:`mw-credit-prod-${PROJECT_NUMBER}`,ALLOWED_WEB_ORIGINS:JSON.stringify(origins[environment]),
    [prefix+'CAPABILITY_POLICY_JSON']:JSON.stringify(syntheticPolicy(environment,members)),[prefix+'CAPABILITY_POLICY_SHA256']:'a'.repeat(64),
    [prefix+'CAPABILITY_POLICY_SECRET_VERSION']:`projects/${PROJECT_ID}/secrets/mw-credit-app-${environment}-capability-policy/versions/1`,
    [prefix+'SQL_APPLICATION_ROLE']:`mw_app_${environment}`,[prefix+'SQL_JOURNAL_OWNER_ROLE']:`mw_app_${environment}_journal_owner`,[prefix+'SQL_REGISTERED_CREATORS']:'["postgres"]'};
}
