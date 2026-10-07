import { readCollection, decodeCollectionCursor } from './collection-read-contract.mjs';
import { loanColumns, validLoanId, projectLoan, encodeLoanCursor, decodeLoanCursor, loanRankSql, borrowerDisplayName } from './loan-read-contract.mjs';
const borrowerRankSql = 'CASE WHEN "Has Active Loan" IS TRUE THEN 0 WHEN "Has Active Loan" IS FALSE THEN 1 ELSE 2 END';
const borrowerRank = value => value === true ? 0 : value === false ? 1 : 2;
const borrowerColumns = '"Row ID" AS id, "Borrower Name" AS name, "Description" AS description, "Total Interest Earned"::text AS "totalProfitEarned", "Creation Date"::text AS "createdDate", "Has Active Loan" AS "hasActiveLoan", "Total Outstanding Principal"::text AS "outstandingPrincipal", "Borrower Note" AS note';
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 256 && !/[\u0000-\u001f]/.test(id);
const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : null;
};
function project(row) {
  if (!validId(row.id)) throw new Error('Invalid read source');
  return { id: row.id, borrowerDisplayName: borrowerDisplayName(row.name, row.description), totalProfitEarned: typeof row.totalProfitEarned === 'string' && /^-?\d+(?:\.\d+)?$/.test(row.totalProfitEarned) ? row.totalProfitEarned : null, name: typeof row.name === 'string' ? row.name : null, createdDate: validDate(row.createdDate), hasActiveLoan: typeof row.hasActiveLoan === 'boolean' ? row.hasActiveLoan : null, outstandingPrincipal: typeof row.outstandingPrincipal === 'string' && /^-?\d+(?:\.\d+)?$/.test(row.outstandingPrincipal) ? row.outstandingPrincipal : null, note: typeof row.note === 'string' ? row.note : null };
}
export function encodeCursor(row) {
  const rank = row.rank ?? borrowerRank(row.hasActiveLoan);
  if (![0, 1, 2].includes(rank) || !validId(row.id) || (row.createdDate !== null && !validDate(row.createdDate))) throw new Error('Invalid cursor');
  return Buffer.from(JSON.stringify({ v: 2, rank, createdDate: row.createdDate, id: row.id }), 'utf8').toString('base64url');
}
export function decodeCursor(cursor) {
  if (cursor === null || cursor === undefined || cursor === '') return null;
  if (typeof cursor !== 'string' || cursor.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('Invalid cursor');
  const row = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!row || row.v !== 2 || encodeCursor(row) !== cursor) throw new Error('Invalid cursor');
  return row;
}
export function createBorrowerReadStore({ pool, config, now = () => new Date() }) {
  async function run(email, operation, repeatableRead = false) {
    if (email !== config.ownerEmail) return { ok: false, status: 403, code: 'access_denied' };
    const client = await pool.connect();
    try {
      await client.query(repeatableRead ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN READ ONLY');
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
    session: email => run(email, async () => ({ permission: 'oltp.read', scope: 'borrowers-related-loans-and-collection' })),
    listCollection: (email, { limit = 25, cursor = null } = {}) => {
      let after;
      try { after = decodeCollectionCursor(cursor, 'collection'); if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error(); }
      catch { return Promise.resolve({ ok: false, status: 400, code: 'invalid_request' }); }
      return run(email, client => readCollection(client, { limit, after }), true)
        .then(result => result.collectionError ? { ok: false, status: result.collectionStatus, code: result.collectionError } : result);
    },
    getCollectionCharges: (email, borrowerId, { limit = 25, cursor = null } = {}) => {
      if (!validId(borrowerId)) return Promise.resolve({ ok: false, status: 404, code: 'not_found' });
      let after;
      try { after = decodeCollectionCursor(cursor, 'collection-charges', borrowerId); if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error(); }
      catch { return Promise.resolve({ ok: false, status: 400, code: 'invalid_request' }); }
      return run(email, client => readCollection(client, { limit, after, borrowerId }), true)
        .then(result => result.collectionError ? { ok: false, status: result.collectionStatus, code: result.collectionError } : result);
    },
    listBorrowers: (email, { limit = 25, cursor = null } = {}) => {
      let after;
      try { after = decodeCursor(cursor); if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error(); }
      catch { return Promise.resolve({ ok: false, status: 400, code: 'invalid_request' }); }
      return run(email, async client => {
        const result = await client.query(`SELECT ${borrowerColumns} FROM public."Borrowers" WHERE "Hidden Flag" IS FALSE
          AND ($1::boolean IS FALSE OR (${borrowerRankSql}) > $2::integer OR ((${borrowerRankSql}) = $2::integer AND (
            ($3::date IS NOT NULL AND ("Creation Date" > $3::date OR "Creation Date" IS NULL OR ("Creation Date" = $3::date AND "Row ID" COLLATE "C" > $4::text COLLATE "C")))
            OR ($3::date IS NULL AND "Creation Date" IS NULL AND "Row ID" COLLATE "C" > $4::text COLLATE "C"))))
          ORDER BY (${borrowerRankSql}), "Creation Date" ASC NULLS LAST, "Row ID" COLLATE "C" ASC LIMIT $5`, [after !== null, after?.rank ?? null, after?.createdDate ?? null, after?.id ?? null, limit + 1]);
        const items = result.rows.slice(0, limit).map(project);
        return { items, nextCursor: result.rows.length > limit ? encodeCursor(items.at(-1)) : null, order: 'active-inactive-unknown,created-date-asc-null-last,row-id-asc' };
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
          AND ($2::boolean IS FALSE OR (${loanRankSql}) > $3::integer OR ((${loanRankSql}) = $3::integer AND (
            ($4::date IS NOT NULL AND (l."Loan Date" < $4::date OR l."Loan Date" IS NULL OR (l."Loan Date" = $4::date AND l."Row ID" COLLATE "C" > $5::text COLLATE "C")))
            OR ($4::date IS NULL AND l."Loan Date" IS NULL AND l."Row ID" COLLATE "C" > $5::text COLLATE "C"))))
          ORDER BY (${loanRankSql}), l."Loan Date" DESC NULLS LAST, l."Row ID" COLLATE "C" ASC LIMIT $6`, [borrowerId, after !== null, after?.rank ?? null, after?.loanDate ?? null, after?.id ?? null, limit + 1]);
        const items = result.rows.slice(0, limit).map(row => projectLoan(row, borrowerId));
        return { borrowerId, items, nextCursor: result.rows.length > limit ? encodeLoanCursor(borrowerId, items.at(-1)) : null, order: 'open-closed-other,loan-date-desc-null-last,row-id-asc' };
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
