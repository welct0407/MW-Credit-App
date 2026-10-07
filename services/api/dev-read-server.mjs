import http from 'node:http';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Connector, AuthTypes, IpAddressTypes } from '@google-cloud/cloud-sql-connector';
import pg from 'pg';
import { loadDevReadConfig } from './dev-read-config.mjs';
import { createFirebasePrincipalVerifier } from './firebase-principal.mjs';
import { createBorrowerReadStore } from './borrower-read-store.mjs';
import { createDevReadHandler } from './dev-read-handler.mjs';

const config = loadDevReadConfig(process.env);
const auth = getAuth(initializeApp({ credential: applicationDefault(), projectId: config.projectId }, 'dev-read'));
const connector = new Connector();
let pool;
let poolPromise;
const lazyPool = { async connect() {
  if (!poolPromise) poolPromise = (async () => {
    const options = await connector.getOptions({ instanceConnectionName: config.instance, ipType: IpAddressTypes.PUBLIC, authType: AuthTypes.IAM });
    pool = new pg.Pool({ ...options, user: config.dbUser, database: config.database, max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 5000, query_timeout: 7000 });
    return pool;
  })();
  return (await poolPromise).connect();
} };
const verifyPrincipal = createFirebasePrincipalVerifier((token, checkRevoked) => auth.verifyIdToken(token, checkRevoked), { ownerUid: config.ownerUid, identityMode: config.identityMode });
const store = createBorrowerReadStore({ pool: lazyPool, config });
if (!(await store.checkIdentity()).ok) throw new Error('DEV database identity unavailable');
const server = http.createServer(createDevReadHandler({ config, verifyPrincipal, store }));
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
process.on('SIGTERM', () => server.close(async () => { if (pool) await pool.end(); connector.close(); process.exit(0); }));
