export const DEV_PROJECT = 'clever-oasis-508610-n7';
export const DEV_INSTANCE = DEV_PROJECT + ':asia-southeast1:appsheet-pg-prod-20260914';
export const OWNER_EMAIL = 'welct0407@mw-credit.com';
export function loadDevReadConfig(env) {
  if (env.APP_ENV !== 'dev' || env.AUTH_MODE !== 'firebase' || env.FIREBASE_PROJECT_ID !== DEV_PROJECT || env.DB_NAME !== 'loan_manager_dev' || env.INSTANCE_CONNECTION_NAME !== DEV_INSTANCE) throw new Error('Invalid DEV read configuration');
  if (env.DB_USER !== 'mw-credit-app-read-dev@clever-oasis-508610-n7.iam') throw new Error('Invalid DEV reader identity');
  if (!['email-bootstrap', 'uid-pinned'].includes(env.OWNER_IDENTITY_MODE)) throw new Error('Missing explicit owner identity mode');
  if (env.OWNER_IDENTITY_MODE === 'uid-pinned' && (typeof env.OWNER_FIREBASE_UID !== 'string' || !env.OWNER_FIREBASE_UID.trim() || env.OWNER_FIREBASE_UID.length > 128)) throw new Error('Missing pinned owner UID');
  if (env.ALLOWED_WEB_ORIGIN !== undefined) throw new Error('Legacy DEV browser origin configuration is forbidden');
  let parsedOrigins;
  try {
    if (typeof env.ALLOWED_WEB_ORIGINS !== 'string') throw new Error();
    parsedOrigins = JSON.parse(env.ALLOWED_WEB_ORIGINS);
  } catch { throw new Error('Invalid DEV browser origins'); }
  const fallbackOrigin = 'https://mw-credit-app-dev-737787224638.web.app';
  const customOrigin = 'https://dev-lm.mw-credit.com';
  // Exact strings also reject normalized variants, credentials, ports and URL suffixes.
  if (!Array.isArray(parsedOrigins) || parsedOrigins.length < 1 || parsedOrigins.length > 2
    || !parsedOrigins.includes(fallbackOrigin) || new Set(parsedOrigins).size !== parsedOrigins.length
    || parsedOrigins.some(origin => origin !== fallbackOrigin && origin !== customOrigin)) throw new Error('Invalid DEV browser origins');
  const origins = Object.freeze([...parsedOrigins]);
  if (env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Authentication emulator is forbidden');
  return Object.freeze({ projectId: DEV_PROJECT, database: env.DB_NAME, instance: DEV_INSTANCE, dbUser: env.DB_USER, origins, ownerEmail: OWNER_EMAIL, ownerUid: env.OWNER_FIREBASE_UID, identityMode: env.OWNER_IDENTITY_MODE });
}
