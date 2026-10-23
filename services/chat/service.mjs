/** R090 chat service wiring for business-runtime.mjs (chat branch): the RPC store, the SQL tool on the read role
 * and the per-turn tool bridge over the in-process native read provider. */
import {createConversationReadProvider} from '../agent-conversations/read-provider.mjs';
import {conversationCatalogue,conversationResources} from '../agent-conversations/catalogue.mjs';
import {createChatHandler} from './handler.mjs';
import {createChatStore} from './store.mjs';
import {createChatTools} from './tools.mjs';
import {createSqlTool} from './sql-tool.mjs';
import {chatRoles} from './guard.mjs';

/** In-process native reads for one turn's actor (Archie resolution 10): the read provider with an actor check that
 * re-reads Partners by Row ID and the actor's login, instead of the agent policy and its Instagram opt-in. */
export function chatReadProvider({pool,guardConnection,actor}){
 return createConversationReadProvider({pool,guardConnection,policy:null,catalogue:conversationCatalogue,resources:conversationResources,
  resolveActor:async(client,_policy,_workload,partnerId)=>{
   const rows=(await client.query('SELECT "Row ID" AS id,lower(btrim("Login Email")) AS email FROM public."Partners" WHERE "Row ID"=$1',[partnerId])).rows;
   if(rows.length!==1||partnerId!==actor.partnerId||rows[0].email!==actor.loginEmail)throw Object.assign(Error('access_denied'),{code:'42501'});
   return actor;
  }});
}

/** The guard for in-process native reads: the connection guard, then SET LOCAL ROLE to the read role (the IAM user
 * holds it WITH INHERIT FALSE, SET TRUE), so business relations are read only under that role, inside the read
 * provider's own READ ONLY transaction. */
export const readRoleGuard=(guardConnection,readRole)=>async client=>{
 await guardConnection(client);
 await client.query(`SET LOCAL ROLE "${readRole.replaceAll('"','""')}"`);
};

/** The chat handler of a validated chat configuration (called from business-runtime.mjs). */
export function createChatServiceHandler({config,verifyPrincipal,membership,pool,guardConnection,transport,completionLogger,log,afterCommit}){
 const readRole=chatRoles(config.environment).read;
 const store=createChatStore({pool,guardConnection,resolveActor:membership.resolveActor,issuer:config.issuer,readRole,afterCommit,log});
 const sqlTool=createSqlTool({pool,guardConnection,dbUser:config.dbUser,readRole,database:config.database});
 const readGuard=readRoleGuard(guardConnection,readRole);
 const createTools=actor=>createChatTools({readProvider:chatReadProvider({pool,guardConnection:readGuard,actor}),sqlTool,actor});
 return createChatHandler({config,verifyPrincipal,store,createTools,transport,completionLogger,log});
}

