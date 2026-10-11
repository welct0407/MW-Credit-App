const DEV_PROJECT = 'clever-oasis-508610-n7';
const projectPattern = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const fail = () => { throw Error('Invalid production foundation configuration'); };
/** Explicit inventory bindings are validated here; this foundation never opens a data client. */
export function loadProductionFoundationConfig(env) {
  const projectId = env.APPLICATION_PROJECT_ID;
  if (env.APP_ENV !== 'prod' || env.FOUNDATION_MODE !== 'foundation'
    || !['reader', 'command'].includes(env.FOUNDATION_ROLE)
    || !projectPattern.test(projectId ?? '') || projectId === DEV_PROJECT
    || !/^[1-9][0-9]{5,19}$/.test(env.APPLICATION_PROJECT_NUMBER ?? '') || env.APPLICATION_PROJECT_NUMBER === '737787224638'
    || env.AUTH_MODE !== 'firebase' || env.FIREBASE_PROJECT_ID !== projectId
    || env.OWNER_IDENTITY_MODE !== 'uid-pinned') fail();
  const serviceRole = env.FOUNDATION_ROLE;
  const runtimeIdentity = `mw-credit-app-${serviceRole === 'reader' ? 'read' : 'command'}-prod@${projectId}.iam.gserviceaccount.com`;
  if (env.RUNTIME_SERVICE_ACCOUNT !== runtimeIdentity
    || env.DATA_PROJECT_ID !== DEV_PROJECT || env.DB_NAME !== 'loan_manager_prod'
    || env.INSTANCE_CONNECTION_NAME !== `${DEV_PROJECT}:asia-southeast1:appsheet-pg-prod-20260914`) fail();
  const ownerUid = env.PROD_OWNER_FIREBASE_UID;
  if (typeof ownerUid !== 'string' || !ownerUid || ownerUid.length > 128 || ownerUid !== ownerUid.trim() || /[\s\u0000-\u001f\u007f]/u.test(ownerUid)) fail();
  const prefix = `projects/${projectId}/secrets/mw-credit-app-prod-owner-identity/versions/`;
  if (typeof env.OWNER_IDENTITY_SECRET_VERSION !== 'string' || !env.OWNER_IDENTITY_SECRET_VERSION.startsWith(prefix)
    || !/^[1-9][0-9]*$/.test(env.OWNER_IDENTITY_SECRET_VERSION.slice(prefix.length))) fail();
  const forbidden = ['OWNER_FIREBASE_UID', 'ALLOWED_WEB_ORIGIN', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_AUTH_TENANT_ID',
    'STORAGE_EMULATOR_HOST', 'DATABASE_URL', 'DB_USER', 'PGHOST', 'PGHOSTADDR', 'PGDATABASE', 'PGPORT', 'PGUSER', 'PGPASSWORD',
    'PGSERVICE', 'PGSERVICEFILE', 'PGPASSFILE', 'COMMAND_MODE', 'COMMAND_FIXTURE_JSON', 'RECEIPT_NATIVE_CATALOG_JSON',
    'RECEIPT_BUCKET', 'RECEIPT_SQL_PREFIX', 'RECEIPT_OBJECT_PREFIX', 'READINESS_ENABLED'];
  if (forbidden.some(key => env[key] !== undefined)) fail();
  const site = env.HOSTING_SITE_ID;
  if (typeof site !== 'string' || !/^[a-z0-9][a-z0-9-]{4,28}[a-z0-9]$/.test(site) || site === 'mw-credit-app-dev-737787224638') fail();
  let origins;
  try { origins = JSON.parse(env.ALLOWED_WEB_ORIGINS); } catch { fail(); }
  if (!Array.isArray(origins) || origins.length < 1 || origins.length > 2 || new Set(origins).size !== origins.length
    || !origins.includes('https://lm.mw-credit.com') || origins.some(origin => !['https://lm.mw-credit.com', `https://${site}.web.app`].includes(origin))) fail();
  return Object.freeze({ environment: 'prod', mode: 'foundation', projectId, serviceRole, runtimeIdentity,
    issuer: `https://securetoken.google.com/${projectId}`, ownerUid, ownerEmail: 'welct0407@mw-credit.com',
    origins: Object.freeze([...origins]), readinessEnabled: false });
}
