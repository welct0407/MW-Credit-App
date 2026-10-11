import {createAgentReceiptHandler,loadAgentReceiptPolicy} from '../agent-receipts/runtime.mjs';
import {createPostCommitWake,loadDispatchConfig} from '../notifications/postcommit.mjs';
import {createProductionCommandReceipts} from '../receipts/command-receipts.mjs';
import {createProductionGcsReceiptTransport} from '../receipts/gcs-transport.mjs';
import {createProductionSourceReceiptReader} from '../receipts/production-source-receipts.mjs';
import {decodeCommandReceipt,decodeSourceReceipt} from '../receipts/decode-image.mjs';
import {notificationHandler} from '../notifications/handler.mjs';
import {createNotificationStore} from '../notifications/store.mjs';
import { loadProductionBusinessConfig } from './business-config.mjs';
import { createBusinessPrincipalVerifier } from './business-principal.mjs';
import { createBusinessMembership } from './business-policy.mjs';
import { createProductionConnectionGuard } from './business-target.mjs';
import { createBorrowerReadStore } from '../api/borrower-read-store.mjs';
import { createDevReadHandler } from '../api/dev-read-handler.mjs';
import { createEnvironmentCommandStore } from '../payment-command/store.mjs';
import { createEnvironmentCommandHandler } from '../payment-command/handler.mjs';
import { createProductionFoundationRuntime } from './runtime.mjs';
/** Separate opt-in candidate. Existing foundation server never imports this module. */
export async function createProductionBusinessRuntime(env,dependencies) {
  const config=loadProductionBusinessConfig(env);
  if(!config)return {enabled:false,handler:createProductionFoundationRuntime(env,dependencies),close:async()=>{}};
  const {initializeApp,applicationDefault,getAuth,createPool,completionLogger}=dependencies;
  const auth=getAuth(initializeApp({credential:applicationDefault(),projectId:config.projectId},`production-business-${config.serviceRole}`));
  const verifyPrincipal=createBusinessPrincipalVerifier((token,revoked)=>auth.verifyIdToken(token,revoked));
  const membership=createBusinessMembership(config),guardConnection=createProductionConnectionGuard(config);
  const pool=await createPool(config);
  try {
    const client=await pool.connect();let healthy=false;
    try{await guardConnection(client);healthy=true;}finally{client.release(!healthy);}
    let handler;
    if(config.serviceRole==='reader') {
      const store=createBorrowerReadStore({pool,config,source:'prod',guardConnection,emailAllowed:membership.emailAllowed,resolveMember:membership.resolveMember});
      handler=createDevReadHandler({config,verifyPrincipal,store,completionLogger});
    } else {
      // Receipt adapters are intentionally absent until a separate PROD mapping/catalog is verified.
      // Business commands without receipts use the existing canonical transaction/journal implementations.
      let receiptAdapter,sourceReceiptReader;
      if(config.receiptCatalog){const storage=await dependencies.createStorage(config);receiptAdapter=createProductionCommandReceipts({storage:createProductionGcsReceiptTransport(storage),decodeImage:decodeCommandReceipt,compatibility:config.receiptCompatibility});sourceReceiptReader=createProductionSourceReceiptReader({catalog:config.receiptCatalog,storage,decodeImage:decodeSourceReceipt});}
      const afterCommit=createPostCommitWake(loadDispatchConfig(env,'prod'),{log:completionLogger});
      const store=createEnvironmentCommandStore({afterCommit,receiptAdapter,sourceReceiptReader,pool,guardConnection,principalAllowed:membership.principalAllowed,resolveActor:membership.resolveActor,actorIssuer:config.issuer});
      handler=createEnvironmentCommandHandler({config,verifyPrincipal,store,completionLogger});
      if(config.notificationsEnabled)handler=notificationHandler({next:handler,enabled:true,verifyPrincipal,origins:config.origins,publicKey:config.pushPublicKey,store:createNotificationStore({pool,guardConnection,resolveActor:membership.resolveActor,issuer:config.issuer})});
      handler=createAgentReceiptHandler({next:handler,policy:loadAgentReceiptPolicy(env,'prod'),pool,guardConnection,afterCommit,verifyOidc:dependencies.verifyOidc});
    }
    return {enabled:true,handler,close:()=>pool.end()};
  } catch(error) {await pool.end();throw error;}
}
