// Synthetic chat service environments (R090): the business fixture with FOUNDATION_ROLE=chat. No real identities.
import {PROJECT_ID} from '../../services/lib/identity.mjs';
import {businessEnv} from './business-env-fixture.mjs';
// The design §3.2 example (gemini-3.5-flash available after Forge's live check of 23 October 2026).
export const MODELS={version:1,location:'global',default:'gemini-4-argon',thinkingLevel:'MEDIUM',maxRounds:16,requestTimeoutSeconds:120,turnTimeoutSeconds:240,
 historyTokenLimit:150000,seedChars:40000,maxOutputTokens:16384,models:[{id:'gemini-4-argon',label:'Gemini 4 Argon',available:true},
 {id:'gemini-3.8-flash',label:'Gemini 3.8 Flash',available:true},{id:'gemini-3.5-flash',label:'Gemini 3.5 Flash',available:true}]};
export function chatEnv(environment='dev',patch={}){
 const user=`mw-credit-app-chat-${environment}@${PROJECT_ID}.iam`;
 return {...businessEnv(environment,'reader'),FOUNDATION_ROLE:'chat',DB_USER:user,RUNTIME_SERVICE_ACCOUNT:user+'.gserviceaccount.com',CHAT_MODELS_JSON:JSON.stringify(MODELS),...patch};
}

