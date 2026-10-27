import {createAgentReceiptHandler,loadAgentReceiptPolicy} from '../agent-receipts/runtime.mjs';
import {createPostCommitWake,loadDispatchConfig} from '../notifications/postcommit.mjs';
import {createCommandReceipts,createProductionCommandReceipts} from '../receipts/command-receipts.mjs';
import {createGcsReceiptTransport,createProductionGcsReceiptTransport} from '../receipts/gcs-transport.mjs';
import {createProductionSourceReceiptReader} from '../receipts/production-source-receipts.mjs';
import {createSourceReceiptReader,createSourceGcsReadTransport} from '../receipts/source-receipts.mjs';
import {decodeCommandReceipt,decodeSourceReceipt} from '../receipts/decode-image.mjs';
import {createRecognizerClient} from '../receipts/recognizer-client.mjs';
import {notificationHandler} from '../notifications/handler.mjs';
import {createNotificationStore} from '../notifications/store.mjs';
import {createConnectionGuard} from '../lib/connection-guard.mjs';
import {createChatConnectionGuard} from '../chat/guard.mjs';
import {createChatServiceHandler} from '../chat/service.mjs';
import { loadBusinessConfig } from './business-config.mjs';
import { createBusinessPrincipalVerifier } from './business-principal.mjs';
import { createBusinessMembership } from './business-policy.mjs';
import { createBorrowerReadStore } from '../api/borrower-read-store.mjs';
import { createReadHandler } from '../api/read-handler.mjs';
import { createEnvironmentCommandStore } from '../payment-command/store.mjs';
import { createEnvironmentCommandHandler } from '../payment-command/handler.mjs';
import { createProductionFoundationRuntime } from './runtime.mjs';
/** Receipt adapters for the validated environment; none unless that environment enabled receipts. */
async function receiptAdapters(config,dependencies){
  if(config.environment==='prod'){
    if(!config.receiptCatalog)return {};
    const storage=await dependencies.createStorage(config);
    return {receiptAdapter:createProductionCommandReceipts({storage:createProductionGcsReceiptTransport(storage),decodeImage:decodeCommandReceipt,compatibility:config.receiptCompatibility}),
      sourceReceiptReader:createProductionSourceReceiptReader({catalog:config.receiptCatalog,storage,decodeImage:decodeSourceReceipt})};
  }
  if(!config.nativeReceiptDescriptors)return {};
  const storage=await dependencies.createStorage(config),nativeDescriptors=config.nativeReceiptDescriptors;
  return {receiptAdapter:createCommandReceipts({storage:createGcsReceiptTransport(storage),decodeImage:decodeCommandReceipt,compatibility:config.receiptCompatibility}),
    sourceReceiptReader:createSourceReceiptReader({storage:createSourceGcsReadTransport(storage,{nativeDescriptors}),decodeImage:decodeSourceReceipt,nativeDescriptors})};
}
/** DEV and PROD business runtime. Without activation PROD keeps the foundation; DEV fails closed there. */
export async function createProductionBusinessRuntime(env,dependencies) {
  const config=loadBusinessConfig(env);
  if(!config)return {enabled:false,handler:createProductionFoundationRuntime(env,dependencies),close:async()=>{}};
  const {initializeApp,applicationDefault,getAuth,createPool,completionLogger}=dependencies;
  const auth=getAuth(initializeApp({credential:applicationDefault(),projectId:config.projectId},`${config.environment==='prod'?'production':'dev'}-business-${config.serviceRole}`));
  const verifyPrincipal=createBusinessPrincipalVerifier((token,revoked)=>auth.verifyIdToken(token,revoked));
  const membership=createBusinessMembership(config),guardConnection=config.serviceRole==='chat'?createChatConnectionGuard(config):createConnectionGuard(config);
  const pool=await createPool(config);
  try {
    const client=await pool.connect();let healthy=false;
    try{await guardConnection(client);healthy=true;}finally{client.release(!healthy);}
    let handler;
    if(config.serviceRole==='chat') {
      // R090: the chat service never installs the command, notification or agent handlers.
      const gemini=await dependencies.createVertexTransport(config);
      // R102: claude-* models go through the VM chat relay when CHAT_RELAY_URL is configured.
      const claude=config.chatRelay&&dependencies.createClaudeTransport?await dependencies.createClaudeTransport(config):null;
      const transport=claude?{gemini,claude}:gemini;
      // Batch 2 (B1): the chat reply push uses the command service's post-commit dispatch wake (three env keys, validated here).
      const afterCommit=createPostCommitWake(loadDispatchConfig(env,config.environment),{log:completionLogger});
      handler=createChatServiceHandler({config,verifyPrincipal,membership,pool,guardConnection,transport,completionLogger,log:dependencies.log,afterCommit});
    } else if(config.serviceRole==='reader') {
      const store=createBorrowerReadStore({pool,config,source:config.environment,guardConnection,emailAllowed:membership.emailAllowed,resolveMember:membership.resolveMember});
      handler=createReadHandler({config,verifyPrincipal,store,completionLogger});
    } else {
      // Business commands without receipts use the existing canonical transaction/journal implementations.
      const {receiptAdapter,sourceReceiptReader}=await receiptAdapters(config,dependencies);
      const afterCommit=createPostCommitWake(loadDispatchConfig(env,config.environment),{log:completionLogger});
      const recognizer=config.receiptRecognition&&receiptAdapter?createRecognizerClient({url:config.receiptRecognition.url,...(dependencies.fetch?{fetch:dependencies.fetch}:{})}):null;
      const store=createEnvironmentCommandStore({afterCommit,receiptAdapter,sourceReceiptReader,recognizer,pool,guardConnection,principalAllowed:membership.principalAllowed,resolveActor:membership.resolveActor,actorIssuer:config.issuer});
      handler=createEnvironmentCommandHandler({config,verifyPrincipal,store,completionLogger});
      if(config.notificationsEnabled)handler=notificationHandler({next:handler,enabled:true,offlineDataset:true,verifyPrincipal,origins:config.origins,publicKey:config.pushPublicKey,completionLogger,store:createNotificationStore({pool,guardConnection,resolveActor:membership.resolveActor,issuer:config.issuer})});
      handler=createAgentReceiptHandler({next:handler,policy:loadAgentReceiptPolicy(env,config.environment),pool,guardConnection,afterCommit,verifyOidc:dependencies.verifyOidc});
    }
    return {enabled:true,handler,close:()=>pool.end()};
  } catch(error) {await pool.end();throw error;}
}
