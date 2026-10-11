import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { disposablePool } from '../../scripts/rehearsal/disposable-pool.mjs';
import { seedPaymentFixture } from '../../scripts/rehearsal/payment-fixture.mjs';
import { createCommandPrincipalVerifier } from '../../services/payment-command/principal.mjs';
import { createPaymentCommandStore } from '../../services/payment-command/store.mjs';
import { createPaymentCommandHandler } from '../../services/payment-command/handler.mjs';
import { DEV_PROJECT, OWNER_EMAIL } from '../../services/api/dev-read-config.mjs';

let pool;
const subject = 'synthetic-4e-independent-owner';
const directory = process.env.PAYMENT_REHEARSAL_DIRECTORY;
const claims = () => ({
  aud: DEV_PROJECT, iss: 'https://securetoken.google.com/' + DEV_PROJECT,
  sub: subject, email: OWNER_EMAIL, email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
  iat: 1, auth_time: 1, exp: Math.floor(Date.now() / 1000) + 3600,
});
before(async () => { pool = await disposablePool(78); });
after(async () => { await pool?.end(); });

async function fixture(suffix) {
  const prefix = '4A-4E-C-' + suffix;
  await seedPaymentFixture(pool, prefix);
  await pool.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=\'4A-ACTOR\'', [OWNER_EMAIL]);
  const day = (await pool.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day")).rows[0].day;
  return { schemaVersion: 3, requestId: randomUUID(), borrowerId: prefix + '-B',
    selectedChargeIds: [prefix + '-C2', prefix + '-C1'], cashAccountId: '4A-RECEIVE',
    paymentDate: day, amountReceived: '330', paymentMethod: 'Bank Transfer',
    allocationMethod: 'Selected Charges', notes: '  ไทย😀\r\n"quote" <Notes>\t ', receiptId: null };
}
async function counts(id) {
  return (await pool.query('SELECT (SELECT count(*) FROM public.pwa_payment_commands WHERE request_id=$1)::int AS journal,(SELECT count(*) FROM "Payments" WHERE "Row ID"=\'pwa:\'||$1)::int AS payments', [id])).rows[0];
}
function instrumentPool(intercept, { throwRelease = false } = {}) {
  const events = [], releases = [];
  return { events, releases, async connect() {
    const client = await pool.connect();
    return { async query(sql, args) {
      events.push(sql);
      return intercept ? intercept(sql, args, client) : client.query(sql, args);
    }, release(discard) { releases.push(discard); client.release(discard); if (throwRelease) throw Error("Synthetic release failure"); } };
  } };
}
async function serverFor(options = {}) {
  const calls = [], verification = [], logs = [];
  const verifier = createCommandPrincipalVerifier({
    ownerUid: subject,
    verifyIdToken: async (token, revoked) => {
      verification.push({ revoked });
      if (token === 'revoked') throw Error('Synthetic revoked token');
      if (token === 'valid') return claims();
      if (options.tokens?.[token]) return options.tokens[token];
      throw Error('Synthetic invalid token');
    },
  });
  const store = options.store || createPaymentCommandStore({
    pool: options.pool || pool, expectedDirectory: directory, resolveReceipt: options.resolveReceipt,
  });
  let handler;
  const server = http.createServer((req, res) => handler(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  handler = createPaymentCommandHandler({
    origins: [origin], verifyPrincipal: verifier,
    store: {
      async submit(...args) { calls.push('submit'); return store.submit(...args); },
      async status(...args) { calls.push('status'); return store.status(...args); },
    },
    completionLogger: options.throwLogger ? () => { throw Error('Synthetic logger failure'); } : event => logs.push(event),
  });
  const headers = { Authorization: 'Bearer valid', 'Content-Type': 'application/json', Origin: origin };
  async function request(path, init = {}) {
    const response = await fetch(origin + path, { ...init, headers: { ...headers, ...init.headers } });
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
  }
  return { origin, calls, verification, logs, request,
    post: (command, init = {}) => request('/api/payment-commands', { method: 'POST', body: JSON.stringify(command), ...init }),
    status: id => request('/api/payment-commands/' + id),
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); },
  };
}
async function withServer(options, action) {
  const s = await serverFor(options);
  try { return await action(s); } finally { await s.close(); }
}
function raw(s, { body, headers = {}, finish = true, chunks } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(s.origin + '/api/payment-commands', {
      method: 'POST', headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json', Origin: s.origin, ...headers },
    }, response => {
      const data = [];
      response.on('data', chunk => data.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(data).toString()) }));
    });
    request.on('error', reject);
    if (chunks) for (const chunk of chunks) request.write(chunk);
    else if (body) request.write(body);
    if (finish) request.end();
  });
}
const financialCalls = events => events.filter(sql => /SELECT public\.pwa_submit_selected_charges_v1/.test(sql)).length;

test('C01 owner identity, exact Notes, response headers and fresh status on actual HTTP/V78', async () => {
  const command = await fixture('POST');
  await withServer({}, async s => {
    const result = await s.post(command);
    assert.equal(result.status, 200); assert.equal(result.body.originalOutcome.status, 'posted');
    assert.equal(result.headers.get('cache-control'), 'no-store'); assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(result.headers.get('vary'), 'Origin'); assert.equal(result.headers.get('access-control-allow-origin'), s.origin);
    assert.equal(result.headers.get('access-control-expose-headers'), 'X-Request-ID');
    assert.equal(result.headers.get('access-control-allow-credentials'), null);
    assert.match(result.headers.get('x-request-id'), /^[0-9a-f-]{36}$/); assert.notEqual(result.headers.get('x-request-id'), command.requestId);
    assert.deepEqual((await s.status(command.requestId)).body, result.body);
    assert.deepEqual(await counts(command.requestId), { journal: 1, payments: 1 });
    const row = (await pool.query('SELECT "Notes","Created By","Posted Amount"::numeric::text AS posted FROM "Payments" WHERE "Row ID"=$1', ['pwa:' + command.requestId])).rows[0];
    assert.equal(row.Notes, command.notes); assert.equal(row['Created By'], OWNER_EMAIL); assert.equal(Number(row.posted), 330);
    assert.equal(s.verification.length, 2); assert.ok(s.verification.every(v => v.revoked));
  });
});

test('C02 authentication negative matrix never reaches store and always requests revocation verification', async () => {
  const command = await fixture('AUTH');
  const tokens = {
    issuer: { ...claims(), iss: 'https://invalid.example' },
    audience: { ...claims(), aud: 'invalid-project' },
    provider: { ...claims(), firebase: { sign_in_provider: 'password' } },
    tenant: { ...claims(), firebase: { sign_in_provider: 'google.com', tenant: 'synthetic' } },
    uid: { ...claims(), sub: 'different-synthetic-owner' },
    email: { ...claims(), email: 'other@example.invalid' },
    expired: { ...claims(), exp: 1 },
    unverified: { ...claims(), email_verified: false },
    issued: { ...claims(), iat: Math.floor(Date.now() / 1000) + 1000 },
    authTime: { ...claims(), auth_time: Math.floor(Date.now() / 1000) + 1000 },
  };
  await withServer({ tokens }, async s => {
    for (const token of [...Object.keys(tokens), 'revoked', 'unknown']) {
      const result = await s.post(command, { headers: { Authorization: 'Bearer ' + token } });
      assert.ok([401, 403].includes(result.status), 'Invalid verified claims must deny');
    }
    for (const authorization of ['', 'Basic synthetic', 'Bearer a b']) {
      assert.equal((await s.post(command, { headers: { Authorization: authorization } })).status, 401);
    }
    assert.deepEqual(s.calls, []); assert.equal(s.verification.length, 12);
    assert.ok(s.verification.every(v => v.revoked === true));
    assert.deepEqual(await counts(command.requestId), { journal: 0, payments: 0 });
  });
  for (const ownerUid of [undefined, '', ' uid ', 'x'.repeat(129)]) {
    assert.throws(() => createCommandPrincipalVerifier({ ownerUid, verifyIdToken: async () => claims() }));
  }
});

test('C03 body actor/hash/reference injection is denied before any store call', async () => {
  const command = await fixture('INJECT');
  await withServer({}, async s => {
    for (const extra of [{ actor: { subject } }, { partnerId: 'forged' }, { payloadSha256: 'f'.repeat(64) }, { storageReference: 'private-reference' }, { issuer: 'forged' }, { status: 'posted' }]) {
      assert.equal((await s.post({ ...command, ...extra })).status, 400);
    }
    assert.deepEqual(s.calls, []); assert.deepEqual(await counts(command.requestId), { journal: 0, payments: 0 });
  });
});

test('C04 database unique mapping and defensive ambiguity denial; changed actor conflicts', async () => {
  const command = await fixture('MAP');
  await withServer({}, async s => {
    assert.equal((await s.post(command)).status, 200);
    await pool.query('UPDATE "Partners" SET "Login Email"=\'unmapped@example.invalid\' WHERE "Row ID"=\'4A-ACTOR\'');
    try {
      assert.equal((await s.post(command)).status, 403); assert.equal((await s.status(command.requestId)).status, 403);
    } finally { await pool.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=\'4A-ACTOR\'', [OWNER_EMAIL]); }
    // A-approved refinement: V25 prohibits real duplicate mappings; retain that protection.
    await assert.rejects(
      pool.query('INSERT INTO "Partners"("Row ID","Partner Role","Login Email") VALUES(\'4A-4E-DUPLICATE\',\'A\',$1)', [' ' + OWNER_EMAIL.toUpperCase() + ' ']),
      error => error.code === '23505',
    );
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM "Partners" WHERE lower(btrim("Login Email"))=$1', [OWNER_EMAIL])).rows[0].count, 1);
    assert.equal((await s.status(command.requestId)).status, 200);
    await pool.query('INSERT INTO "Partners"("Row ID","Partner Role","Login Email") VALUES(\'4A-4E-REMAPPED\',\'A\',\'replacement@example.invalid\')');
    await assert.rejects(pool.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=\'4A-4E-REMAPPED\'', [OWNER_EMAIL]), error => error.code === '23505');
    const ambiguous = instrumentPool(async (sql, args, client) => {
      const result = await client.query(sql, args);
      if (sql.includes('AS id FROM public."Partners"')) return { rows: [{ id: '4A-ACTOR' }, { id: '4A-4E-REMAPPED' }] };
      return result;
    });
    // Only the returned mapping rows are injected; all guards/transactions are real V78.
    await withServer({ pool: ambiguous }, async guardServer => {
      assert.equal((await guardServer.post(command)).status, 403);
      assert.equal((await guardServer.status(command.requestId)).status, 403);
    });
    assert.equal(financialCalls(ambiguous.events), 0);
    assert.ok(!ambiguous.events.some(sql => sql.includes('SELECT canonical_json') || sql.includes('SELECT public.pwa_command_status_v1')));
    await pool.query('UPDATE "Partners" SET "Login Email"=\'unmapped@example.invalid\' WHERE "Row ID"=\'4A-ACTOR\'');
    await pool.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=\'4A-4E-REMAPPED\'', [OWNER_EMAIL]);
    try {
      assert.equal((await s.post(command)).status, 409);
      const remappedStatus = await s.status(command.requestId);
      assert.equal(remappedStatus.status, 403); assert.deepEqual(remappedStatus.body, { ok: false, code: 'access_denied' });
    } finally {
      await pool.query('UPDATE "Partners" SET "Login Email"=\'replacement@example.invalid\' WHERE "Row ID"=\'4A-4E-REMAPPED\'');
      await pool.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=\'4A-ACTOR\'', [OWNER_EMAIL]);
    }
    assert.deepEqual(await counts(command.requestId), { journal: 1, payments: 1 });
  });
});

test('C05 strict origin, route, method, UUID and preflight boundaries', async () => {
  const command = await fixture('ROUTE');
  await withServer({}, async s => {
    for (const origin of ['http://evil.invalid', s.origin + '.evil', 'null']) {
      assert.equal((await s.post(command, { headers: { Origin: origin } })).status, 403);
    }
    assert.equal(s.verification.length, 0);
    for (const [path, method, status] of [
      ['/api/payment-commands?secret=private', 'GET', 400],
      ['/api/payment-commands/not-a-uuid', 'GET', 400],
      ['/api/payment-commands', 'GET', 405],
      ['/api/payment-commands/' + randomUUID(), 'POST', 405],
      ['/not-found', 'GET', 404],
      ['/api/payment-commands', 'PATCH', 405],
    ]) assert.equal((await s.request(path, { method })).status, status);
    for (const [method, header, status] of [['POST', 'Authorization, Content-Type', 204], ['DELETE', 'Authorization', 403], ['GET', 'X-Private', 403]]) {
      assert.equal((await s.request('/api/payment-commands', { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': header } })).status, status);
    }
    assert.equal((await s.post(command, { headers: { Origin: undefined } })).status, 403);
    // Actual omission requires a raw request rather than fetch's stringified undefined header.
    const withoutOrigin = await new Promise((resolve, reject) => {
      const req = http.request(s.origin + '/api/payment-commands/' + randomUUID(), { headers: { Authorization: 'Bearer valid' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject); req.end();
    });
    assert.equal(withoutOrigin, 200); assert.equal(s.calls.filter(x => x === 'submit').length, 0);
  });
});

test('C06 unsupported media/encoding, invalid UTF-8 and streamed overlimit never reach store', async () => {
  const command = await fixture('BODY');
  await withServer({}, async s => {
    for (const headers of [{ 'Content-Type': 'text/plain' }, { 'Content-Type': 'application/json; charset=latin1' }, { 'Content-Encoding': 'gzip' }]) {
      const result = await raw(s, { body: JSON.stringify(command), headers });
      assert.equal(result.status, 415, 'Unsupported media and encodings must use plan HTTP415');
    }
    assert.equal((await raw(s, { body: Buffer.from([0xc3, 0x28]) })).status, 400);
    assert.equal((await raw(s, { chunks: [Buffer.alloc(262145, 0x20), Buffer.alloc(262145, 0x20)] })).status, 413);
    assert.deepEqual(s.calls, []); assert.deepEqual(await counts(command.requestId), { journal: 0, payments: 0 });
  });
});

test('C07 stalled and aborted bodies make zero submit calls', async () => {
  await withServer({}, async s => {
    const start = Date.now();
    const result = await raw(s, { body: '{', finish: false });
    assert.equal(result.status, 400); assert.ok(Date.now() - start >= 4500 && Date.now() - start < 9000);
    await new Promise(resolve => {
      const req = http.request(s.origin + '/api/payment-commands', { method: 'POST', headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' } });
      req.on('error', () => resolve()); req.write('{'); setTimeout(() => req.destroy(), 30);
    });
    await new Promise(resolve => setTimeout(resolve, 80)); assert.deepEqual(s.calls, []);
  });
});

test('C08 exact concurrent retries produce one effect; changed amount/selection/Notes conflict', async () => {
  const command = await fixture('RACE');
  await withServer({}, async s => {
    const results = await Promise.all(Array.from({ length: 4 }, () => s.post(command)));
    assert.ok(results.every(x => x.status === 200)); assert.ok(results.every(x => JSON.stringify(x.body) === JSON.stringify(results[0].body)));
    for (const changes of [{ notes: 'changed' }, { amountReceived: '329' }, { selectedChargeIds: [command.selectedChargeIds[0]] }]) {
      const result = await s.post({ ...command, ...changes }); assert.equal(result.status, 409); assert.deepEqual(result.body, { ok: false, code: 'command_conflict' });
    }
    assert.deepEqual(await counts(command.requestId), { journal: 1, payments: 1 });
  });
  const competing = await fixture('COMPETE');
  await withServer({}, async s => {
    const other = { ...competing, requestId: randomUUID() };
    const results = await Promise.all([s.post(competing), s.post(other)]);
    assert.equal(results.filter(x => x.status === 200).length, 1);
    assert.equal(results.filter(x => x.status === 503 && x.body.code === 'command_outcome_unknown').length, 1);
    const a = await counts(competing.requestId), b = await counts(other.requestId);
    assert.equal(a.payments + b.payments, 1); assert.equal(a.journal + b.journal, 1);
  });
});

test('C09 durable date/account rejection, unresolved status and empty/null Notes semantics', async () => {
  const command = await fixture('REJECT');
  await withServer({}, async s => {
    for (const changes of [{ paymentDate: '2020-01-01' }, { cashAccountId: '4A-4E-MISSING' }]) {
      const rejectedCommand = { ...command, ...changes, requestId: randomUUID() };
      const result = await s.post(rejectedCommand); assert.equal(result.status, 422); assert.equal(result.body.originalOutcome.status, 'rejected');
      assert.equal((await s.status(rejectedCommand.requestId)).status, 200);
      assert.deepEqual((await s.status(rejectedCommand.requestId)).body.originalOutcome, result.body.originalOutcome);
      assert.deepEqual((await s.post(rejectedCommand)).body, result.body);
      assert.deepEqual(await counts(rejectedCommand.requestId), { journal: 1, payments: 0 });
    }
    assert.deepEqual((await s.status(randomUUID())).body, { ok: true, kind: 'unresolved' });
    const empty = { ...command, requestId: randomUUID(), notes: '' };
    assert.equal((await s.post(empty)).status, 200);
    assert.equal((await pool.query('SELECT "Notes" FROM "Payments" WHERE "Row ID"=$1', ['pwa:' + empty.requestId])).rows[0].Notes, null);
    assert.equal((await s.post({ ...empty, notes: null })).status, 200);
  });
});

test('C10 receipt unsupported/wrong binding fail closed, technical adapter failure is unavailable', async () => {
  const command = { ...await fixture('RECEIPT-NEG'), receiptId: randomUUID() };
  const descriptor = { receiptId: command.receiptId, sha256: 'f'.repeat(64), mimeType: 'image/png', sizeBytes: 1, storageReference: 'synthetic-receipt-reference' };
  await withServer({}, async s => { assert.equal((await s.post(command)).body.code, 'receipt_unsupported'); });
  for (const mode of ['owner', 'request', 'id', 'extra']) {
    const guarded = instrumentPool();
    await withServer({ pool: guarded, resolveReceipt: async input => {
      const bound = { descriptor, requestId: input.requestId, actor: input.actor };
      if (mode === 'owner') bound.actor = { ...input.actor, subject: 'different-owner' };
      if (mode === 'request') bound.requestId = randomUUID();
      if (mode === 'id') bound.descriptor = { ...descriptor, receiptId: randomUUID() };
      if (mode === 'extra') bound.extra = true;
      return bound;
    } }, async s => { assert.equal((await s.post(command)).status, 422); assert.equal(financialCalls(guarded.events), 0); });
  }
  const unavailable = instrumentPool();
  await withServer({ pool: unavailable, resolveReceipt: async () => { throw Error('Synthetic storage unavailable'); } }, async s => {
    const result = await s.post(command); assert.equal(result.status, 503); assert.equal(result.body.code, 'receipt_unavailable');
    assert.equal(financialCalls(unavailable.events), 0);
  });
  assert.deepEqual(await counts(command.requestId), { journal: 0, payments: 0 });
});

test('C11 receipt retained replay bypasses unavailable resolver and still requires current mapping', async () => {
  const command = { ...await fixture('RECEIPT-KEEP'), receiptId: randomUUID() };
  let resolutions = 0, original;
  await withServer({ resolveReceipt: async input => {
    resolutions++;
    return { descriptor: { receiptId: input.receiptId, sha256: 'e'.repeat(64), mimeType: 'image/jpeg', sizeBytes: 17, storageReference: 'synthetic-retained-image-reference' }, requestId: input.requestId, actor: input.actor };
  } }, async s => { const result = await s.post(command); assert.equal(result.status, 200); original = result.body; });
  assert.equal(resolutions, 1);
  await withServer({ resolveReceipt: async () => { throw Error('Must not resolve retained image'); } }, async s => {
    assert.deepEqual((await s.post(command)).body, original);
    assert.equal((await s.post({ ...command, receiptId: randomUUID() })).status, 409);
    await pool.query('UPDATE "Partners" SET "Login Email"=\'unmapped@example.invalid\' WHERE "Row ID"=\'4A-ACTOR\'');
    try { assert.equal((await s.post(command)).status, 403); }
    finally { await pool.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=\'4A-ACTOR\'', [OWNER_EMAIL]); }
  });
  assert.deepEqual(await counts(command.requestId), { journal: 1, payments: 1 });
});

test('C12 injected COMMIT acknowledgement loss reconciles committed original using fresh HTTP status', async () => {
  const command = await fixture('ACK');
  let lost = false;
  const wrapped = instrumentPool(async (sql, args, client) => {
    const result = await client.query(sql, args);
    if (sql === 'COMMIT' && !lost) { lost = true; throw Error('Synthetic acknowledgement lost after actual commit'); }
    return result;
  });
  await withServer({ pool: wrapped }, async s => {
    const result = await s.post(command); assert.equal(result.status, 503); assert.equal(result.body.code, 'command_outcome_unknown');
  });
  await withServer({}, async s => {
    const status = await s.status(command.requestId); assert.equal(status.status, 200); assert.equal(status.body.originalOutcome.status, 'posted');
    assert.deepEqual((await s.post(command)).body, status.body);
  });
  assert.deepEqual(await counts(command.requestId), { journal: 1, payments: 1 });
});

test('C13 pre-financial failure unavailable; post-attempt/pre-commit failure unknown and atomic rollback', async () => {
  const command = await fixture('FAIL');
  await withServer({ pool: { async connect() { throw Error('Synthetic acquisition unavailable'); } } }, async s => {
    const result = await s.post(command); assert.equal(result.status, 503); assert.equal(result.body.code, 'command_unavailable');
  });
  const wrapped = instrumentPool(async (sql, args, client) => {
    if (sql === 'COMMIT') throw Error('Synthetic failure before COMMIT');
    return client.query(sql, args);
  });
  await withServer({ pool: wrapped }, async s => {
    const result = await s.post(command); assert.equal(result.status, 503); assert.equal(result.body.code, 'command_outcome_unknown');
  });
  assert.equal(financialCalls(wrapped.events), 1); assert.deepEqual(wrapped.releases, [true]);
  assert.deepEqual(await counts(command.requestId), { journal: 0, payments: 0 });
  await withServer({}, async s => { assert.deepEqual((await s.status(command.requestId)).body, { ok: true, kind: 'unresolved' }); });
});

test('C14 abort after financial SQL begins leaves same-ID recovery and no automatic retry', async () => {
  const command = await fixture('DISCONNECT');
  let signal, release;
  const started = new Promise(resolve => { signal = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const wrapped = instrumentPool(async (sql, args, client) => {
    if (/SELECT public\.pwa_submit_selected_charges_v1/.test(sql)) { signal(); await gate; }
    return client.query(sql, args);
  });
  await withServer({ pool: wrapped }, async s => {
    const req = http.request(s.origin + '/api/payment-commands', { method: 'POST', headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' } });
    req.on('error', () => {});
    req.end(JSON.stringify(command));
    await started; req.destroy(); release();
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await counts(command.requestId)).journal === 1) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const status = await s.status(command.requestId); assert.equal(status.body.originalOutcome.status, 'posted');
    assert.equal(financialCalls(wrapped.events), 1); assert.deepEqual(await counts(command.requestId), { journal: 1, payments: 1 });
  });
});

test('C15 journal original survives synthetic governed source correction/deletion without repost', async () => {
  const command = await fixture('RETAIN');
  await withServer({}, async s => {
    const original = (await s.post(command)).body;
    await pool.query('UPDATE "Payments" SET "Notes"=\'Synthetic correction\' WHERE "Row ID"=$1', ['pwa:' + command.requestId]);
    assert.deepEqual((await s.post(command)).body, original); assert.deepEqual((await s.status(command.requestId)).body, original);
    await pool.query('DELETE FROM "Payments" WHERE "Row ID"=$1', ['pwa:' + command.requestId]);
    assert.deepEqual((await s.post(command)).body, original); assert.deepEqual((await s.status(command.requestId)).body, original);
    assert.deepEqual(await counts(command.requestId), { journal: 1, payments: 0 });
  });
});

test('C16 target identity/version/directory/user guards deny before financial SQL; invalid config rejects startup', async () => {
  const command = await fixture('GUARD');
  for (const mode of ['database', 'host', 'directory', 'version', 'history', 'user']) {
    const wrapped = instrumentPool(async (sql, args, client) => {
      const result = await client.query(sql, args);
      if (sql.includes('current_database()')) {
        if (mode === 'database') result.rows[0].db = 'loan_manager_dev';
        if (mode === 'host') result.rows[0].host = '203.0.113.1';
        if (mode === 'directory') result.rows[0].directory = process.cwd();
      }
      if (sql.includes('max(version')) {
        if (mode === 'version') result.rows[0].version = 77;
        if (mode === 'history') result.rows[0].applied = 77;
      }
      if (sql.includes('session_user')) { if (mode === 'user') result.rows[0].session_user = 'different-user'; }
      return result;
    });
    await withServer({ pool: wrapped }, async s => {
      const result = await s.post(command); assert.equal(result.status, 503); assert.equal(result.body.code, 'command_unavailable');
      assert.equal(financialCalls(wrapped.events), 0);
    });
  }
  for (const expectedDirectory of [undefined, '', 'C:/arbitrary/data']) assert.throws(() => createPaymentCommandStore({ pool, expectedDirectory }));
  for (const origin of ['*', 'https://127.0.0.1:1234', 'http://localhost:1234', 'http://127.0.0.1:1234/path']) {
    assert.throws(() => createPaymentCommandHandler({ origins: [origin], verifyPrincipal: async () => ({ ok: true }), store: {} }));
  }
  assert.deepEqual(await counts(command.requestId), { journal: 0, payments: 0 });
});

test('C17 completion logs contain only sanitized keys; throwing logger cannot alter committed outcome', async () => {
  const command = await fixture('LOG');
  await withServer({}, async s => {
    assert.equal((await s.post(command)).status, 200);
    await s.request('/api/payment-commands?private=secret');
    await new Promise(resolve => setImmediate(resolve));
    for (const event of s.logs) {
      assert.deepEqual(Object.keys(event).sort(), ['code', 'durationMs', 'event', 'method', 'operation', 'requestId', 'status']);
      for (const sensitive of [OWNER_EMAIL, subject, command.requestId, command.borrowerId, command.notes, 'Bearer', 'secret']) {
        assert.ok(!JSON.stringify(event).includes(sensitive), 'Logs must omit sensitive values');
      }
    }
    assert.equal(s.logs.length, 2);
  });
  const other = await fixture('THROW-LOG');
  await withServer({ throwLogger: true }, async s => {
    assert.equal((await s.post(other)).status, 200); assert.equal((await s.status(other.requestId)).body.originalOutcome.status, 'posted');
  });
  assert.deepEqual(await counts(other.requestId), { journal: 1, payments: 1 });
});

test('C18 quarantine failed rollback and COMMIT faults; release error preserves intended Unknown', async () => {
  const command = await fixture('QUARANTINE');
  const rollbackFault = instrumentPool(async (sql, args, client) => {
    if (sql === 'ROLLBACK') throw Error('Synthetic rollback failure');
    return client.query(sql, args);
  });
  await withServer({ pool: rollbackFault }, async s => {
    const result = await s.post({ ...command, receiptId: randomUUID() });
    assert.equal(result.status, 503); assert.equal(result.body.code, 'command_unavailable');
  });
  assert.deepEqual(rollbackFault.releases, [true]); assert.equal(financialCalls(rollbackFault.events), 0);
  const releaseFault = instrumentPool(async (sql, args, client) => {
    if (sql === 'COMMIT') throw Error('Synthetic COMMIT failure');
    return client.query(sql, args);
  }, { throwRelease: true });
  await withServer({ pool: releaseFault }, async s => {
    const result = await s.post(command); assert.equal(result.status, 503); assert.equal(result.body.code, 'command_outcome_unknown');
  });
  assert.deepEqual(releaseFault.releases, [true]);
  const ordinaryRollback = instrumentPool();
  await withServer({ pool: ordinaryRollback }, async s => {
    const result = await s.post({ ...command, amountReceived: '329' });
    assert.equal(result.status, 503); assert.equal(result.body.code, 'command_outcome_unknown');
  });
  assert.deepEqual(ordinaryRollback.releases, [false]);
  assert.deepEqual(await counts(command.requestId), { journal: 0, payments: 0 });
});

test('C19 status authorization SQL denial requires confirmed rollback; failed cleanup remains unavailable', async () => {
  const command = await fixture('STATUS-FAULT');
  await withServer({}, async s => { assert.equal((await s.post(command)).status, 200); });
  for (const failedRollback of [false, true]) {
    const wrapped = instrumentPool(async (sql, args, client) => {
      if (sql.includes('SELECT public.pwa_command_status_v1')) throw Object.assign(Error('Synthetic stored actor denial'), { code: '42501' });
      if (sql === 'ROLLBACK' && failedRollback) throw Error('Synthetic cleanup failure');
      return client.query(sql, args);
    });
    await withServer({ pool: wrapped }, async s => {
      const result = await s.status(command.requestId);
      assert.equal(result.status, failedRollback ? 503 : 403);
      assert.equal(result.body.code, failedRollback ? 'command_unavailable' : 'access_denied');
    });
    assert.deepEqual(wrapped.releases, [failedRollback]); assert.equal(financialCalls(wrapped.events), 0);
  }
  assert.deepEqual(await counts(command.requestId), { journal: 1, payments: 1 });
});
