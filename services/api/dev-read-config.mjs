export const DEV_PROJECT = 'clever-oasis-508610-n7';
export const DEV_INSTANCE = DEV_PROJECT + ':asia-southeast1:appsheet-pg-prod-20260914';
export const OWNER_EMAIL = 'welct0407@mw-credit.com';
export function loadDevReadConfig(env) {
  if (env.APP_ENV !== 'dev' || env.AUTH_MODE !== 'firebase' || env.FIREBASE_PROJECT_ID !== DEV_PROJECT || env.DB_NAME !== 'loan_manager_dev' || env.INSTANCE_CONNECTION_NAME !== DEV_INSTANCE) throw new Error('Invalid DEV read configuration');
  if (env.DB_USER !== 'mw-credit-app-read-dev@clever-oasis-508610-n7.iam') throw new Error('Invalid DEV reader identity');
  if (!['email-bootstrap', 'uid-pinned'].includes(env.OWNER_IDENTITY_MODE)) throw new Error('Missing explicit owner identity mode');
  if (env.OWNER_IDENTITY_MODE === 'uid-pinned' && (typeof env.OWNER_FIREBASE_UID !== 'string' || !env.OWNER_FIREBASE_UID.trim() || env.OWNER_FIREBASE_UID.length > 128)) throw new Error('Missing pinned owner UID');
  const origin = env.ALLOWED_WEB_ORIGIN;
  if (origin !== 'https://mw-credit-app-dev-737787224638.web.app') throw new Error('Invalid DEV browser origin');
  if (env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Authentication emulator is forbidden');
  return Object.freeze({ projectId: DEV_PROJECT, database: env.DB_NAME, instance: DEV_INSTANCE, dbUser: env.DB_USER, origin, ownerEmail: OWNER_EMAIL, ownerUid: env.OWNER_FIREBASE_UID, identityMode: env.OWNER_IDENTITY_MODE });
}
