import { loanColumns, validLoanId, projectLoan, encodeLoanCursor, decodeLoanCursor } from './loan-read-contract.mjs';
const borrowerColumns = '"Row ID" AS id, "Borrower Name" AS name, "Creation Date"::text AS "createdDate", "Has Active Loan" AS "hasActiveLoan", "Total Outstanding Principal"::text AS "outstandingPrincipal", "Borrower Note" AS note';
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 256 && !/[\u0000-\u001f]/.test(id);
const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : null;
};
function project(row) {
  if (!validId(row.id)) throw new Error('Invalid read source');
  return { id: row.id, name: typeof row.name === 'string' ? row.name : null, createdDate: validDate(row.createdDate), hasActiveLoan: typeof row.hasActiveLoan === 'boolean' ? row.hasActiveLoan : null, outstandingPrincipal: typeof row.outstandingPrincipal === 'string' && /^-?\d+(?:\.\d+)?$/.test(row.outstandingPrincipal) ? row.outstandingPrincipal : null, note: typeof row.note === 'string' ? row.note : null };
}
export function encodeCursor(id) { return Buffer.from(id, 'utf8').toString('base64url'); }
export function decodeCursor(cursor) {
  if (cursor === null || cursor === undefined || cursor === '') return null;
  if (typeof cursor !== 'string' || cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('Invalid cursor');
  const id = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!validId(id) || encodeCursor(id) !== cursor) throw new Error('Invalid cursor');
  return id;
}
export function createBorrowerReadStore({ pool, config, now = () => new Date() }) {
  async function run(email, operation) {
    if (email !== config.ownerEmail) return { ok: false, status: 403, code: 'access_denied' };
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      await client.query("SET LOCAL statement_timeout = '5000ms'");
      const identity = await client.query('SELECT current_database() AS database, current_user AS principal');
      if (identity.rows.length !== 1 || identity.rows[0].database !== config.database || identity.rows[0].principal !== config.dbUser) throw new Error('Unexpected database identity');
      const mapping = await client.query('SELECT "Row ID" AS id FROM public."Partners" WHERE lower(btrim("Login Email")) = $1 LIMIT 2', [email]);
      if (mapping.rows.length !== 1 || !validId(mapping.rows[0].id)) { await client.query('ROLLBACK'); return { ok: false, status: 403, code: 'access_denied' }; }
      const data = await operation(client);
      await client.query('COMMIT');
      const timestamp = now();
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(timestamp);
      const value = type => parts.find(p => p.type === type).value;
      return { ok: true, schemaVersion: 1, source: 'dev', businessDate: `${value('year')}-${value('month')}-${value('day')}`, timezone: 'Asia/Bangkok', asOf: timestamp.toISOString(), ...data };
    } catch {
      try { await client.query('ROLLBACK'); } catch { /* No query values or underlying errors are logged. */ }
      return { ok: false, status: 503, code: 'read_unavailable' };
    } finally { client.release(); }
  }
  return {
    async checkIdentity() {
      let client;
      try {
        client = await pool.connect();
        const result = await client.query('SELECT current_database() AS database, current_user AS principal');
        return { ok: result.rows.length === 1 && result.rows[0].database === config.database && result.rows[0].principal === config.dbUser };
      } catch { return { ok: false }; }
      finally { client?.release(); }
    },
    session: email => run(email, async () => ({ permission: 'oltp.read', scope: 'borrowers-and-related-loans' })),
    listBorrowers: (email, { limit = 25, cursor = null } = {}) => {
      let after;
      try { after = decodeCursor(cursor); if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error(); }
      catch { return Promise.resolve({ ok: false, status: 400, code: 'invalid_request' }); }
      return run(email, async client => {
        const result = await client.query(`SELECT ${borrowerColumns} FROM public."Borrowers" WHERE "Hidden Flag" IS FALSE AND ($1::text IS NULL OR "Row ID" COLLATE "C" > $1::text COLLATE "C") ORDER BY "Row ID" COLLATE "C" LIMIT $2`, [after, limit + 1]);
        const items = result.rows.slice(0, limit).map(project);
        return { items, nextCursor: result.rows.length > limit ? encodeCursor(items.at(-1).id) : null, order: 'row-id' };
      });
    },
    listLoans: (email, borrowerId, { limit = 25, cursor = null } = {}) => {
      if (!validLoanId(borrowerId)) return Promise.resolve({ ok: false, status: 404, code: 'not_found' });
      let after;
      try { after = decodeLoanCursor(cursor, borrowerId); if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error(); }
      catch { return Promise.resolve({ ok: false, status: 400, code: 'invalid_request' }); }
      return run(email, async client => {
        const parent = await client.query('SELECT "Row ID" AS id FROM public."Borrowers" WHERE "Hidden Flag" IS FALSE AND "Row ID" = $1 LIMIT 2', [borrowerId]);
        if (parent.rows.length !== 1) return { parentMissing: true };
        const result = await client.query(`SELECT ${loanColumns} FROM public."Loans" l JOIN public."Borrowers" b ON l."Ref Borrowers" = b."Row ID"
          WHERE b."Hidden Flag" IS FALSE AND b."Row ID" = $1
          AND ($2::boolean IS FALSE
            OR ($3::date IS NOT NULL AND (l."Loan Date" < $3::date OR l."Loan Date" IS NULL OR (l."Loan Date" = $3::date AND l."Row ID" COLLATE "C" > $4::text COLLATE "C")))
            OR ($3::date IS NULL AND l."Loan Date" IS NULL AND l."Row ID" COLLATE "C" > $4::text COLLATE "C"))
          ORDER BY l."Loan Date" DESC NULLS LAST, l."Row ID" COLLATE "C" ASC LIMIT $5`, [borrowerId, after !== null, after?.loanDate ?? null, after?.id ?? null, limit + 1]);
        const items = result.rows.slice(0, limit).map(row => projectLoan(row, borrowerId));
        return { borrowerId, items, nextCursor: result.rows.length > limit ? encodeLoanCursor(borrowerId, items.at(-1)) : null, order: 'loan-date-desc-null-last,row-id-asc' };
      }).then(result => result.ok && result.parentMissing ? { ok: false, status: 404, code: 'not_found' } : result);
    },
    getLoan: (email, borrowerId, loanId) => {
      if (!validLoanId(borrowerId) || !validLoanId(loanId)) return Promise.resolve({ ok: false, status: 404, code: 'not_found' });
      return run(email, async client => {
        const result = await client.query(`SELECT ${loanColumns} FROM public."Loans" l JOIN public."Borrowers" b ON l."Ref Borrowers" = b."Row ID"
          WHERE b."Hidden Flag" IS FALSE AND b."Row ID" = $1 AND l."Row ID" = $2 LIMIT 2`, [borrowerId, loanId]);
        return { item: result.rows.length === 1 ? projectLoan(result.rows[0], borrowerId) : null };
      }).then(result => result.ok && !result.item ? { ok: false, status: 404, code: 'not_found' } : result);
    },
    getBorrower: (email, id) => {
      if (!validId(id)) return Promise.resolve({ ok: false, status: 404, code: 'not_found' });
      return run(email, async client => {
        const result = await client.query(`SELECT ${borrowerColumns} FROM public."Borrowers" WHERE "Hidden Flag" IS FALSE AND "Row ID" = $1 LIMIT 2`, [id]);
        if (result.rows.length !== 1) return { item: null };
        return { item: project(result.rows[0]) };
      }).then(result => result.ok && !result.item ? { ok: false, status: 404, code: 'not_found' } : result);
    },
  };
}
