import {loadAgentConversationPolicy} from './policy.mjs';
import {createAgentConversationHandler} from './handler.mjs';
import {createConversationReadProvider} from './read-provider.mjs';
import {createConversationCommandProvider} from './command-provider.mjs';
import {conversationCatalogue,conversationResources} from './catalogue.mjs';

export function createAgentConversationRuntime({next,env,environment,pool,guardConnection,afterCommit,verifyOidc}) {
  const policy=loadAgentConversationPolicy(env,environment);
  const reads=policy?createConversationReadProvider({pool,guardConnection,policy,
    catalogue:conversationCatalogue,resources:conversationResources}):null;
  const commands=policy?createConversationCommandProvider({pool,guardConnection,policy,afterCommit}):null;
  return createAgentConversationHandler({next,policy,verifyOidc,providers:policy?{...reads,...commands}:null});
}
