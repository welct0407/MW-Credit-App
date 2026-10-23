/** R090 chat runtime: the business runtime with FOUNDATION_ROLE=chat (validated configuration, Firebase verifier,
 * Partners membership, IAM pool and the chat connection guard), whose chat branch builds the handler (services/chat/service.mjs). A
 * missing or disabled business activation fails closed: the chat service has no foundation mode. */
import {createProductionBusinessRuntime} from '../production/business-runtime.mjs';

/** Entry for services/chat/server.mjs. dependencies: those of createProductionBusinessRuntime plus
 * createVertexTransport(config) and log(record). */
export async function createChatRuntime(env,dependencies){
 if(env.FOUNDATION_ROLE!=='chat')throw Error('Invalid chat service configuration');
 const runtime=await createProductionBusinessRuntime(env,dependencies);
 if(!runtime.enabled){await runtime.close();throw Error('Invalid chat service configuration');}
 return runtime;
}
