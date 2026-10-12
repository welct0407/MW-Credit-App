import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import http from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { disposablePool } from '../../scripts/rehearsal/disposable-pool.mjs';
import { seedPaymentFixture } from '../../scripts/rehearsal/payment-fixture.mjs';
import { planApplicationRole, reconcileApplicationRole } from '../../scripts/database/app-role-policy.mjs';
import { captureApplicationRoleSnapshot, recoverApplicationRole, provisionApplicationRuntimeMembership, runDevelopmentPostMigrationHook } from '../../scripts/database/application-role-tooling.mjs';
import { attestDisposableApplicationTarget } from '../../services/payment-command/application-target.mjs';
import { createApplicationRoleCommandStore } from '../../services/payment-command/store.mjs';
import { createPaymentCommandHandler } from '../../services/payment-command/handler.mjs';
import { createCommandPrincipalVerifier } from '../../services/payment-command/principal.mjs';
import { DEV_PROJECT, OWNER_EMAIL } from '../../services/api/dev-read-config.mjs';
import { createDevReceiptAdapter, generatedReceiptPaths, DEV_RECEIPT_MAPPING } from '../../services/receipts/dev-receipt-adapter.mjs';
import { decodeReceiptImage } from '../../scripts/rehearsal/decode-receipt-image.mjs';

let admin, app, proof;
const runtime = 'mw_app_dev_c_fixture', creator = 'mw_4f_creator_c';
const config = { database: 'payment_rehearsal', creators: ['postgres', creator] };
const port = Number(process.env.PAYMENT_REHEARSAL_PORT), directory = process.env.PAYMENT_REHEARSAL_DIRECTORY;
const principal = { ok: true, subject: 'synthetic-4f-independent-owner', email: OWNER_EMAIL };
const actor = { issuer: 'https://securetoken.google.com/' + DEV_PROJECT, subject: principal.subject, partnerId: '4A-ACTOR', loginEmail: OWNER_EMAIL };
let png;
async function policy(apply = false, selectedConfig = config) {
  const client = await admin.connect();
  try { return await reconcileApplicationRole(client, selectedConfig, { apply }); }
  finally { client.release(); }
}
before(async () => {
  admin = await disposablePool(79);
  png = execFileSync(process.env.CLOUDSDK_PYTHON, ['-c', 'from PIL import Image;import sys;Image.new("RGB",(2,2),(255,128,0)).save(sys.stdout.buffer,format="PNG")'], { windowsHide: true });
  await admin.query('CREATE ROLE ' + runtime + ' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; GRANT mw_app_dev TO ' + runtime);
  await admin.query('CREATE ROLE ' + creator + ' NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; GRANT CREATE,USAGE ON SCHEMA public TO ' + creator);
  assert.deepEqual((await policy()).violations, []); await policy(true);
  app = new pg.Pool({ host: '127.0.0.1', port, database: 'payment_rehearsal', user: runtime, password: '', max: 4 });
  proof = await attestDisposableApplicationTarget({ adminPool: admin, expectedDirectory: directory, runtimeUser: runtime, registeredCreators: config.creators });
});
after(async () => { await app?.end(); await admin?.end(); });

async function fixture(suffix, pool = admin) {
  const prefix = '4A-4F-C-' + suffix;
  await seedPaymentFixture(pool, prefix);
  await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=\'4A-ACTOR\'', [OWNER_EMAIL]);
  const day = (await admin.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day")).rows[0].day;
  return { schemaVersion: 3, requestId: randomUUID(), borrowerId: prefix + '-B', selectedChargeIds: [prefix + '-C1', prefix + '-C2'],
    cashAccountId: '4A-RECEIVE', paymentDate: day, amountReceived: '330', paymentMethod: 'Bank Transfer',
    allocationMethod: 'Selected Charges', notes: '  ไทย😀\r\n<Notes> ', receiptId: null };
}
async function counts(id) {
  return (await admin.query('SELECT (SELECT count(*) FROM pwa_payment_commands WHERE request_id=$1)::int AS journal,(SELECT count(*) FROM "Payments" WHERE "Row ID"=\'pwa:\'||$1)::int AS payments', [id])).rows[0];
}
function wrappedPool(intercept) {
  const sql = [], released = [];
  return { sql, released, async connect() {
    const client = await app.connect();
    return { async query(text, args) { sql.push(text); return intercept ? intercept(text, args, client) : client.query(text, args); },
      release(discard) { released.push(discard); client.release(discard); } };
  } };
}
async function withHttp({ pool = app, resolveReceipt } = {}, action) {
  const store = createApplicationRoleCommandStore({ pool, targetAttestation: proof, resolveReceipt });
  let handler; const verified = [];
  const server = http.createServer((req, res) => handler(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const verifyPrincipal = createCommandPrincipalVerifier({ ownerUid: principal.subject, verifyIdToken: async (token, revoked) => {
    assert.equal(token, 'synthetic-4f-token'); verified.push(revoked);
    return { aud: DEV_PROJECT, iss: actor.issuer, sub: principal.subject, email: OWNER_EMAIL, email_verified: true,
      firebase: { sign_in_provider: 'google.com' }, iat: 1, auth_time: 1, exp: Math.floor(Date.now() / 1000) + 3600 };
  } });
  handler = createPaymentCommandHandler({ origins: [origin], verifyPrincipal, store });
  async function request(path, body) {
    const response = await fetch(origin + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer synthetic-4f-token', Origin: origin, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  }
  try { return await action({ post: command => request('/api/payment-commands', command), status: id => request('/api/payment-commands/' + id), verified }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const permissionDenied = error => error.code === '42501';
function storageFixture() {
  const objects = new Map(), calls = [];
  return { objects, calls, storage: {
    async create(input) {
      calls.push({ operation: 'create', generationZero: input.ifGenerationMatch === 0 });
      assert.equal(input.ifGenerationMatch, 0);
      if (objects.has(input.key)) throw Object.assign(Error('Synthetic create collision'), { code: 'PRECONDITION_FAILED' });
      const object = { bytes: Buffer.from(input.bytes), mimeType: input.mimeType, metadata: { ...input.metadata }, generation: '17' };
      objects.set(input.key, object); return { generation: object.generation };
    },
    async read(input) {
      calls.push({ operation: 'read', exactGeneration: input.generation !== undefined });
      const object = objects.get(input.key);
      if (!object) throw Object.assign(Error('Synthetic missing object'), { code: 'OBJECT_NOT_FOUND' });
      return { ...object, bytes: Buffer.from(object.bytes), metadata: { ...object.metadata } };
    },
  } };
}
function adapter(storage) {
  return createDevReceiptAdapter({ storage, decodeImage: decodeReceiptImage,
    compatibility: { ...DEV_RECEIPT_MAPPING, status: 'synthetic-transport-test', evidenceReference: 'Independent local transport test; no real rendering claim' } });
}

test('F-C01 true runtime LOGIN identity and administrative/owner escalation denied', async () => {
  const row = (await app.query("SELECT current_user AS principal,session_user AS session,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,pg_has_role(session_user,'mw_app_dev_journal_owner','MEMBER') AS journal_owner FROM pg_roles WHERE rolname=session_user")).rows[0];
  assert.equal(row.principal, runtime); assert.equal(row.session, runtime);
  for (const key of ['rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolreplication', 'rolbypassrls', 'journal_owner']) assert.equal(row[key], false);
  for (const sql of ['SET ROLE postgres', 'SET ROLE mw_app_dev_journal_owner', 'SET ROLE ' + creator, 'CREATE ROLE forbidden_c', 'CREATE DATABASE forbidden_c']) await assert.rejects(app.query(sql), permissionDenied);
  assert.equal((await app.query("SELECT has_schema_privilege(current_user,'public','CREATE') AS allowed")).rows[0].allowed, false);
});

test('F-C02 ordinary operational/OLAP breadth succeeds and governing payment triggers run as runtime', async () => {
  const command = await fixture('BREADTH', app);
  await app.query('UPDATE "Borrowers" SET "Borrower Name"=\'Synthetic edited borrower\' WHERE "Row ID"=$1', [command.borrowerId]);
  for (const view of ['reporting_borrower_payments_v1', 'reporting_borrower_loan_facts_v1']) {
    await app.query('SELECT * FROM public.' + view + ' LIMIT 0');
  }
  await app.query('INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Payment Method","Allocation Method","Selected Charge IDs","Created By","Notes") VALUES($1,$2,$3,\'Processing\',330::money,$4,\'Bank Transfer\',\'Selected Charges\',$5,$6,$7)',
    ['4A-4F-C-DIRECT', command.borrowerId, command.cashAccountId, command.paymentDate, command.selectedChargeIds.join(' , '), OWNER_EMAIL, command.notes]);
  const row = (await app.query('SELECT "Status","Posted Amount"::numeric::text AS amount FROM "Payments" WHERE "Row ID"=\'4A-4F-C-DIRECT\'')).rows[0];
  assert.equal(row.Status, 'Posted'); assert.equal(Number(row.amount), 330);
  await app.query('DELETE FROM "Payments" WHERE "Row ID"=\'4A-4F-C-DIRECT\'');
  assert.equal((await app.query("SELECT public.payment_reallocation_permitted('Payments','{}'::jsonb,'{}'::jsonb) AS allowed")).rows[0].allowed, false);
});

test('F-C03 registered second creator/future tables, views, sequences and invoker functions reconcile without feature edits', async () => {
  const client = await admin.connect();
  try {
    await client.query('BEGIN'); await client.query('SET LOCAL ROLE ' + creator);
    await client.query("CREATE TABLE public.future_c_second(id integer,value text); CREATE SEQUENCE public.future_c_second_seq; CREATE VIEW public.future_c_second_view AS SELECT * FROM public.future_c_second; CREATE FUNCTION public.future_c_second_echo(v text) RETURNS text LANGUAGE sql AS 'SELECT v'; REVOKE ALL ON FUNCTION public.future_c_second_echo(text) FROM PUBLIC");
    await client.query('COMMIT');
    await assert.rejects(app.query('SELECT * FROM future_c_second'), permissionDenied);
    assert.ok((await planApplicationRole(client, { database: config.database, creators: ['postgres'] })).violations.some(v => v.includes('Unregistered')));
    await policy(true);
    const fresh = new pg.Client({ host: '127.0.0.1', port, database: config.database, user: runtime, password: '' });
    await fresh.connect();
    try {
      await fresh.query("INSERT INTO future_c_second VALUES(1,'one'); UPDATE future_c_second SET value='two' WHERE id=1");
      assert.equal((await fresh.query('SELECT * FROM future_c_second_view')).rows[0].value, 'two');
      assert.equal((await fresh.query("SELECT future_c_second_echo('ok') AS value")).rows[0].value, 'ok');
      await fresh.query("SELECT nextval('future_c_second_seq')");
      await assert.rejects(fresh.query("SELECT setval('future_c_second_seq',99)"), permissionDenied);
      await fresh.query('DELETE FROM future_c_second WHERE id=1');
      await assert.rejects(fresh.query('TRUNCATE future_c_second'), permissionDenied);
    } finally { await fresh.end(); }
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await admin.query('DROP VIEW IF EXISTS future_c_second_view; DROP TABLE IF EXISTS future_c_second; DROP SEQUENCE IF EXISTS future_c_second_seq; DROP FUNCTION IF EXISTS future_c_second_echo(text)');
    client.release();
  }
});

test('F-C04 journal/Flyway/audit/cutover/permanent DDL protected under effective runtime privileges', async () => {
  for (const sql of [
    'INSERT INTO pwa_payment_commands(request_id) VALUES(\'' + randomUUID() + '\')',
    'UPDATE pwa_payment_commands SET outcome=outcome', 'DELETE FROM pwa_payment_commands', 'TRUNCATE pwa_payment_commands',
    'SELECT * FROM flyway_schema_history', 'UPDATE flyway_schema_history SET description=description',
    'UPDATE r005_cash_cutover_sources SET source_type=source_type', 'DELETE FROM r008_cash_account_cutover',
    'CREATE TABLE public.forbidden_c(id integer)', 'ALTER TABLE public."Borrowers" DISABLE TRIGGER ALL',
  ]) await assert.rejects(app.query(sql), permissionDenied);
  await app.query('SELECT * FROM pwa_payment_commands LIMIT 0');
  assert.equal((await app.query("SELECT has_table_privilege(current_user,$1,'SELECT WITH GRANT OPTION') AS allowed", ['public."Borrowers"'])).rows[0].allowed, false);
  const definers = (await admin.query("SELECT p.proname,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY($1)", [['pwa_submit_selected_charges_v1', 'pwa_command_status_v1']])).rows;
  assert.equal(definers.length, 2);
  for (const routine of definers) { assert.equal(routine.owner, 'mw_app_dev_journal_owner'); assert.equal(routine.prosecdef, true); assert.ok(routine.proconfig.some(value => value.startsWith('search_path='))); }
  const audit = (await admin.query("SELECT has_schema_privilege($1,'agent_audit','USAGE') AS allowed", [runtime])).rows[0];
  assert.equal(audit.allowed, false);
  await admin.query('CREATE ROLE mw_4f_unrelated_c LOGIN; GRANT EXECUTE ON FUNCTION public.pwa_command_status_v1(uuid,text,text) TO mw_4f_unrelated_c');
  const unrelated = new pg.Client({ host: '127.0.0.1', port, database: config.database, user: 'mw_4f_unrelated_c', password: '' });
  await unrelated.connect();
  try { await assert.rejects(unrelated.query('SELECT pwa_command_status_v1($1,$2,$3)', [randomUUID(), actor.issuer, actor.subject]), permissionDenied); }
  finally { await unrelated.end(); await admin.query('REVOKE EXECUTE ON FUNCTION public.pwa_command_status_v1(uuid,text,text) FROM mw_4f_unrelated_c'); }
});

test('F-C05 future governance tagging, reserved names and unknown definer stay outside capability', async () => {
  await admin.query("CREATE TABLE secret_c_reserved(id integer); CREATE TABLE future_c_governance(id integer); COMMENT ON TABLE future_c_governance IS 'mw-access:governance test'; CREATE FUNCTION future_c_definer() RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'; REVOKE ALL ON FUNCTION future_c_definer() FROM PUBLIC");
  try {
    await policy(true);
    for (const sql of ['SELECT * FROM secret_c_reserved', 'INSERT INTO future_c_governance VALUES(1)', 'SELECT future_c_definer()']) await assert.rejects(app.query(sql), permissionDenied);
    await admin.query('GRANT EXECUTE ON FUNCTION future_c_definer() TO PUBLIC');
    assert.ok((await policy()).violations.some(v => v.includes('PUBLIC')));
  } finally { await admin.query('DROP TABLE secret_c_reserved; DROP TABLE future_c_governance; DROP FUNCTION future_c_definer()'); }
});

test('F-C06 incompatible default ACLs and protected relation PUBLIC access are readiness findings', async () => {
  await admin.query('ALTER DEFAULT PRIVILEGES FOR ROLE ' + creator + ' IN SCHEMA public GRANT SELECT,INSERT ON TABLES TO mw_app_dev');
  try { assert.ok((await policy()).violations.length > 0); }
  finally { await admin.query('ALTER DEFAULT PRIVILEGES FOR ROLE ' + creator + ' IN SCHEMA public REVOKE SELECT,INSERT ON TABLES FROM mw_app_dev'); }
  await admin.query('CREATE TABLE secret_c_public(id integer); GRANT SELECT ON secret_c_public TO PUBLIC');
  try {
    assert.equal((await app.query("SELECT has_table_privilege(current_user,'secret_c_public','SELECT') AS allowed")).rows[0].allowed, true);
    assert.ok((await policy()).violations.length > 0, 'Effective PUBLIC access to protected table must be reported, not erased by APP revoke');
  } finally { await admin.query('DROP TABLE secret_c_public'); }
});

test('F-C07 actual runtime HTTP journal posting/concurrent replay, source change and current actor denial', async () => {
  const command = await fixture('HTTP');
  await withHttp({}, async s => {
    const responses = await Promise.all([s.post(command), s.post(command)]);
    assert.ok(responses.every(r => r.status === 200)); assert.deepEqual(responses[0].body, responses[1].body);
    const original = responses[0].body; assert.equal(original.originalOutcome.status, 'posted');
    assert.equal((await s.post({ ...command, notes: 'changed' })).status, 409);
    assert.deepEqual((await s.status(command.requestId)).body, original);
    await app.query('UPDATE "Payments" SET "Notes"=\'Synthetic corrected source\' WHERE "Row ID"=$1', ['pwa:' + command.requestId]);
    assert.deepEqual((await s.post(command)).body, original);
    await app.query('DELETE FROM "Payments" WHERE "Row ID"=$1', ['pwa:' + command.requestId]);
    assert.deepEqual((await s.status(command.requestId)).body, original);
    await admin.query('UPDATE "Partners" SET "Login Email"=\'unmapped@example.invalid\' WHERE "Row ID"=\'4A-ACTOR\'');
    try { assert.equal((await s.post(command)).status, 403); assert.equal((await s.status(command.requestId)).status, 403); }
    finally { await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=\'4A-ACTOR\'', [OWNER_EMAIL]); }
    assert.ok(s.verified.every(value => value === true));
  });
  assert.deepEqual(await counts(command.requestId), { journal: 1, payments: 0 });
});

test('F-C08 true runtime commit acknowledgement loss preserves Unknown, quarantine and fresh status recovery', async () => {
  const command = await fixture('ACK');
  let lost = false;
  const wrapped = wrappedPool(async (sql, args, client) => {
    const result = await client.query(sql, args);
    if (sql === 'COMMIT' && !lost) { lost = true; throw Error('Synthetic lost acknowledgement'); }
    return result;
  });
  await withHttp({ pool: wrapped }, async s => {
    const result = await s.post(command); assert.equal(result.status, 503); assert.equal(result.body.code, 'command_outcome_unknown');
  });
  assert.deepEqual(wrapped.released, [true]);
  await withHttp({}, async s => { assert.equal((await s.status(command.requestId)).body.originalOutcome.status, 'posted'); });
  assert.deepEqual(await counts(command.requestId), { journal: 1, payments: 1 });
});

test('F-C09 opaque attestation and changed target/identity/role metadata deny before financial execution', async () => {
  assert.throws(() => createApplicationRoleCommandStore({ pool: app, targetAttestation: { ...proof } }));
  const command = await fixture('GUARD');
  for (const key of ['database', 'port', 'session', 'principal', 'rolsuper', 'member', 'owner_member']) {
    const wrapped = wrappedPool(async (sql, args, client) => {
      const result = await client.query(sql, args);
      if (sql.includes('inet_server_port()')) {
        result.rows[0][key] = ['rolsuper', 'owner_member'].includes(key) ? true : key === 'member' ? false : key === 'port' ? port + 1 : 'wrong-target';
      }
      return result;
    });
    await withHttp({ pool: wrapped }, async s => {
      const result = await s.post(command); assert.equal(result.status, 503); assert.equal(result.body.code, 'command_unavailable');
    });
    assert.ok(!wrapped.sql.some(sql => sql.includes('SELECT public.pwa_submit_selected_charges_v1')));
  }
  assert.deepEqual(await counts(command.requestId), { journal: 0, payments: 0 });
});

test('F-C10 PROD stand-in truthfully inherits PUBLIC CONNECT but no business access and API rejects tuple', async () => {
  await admin.query('CREATE DATABASE loan_manager_prod');
  const prodAdmin = new pg.Client({ host: '127.0.0.1', port, database: 'loan_manager_prod', user: 'postgres', password: '' });
  const prod = new pg.Pool({ host: '127.0.0.1', port, database: 'loan_manager_prod', user: runtime, password: '', max: 1 });
  await prodAdmin.connect();
  try {
    await prodAdmin.query('CREATE TABLE public.synthetic_prod_boundary(id integer); INSERT INTO synthetic_prod_boundary VALUES(1)');
    assert.equal((await prod.query('SELECT current_database() AS db')).rows[0].db, 'loan_manager_prod');
    await assert.rejects(prod.query('SELECT * FROM synthetic_prod_boundary'), permissionDenied);
    await assert.rejects(prod.query('INSERT INTO synthetic_prod_boundary VALUES(2)'), permissionDenied);
    const store = createApplicationRoleCommandStore({ pool: prod, targetAttestation: proof });
    const result = await store.status(principal, randomUUID()); assert.equal(result.status, 503); assert.equal(result.code, 'command_unavailable');
    await assert.rejects(planApplicationRole(prodAdmin, { database: 'loan_manager_prod', creators: ['postgres'] }));
  } finally { await prod.end(); await prodAdmin.end(); await admin.query('DROP DATABASE loan_manager_prod'); }
});

test('F-C11 generated receipt paths/bytes/create-only transport and exact request/actor binding', async () => {
  const transport = storageFixture(), receipts = adapter(transport.storage);
  const input = { requestId: randomUUID(), receiptId: randomUUID(), actor, bytes: png, mimeType: 'image/png' };
  const paths = generatedReceiptPaths(input);
  assert.ok(paths.storageReference.startsWith('manual-receipts/dev/pwa/')); assert.ok(paths.key.startsWith(DEV_RECEIPT_MAPPING.objectPrefix));
  assert.ok(!paths.storageReference.includes('//')); assert.equal(paths.storageReference.split('/').at(-1), input.receiptId.replaceAll('-', '') + '.png');
  for (const bad of ['../foreign', 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', 'legacy-path']) assert.throws(() => generatedReceiptPaths({ ...input, requestId: bad }));
  const uploaded = await receipts.upload(input); assert.equal(uploaded.descriptor.storageReference, paths.storageReference);
  assert.deepEqual(await receipts.resolveReceipt(input), { descriptor: uploaded.descriptor, requestId: input.requestId, actor: uploaded.actor });
  await assert.rejects(receipts.upload(input));
  await assert.rejects(receipts.resolve({ ...input, actor: { ...actor, subject: 'foreign-owner' } }));
  await assert.rejects(receipts.resolve({ ...input, requestId: randomUUID() }));
  await assert.rejects(receipts.upload({ ...input, receiptId: randomUUID(), bytes: Buffer.from('not an image') }));
  await assert.rejects(receipts.upload({ ...input, receiptId: randomUUID(), bytes: Buffer.alloc(5242881) }));
  await assert.rejects(receipts.upload({ ...input, mimeType: 'image/heic' }));
  assert.deepEqual([...new Set(transport.calls.map(x => x.operation))].sort(), ['create', 'read']);
  assert.ok(transport.calls.filter(x => x.operation === 'create').every(x => x.generationZero));
});

test('F-C12 receipt metadata/bytes/generation tampering and unknown upload acknowledgement fail closed/reconcile by exact key', async () => {
  const transport = storageFixture(), receipts = adapter(transport.storage);
  const input = { requestId: randomUUID(), receiptId: randomUUID(), actor, bytes: png, mimeType: 'image/png' };
  const uploaded = await receipts.upload(input), key = generatedReceiptPaths(input).key, original = transport.objects.get(key);
  for (const metadataKey of ['requestId', 'receiptId', 'actorSha256', 'sha256', 'environment', 'contentType', 'sizeBytes']) {
    transport.objects.set(key, { ...original, metadata: { ...original.metadata, [metadataKey]: 'tampered' } });
    await assert.rejects(receipts.resolve(input));
  }
  transport.objects.set(key, { ...original, bytes: Buffer.from('tampered') }); await assert.rejects(receipts.resolve(input));
  transport.objects.set(key, original); await assert.rejects(receipts.resolve({ ...input, generation: '18' }));
  let unknown = false;
  const lostTransport = storageFixture(), lost = adapter({ ...lostTransport.storage, async create(args) {
    await lostTransport.storage.create(args); unknown = true; throw Error('Synthetic acknowledgement loss');
  } });
  const pending = { ...input, receiptId: randomUUID() };
  await assert.rejects(lost.upload(pending)); assert.equal(unknown, true);
  const reconciled = await lost.resolve(pending); assert.equal(reconciled.generation, '17');
  assert.equal(reconciled.descriptor.sha256, createHash('sha256').update(png).digest('hex'));
  assert.equal(uploaded.generation, '17');
});

test('F-C13 actual role API binds receipt adapter; retained Posted survives current object disappearance', async () => {
  const command = { ...await fixture('RECEIPT'), receiptId: randomUUID() };
  const transport = storageFixture(), receipts = adapter(transport.storage);
  await receipts.upload({ requestId: command.requestId, receiptId: command.receiptId, actor, bytes: png, mimeType: 'image/png' });
  const resolveReceipt = input => receipts.resolveReceipt(input);
  let original;
  await withHttp({ resolveReceipt }, async s => {
    const result = await s.post(command); assert.equal(result.status, 200); original = result.body;
    const reference = (await app.query('SELECT "Uploaded Receipt" AS reference FROM "Payments" WHERE "Row ID"=$1', ['pwa:' + command.requestId])).rows[0].reference;
    assert.equal(reference, generatedReceiptPaths({ requestId: command.requestId, receiptId: command.receiptId, mimeType: 'image/png' }).storageReference);
    transport.objects.clear();
    assert.deepEqual((await s.post(command)).body, original);
    assert.deepEqual((await s.status(command.requestId)).body, original);
    assert.equal((await s.post({ ...command, receiptId: randomUUID() })).status, 409);
  });
  assert.deepEqual(await counts(command.requestId), { journal: 1, payments: 1 });
});

test('F-C14 maintained decoder enforces actual pixel/type limits and missing decoder/config fails closed', async () => {
  const huge = execFileSync(process.env.CLOUDSDK_PYTHON, ['-c', 'from PIL import Image;import sys;Image.new("RGB",(5000,4001),(1,2,3)).save(sys.stdout.buffer,format="PNG")'], { windowsHide: true });
  assert.ok(huge.length < 5242880); await assert.rejects(decodeReceiptImage(huge, 'image/png'));
  await assert.rejects(decodeReceiptImage(png, 'image/jpeg'));
  assert.throws(() => createDevReceiptAdapter({ storage: storageFixture().storage }));
  const disabled = createDevReceiptAdapter({ storage: storageFixture().storage, decodeImage: decodeReceiptImage, compatibility: { ...DEV_RECEIPT_MAPPING, bucket: 'foreign-bucket', status: 'synthetic-transport-test', evidenceReference: 'Synthetic wrong configuration' } });
  await assert.rejects(disabled.upload({ requestId: randomUUID(), receiptId: randomUUID(), actor, bytes: png, mimeType: 'image/png' }));
});

test('F-C15 revoked-PUBLIC SECURITY DEFINER overload cannot borrow approved basename authority', async () => {
  await admin.query("CREATE FUNCTION public.pwa_submit_selected_charges_v1(v integer) RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT v'; REVOKE ALL ON FUNCTION public.pwa_submit_selected_charges_v1(integer) FROM PUBLIC");
  try {
    await policy(true);
    await assert.rejects(app.query('SELECT public.pwa_submit_selected_charges_v1(7)'), permissionDenied);
  } finally { await admin.query('DROP FUNCTION public.pwa_submit_selected_charges_v1(integer)'); }
});

test('F-C16 receipt input bounds precede decoder and caller-buffer mutation cannot alter immutable upload', async () => {
  const transport = storageFixture(); let decoded = 0;
  const receipts = createDevReceiptAdapter({ storage: transport.storage, decodeImage: async () => { decoded++; },
    compatibility: { ...DEV_RECEIPT_MAPPING, status: 'synthetic-transport-test', evidenceReference: 'Synthetic boundary test' } });
  await assert.rejects(receipts.upload({ requestId: randomUUID(), receiptId: randomUUID(), actor, bytes: Buffer.alloc(5242881), mimeType: 'image/png' }));
  assert.equal(decoded, 0); assert.equal(transport.calls.length, 0);
  let signal, release;
  const began = new Promise(resolve => { signal = resolve; }), gate = new Promise(resolve => { release = resolve; });
  let first = true;
  const isolated = storageFixture();
  const immutable = createDevReceiptAdapter({ storage: isolated.storage, decodeImage: async (bytes, mime) => {
    if (first) { first = false; signal(); await gate; }
    await decodeReceiptImage(bytes, mime);
  }, compatibility: { ...DEV_RECEIPT_MAPPING, status: 'synthetic-transport-test', evidenceReference: 'Synthetic mutation test with actual Pillow decode' } });
  const inputBytes = Buffer.from(png), input = { requestId: randomUUID(), receiptId: randomUUID(), actor, bytes: inputBytes, mimeType: 'image/png' };
  const pending = immutable.upload(input); await began; inputBytes.fill(0); release();
  const uploaded = await pending;
  assert.equal(uploaded.descriptor.sha256, createHash('sha256').update(png).digest('hex'));
  assert.deepEqual(isolated.objects.get(generatedReceiptPaths(input).key).bytes, png);
});

test('F-C17 registered creator PUBLIC default ACLs and protected column grants cannot hide readiness gaps', async () => {
  await admin.query('ALTER DEFAULT PRIVILEGES FOR ROLE ' + creator + ' IN SCHEMA public GRANT SELECT ON TABLES TO PUBLIC');
  try { assert.ok((await policy()).violations.length > 0, 'Registered creator PUBLIC table defaults can expose future governance objects'); }
  finally { await admin.query('ALTER DEFAULT PRIVILEGES FOR ROLE ' + creator + ' IN SCHEMA public REVOKE SELECT ON TABLES FROM PUBLIC'); }
  await admin.query('CREATE TABLE secret_c_column(id integer); GRANT SELECT(id) ON secret_c_column TO PUBLIC');
  try {
    assert.equal((await app.query("SELECT has_table_privilege(current_user,'secret_c_column','SELECT') AS table_access,has_column_privilege(current_user,'secret_c_column','id','SELECT') AS column_access")).rows[0].table_access, false);
    assert.equal((await app.query("SELECT has_column_privilege(current_user,'secret_c_column','id','SELECT') AS allowed")).rows[0].allowed, true);
    assert.ok((await policy()).violations.length > 0, 'Column access must not be hidden by table-only ACL checks');
  } finally { await admin.query('DROP TABLE secret_c_column'); }
});

test('F-C18 actual migration-creator membership invalidates attestation and existing runtime connection guard', async () => {
  await admin.query('GRANT ' + creator + ' TO ' + runtime);
  try {
    await assert.rejects(attestDisposableApplicationTarget({ adminPool: admin, expectedDirectory: directory, runtimeUser: runtime, registeredCreators: config.creators }));
    const store = createApplicationRoleCommandStore({ pool: app, targetAttestation: proof });
    const result = await store.status(principal, randomUUID());
    assert.equal(result.status, 503); assert.equal(result.code, 'command_unavailable');
  } finally { await admin.query('REVOKE ' + creator + ' FROM ' + runtime); }
});



test('F-C19 policy snapshot/idempotency/recovery preserves pre-existing and later unrelated grants', async () => {
  await admin.query('CREATE TABLE future_c_recovery(id integer); GRANT SELECT ON future_c_recovery TO mw_app_dev; CREATE ROLE mw_4f_recovery_other NOLOGIN');
  const client = await admin.connect();
  try {
    const before = await captureApplicationRoleSnapshot(client, config);
    await reconcileApplicationRole(client, config, { apply: true });
    const after = await captureApplicationRoleSnapshot(client, config);
    await reconcileApplicationRole(client, config, { apply: true });
    const again = await captureApplicationRoleSnapshot(client, config);
    const normalized = snapshot => snapshot.rights.map(right => JSON.stringify(right)).sort();
    assert.deepEqual(normalized(after), normalized(again));
    await admin.query('GRANT REFERENCES ON future_c_recovery TO mw_app_dev; GRANT SELECT ON future_c_recovery TO mw_4f_recovery_other');
    const preview = await recoverApplicationRole(client, { before, after });
    assert.equal(preview.mode, 'recovery-plan'); assert.deepEqual(preview.violations, []);
    assert.ok(preview.statements.length > 0);
    assert.equal((await app.query("SELECT has_table_privilege(current_user,'future_c_recovery','INSERT') AS allowed")).rows[0].allowed, true);
    await recoverApplicationRole(client, { before, after }, { apply: true });
    const rights = (await app.query("SELECT has_table_privilege(current_user,'future_c_recovery','SELECT') AS read,has_table_privilege(current_user,'future_c_recovery','INSERT') AS insert,has_table_privilege(current_user,'future_c_recovery','UPDATE') AS update,has_table_privilege(current_user,'future_c_recovery','DELETE') AS delete,has_table_privilege(current_user,'future_c_recovery','REFERENCES') AS unrelated")).rows[0];
    assert.deepEqual(rights, { read: true, insert: false, update: false, delete: false, unrelated: true });
    assert.equal((await admin.query("SELECT has_table_privilege('mw_4f_recovery_other','future_c_recovery','SELECT') AS allowed")).rows[0].allowed, true);
  } finally { await admin.query('DROP TABLE future_c_recovery; DROP ROLE mw_4f_recovery_other'); client.release(); }
});

test('F-C20 provisioned membership is inherit-only, recoverable, and rejects migration creator identity', async () => {
  await admin.query('CREATE ROLE mw_app_dev_membership_c LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; CREATE ROLE mw_4f_membership_other NOLOGIN');
  const client = await admin.connect(), membershipConfig = { ...config, runtimeUser: 'mw_app_dev_membership_c' };
  try {
    const before = await captureApplicationRoleSnapshot(client, config);
    await provisionApplicationRuntimeMembership(client, membershipConfig);
    assert.equal((await admin.query("SELECT pg_has_role('mw_app_dev_membership_c','mw_app_dev','MEMBER') AS allowed")).rows[0].allowed, false);
    await provisionApplicationRuntimeMembership(client, membershipConfig, { apply: true });
    const after = await captureApplicationRoleSnapshot(client, config);
    const membership = after.memberships.find(row => row.member === 'mw_app_dev_membership_c');
    assert.deepEqual({ admin: membership.admin, inherit: membership.inherit, set: membership.set }, { admin: false, inherit: true, set: false });
    await admin.query('GRANT mw_4f_membership_other TO mw_app_dev_membership_c');
    await recoverApplicationRole(client, { before, after }, { apply: true });
    assert.equal((await admin.query("SELECT pg_has_role('mw_app_dev_membership_c','mw_app_dev','MEMBER') AS allowed")).rows[0].allowed, false);
    assert.equal((await admin.query("SELECT pg_has_role('mw_app_dev_membership_c','mw_4f_membership_other','MEMBER') AS allowed")).rows[0].allowed, true);
    await admin.query('GRANT ' + creator + ' TO mw_app_dev_membership_c');
    await assert.rejects(provisionApplicationRuntimeMembership(client, membershipConfig, { apply: true }));
    assert.equal((await admin.query("SELECT pg_has_role('mw_app_dev_membership_c','mw_app_dev','MEMBER') AS allowed")).rows[0].allowed, false);
  } finally { client.release(); await admin.query('DROP ROLE mw_app_dev_membership_c; DROP ROLE mw_4f_membership_other'); }
});

test('F-C21 maintained DEV-only post-migration hook is read-only by default and automatically reconciles future objects', async () => {
  const forbidden = { async query() { throw Error('Non-DEV/non-migrate must not inspect or apply'); } };
  for (const [environment, command] of [['production', 'migrate'], ['development', 'info'], ['development', 'validate']]) {
    assert.equal((await runDevelopmentPostMigrationHook(forbidden, config, { environment, command, apply: true })).mode, 'skipped');
  }
  const absent = { async query(sql) {
    if (sql.includes('current_database')) return { rows: [{ db: config.database }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  } };
  assert.equal((await runDevelopmentPostMigrationHook(absent, config, { environment: 'development', command: 'migrate', apply: true })).mode, 'skipped');
  await admin.query('CREATE TABLE future_c_hook(id integer)');
  const client = await admin.connect();
  try {
    await runDevelopmentPostMigrationHook(client, config, { environment: 'development', command: 'migrate' });
    await assert.rejects(app.query('SELECT * FROM future_c_hook'), permissionDenied);
    await runDevelopmentPostMigrationHook(client, config, { environment: 'development', command: 'migrate', apply: true });
    await app.query('INSERT INTO future_c_hook VALUES(1); UPDATE future_c_hook SET id=2; DELETE FROM future_c_hook');
    const maintained = readFileSync(new URL('../../scripts/database/Invoke-Flyway.ps1', import.meta.url), 'utf8');
    assert.match(maintained, /development/); assert.match(maintained, /migrate/);
    assert.match(maintained, /Invoke-ApplicationRole|Invoke-AppRole|application-role/i, 'Helper must be wired into maintained migration entrypoint');
  } finally { await admin.query('DROP TABLE future_c_hook'); client.release(); }
});

