import { loadProductionFoundationConfig } from './config.mjs';
import { createProductionPrincipalVerifier } from './principal.mjs';
import { createProductionFoundationHandler } from './handler.mjs';
export function createProductionFoundationRuntime(env, { initializeApp, applicationDefault, getAuth, completionLogger }) {
  const config = loadProductionFoundationConfig(env);
  const auth = getAuth(initializeApp({ credential: applicationDefault(), projectId: config.projectId }, `production-foundation-${config.serviceRole}`));
  const verifyPrincipal = createProductionPrincipalVerifier((token, revoked) => auth.verifyIdToken(token, revoked), config);
  return createProductionFoundationHandler({ config, verifyPrincipal, completionLogger });
}
