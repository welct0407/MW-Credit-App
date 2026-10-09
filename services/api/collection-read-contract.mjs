import { normalizeSearchQuery, searchQueryHash } from './search-query.mjs';
/** Collection reads mirror the OLTP slice; directory Hidden Flag is not its membership rule. */
import { borrowerDisplayName, validLoanId } from './loan-read-contract.mjs';
export const collectionStatuses = ['not_paid', 'partially_paid', 'overdue', 'fully_paid'];
const validDate = value => typeof value === 'string' && value >= '0001-01-01' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const decimal = value => value === null ? null : typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value) ? value : (() => { throw new Error('Invalid collection amount'); })();
export const collectionQualitySql = `SELECT EXISTS (
  SELECT 1 FROM public."Charges" c JOIN public."Loans" l ON c."Ref Loans" = l."Row ID"
  JOIN public."Borrowers" b ON l."Ref Borrowers" = b."Row ID"
  WHERE ($1::text IS NULL OR b."Row ID" = $1)
    AND (c."Payment Status" IS NULL OR c."Payment Status" NOT IN ('รอชำระ', 'ชำระบางส่วน', 'ชำระแล้ว') OR c."Charge Date" IS NULL OR NOT isfinite(c."Charge Date") OR c."Charge Date" < DATE '0001-01-01' OR c."Charge Date" > DATE '9999-12-31')
) AS invalid`;
export const collectionCte = `WITH today_repayments AS (
  SELECT r."Ref Charges" AS charge_id,
    CASE WHEN count(*) FILTER (WHERE r."Principal Paid" IS NULL OR r."Interest Paid" IS NULL) > 0 THEN NULL
      ELSE sum(r."Principal Paid"::numeric + r."Interest Paid"::numeric) END AS received_today
  FROM public."Repayments" r WHERE r."Payment Date" = $1::date GROUP BY r."Ref Charges"
), eligible AS (
  SELECT c."Row ID" AS id, l."Row ID" AS loan_id, b."Row ID" AS borrower_id,
    b."Borrower Name" AS borrower_name, b."Description" AS borrower_description,
    l."Principal Amount"::numeric::text AS principal_amount, l."Loan Date"::text AS loan_date,
    l."Original Daily Interest Rate"::text AS original_rate,
    c."Charge Date" AS charge_date, c."Payment Status" AS payment_status, c."Payment Date" AS payment_date,
    c."Amount Remaining" AS amount_remaining, c."Total Paid" AS total_paid,
    CASE WHEN tr.charge_id IS NULL THEN 0::numeric ELSE tr.received_today END AS received_today
  FROM public."Charges" c JOIN public."Loans" l ON c."Ref Loans" = l."Row ID"
  JOIN public."Borrowers" b ON l."Ref Borrowers" = b."Row ID"
  LEFT JOIN today_repayments tr ON tr.charge_id = c."Row ID"
  WHERE ($2::text IS NULL OR b."Row ID" = $2) AND (
    (c."Payment Status" <> 'ชำระแล้ว' AND c."Charge Date" <= $1::date)
    OR (c."Payment Status" = 'ชำระแล้ว' AND c."Payment Date" = $1::date)
    OR tr.charge_id IS NOT NULL)
), grouped AS (
  SELECT borrower_id AS id, borrower_name, borrower_description,
    CASE WHEN count(*) FILTER (WHERE charge_date < $1::date AND payment_status <> 'ชำระแล้ว') > 0 THEN 2
      WHEN count(*) FILTER (WHERE payment_status IN ('รอชำระ', 'ชำระบางส่วน')) = 0 THEN 3
      WHEN count(*) FILTER (WHERE payment_status = 'ชำระบางส่วน') > 0
        OR (count(*) FILTER (WHERE payment_status = 'ชำระแล้ว') > 0 AND count(*) FILTER (WHERE payment_status = 'รอชำระ') > 0) THEN 1
      ELSE 0 END AS rank,
    CASE WHEN count(*) FILTER (WHERE charge_date <= $1::date AND amount_remaining IS NULL) > 0 THEN NULL
      ELSE COALESCE(sum(amount_remaining) FILTER (WHERE charge_date <= $1::date), 0::numeric) END AS remaining,
    CASE WHEN count(*) FILTER (WHERE received_today IS NULL) > 0 THEN NULL ELSE sum(received_today) END AS collected
  FROM eligible GROUP BY borrower_id, borrower_name, borrower_description
), summaries AS (
  SELECT id, borrower_name, borrower_description, rank, (remaining + collected)::text AS amount_due,
    collected::text AS amount_collected, remaining::text AS amount_remaining FROM grouped
)`;
export function projectCollection(row) {
  if (!validLoanId(row.id) || !collectionStatuses[row.rank]) throw new Error('Invalid collection source');
  return { id: row.id, displayName: borrowerDisplayName(row.borrower_name, row.borrower_description), status: collectionStatuses[row.rank], amountDue: decimal(row.amount_due), amountCollected: decimal(row.amount_collected), amountRemaining: decimal(row.amount_remaining), ...(row.group_remaining !== undefined ? {groupRemaining:decimal(row.group_remaining)} : {}) };
}
export function projectCollectionCharge(row) {
  if (!validLoanId(row.id) || !validLoanId(row.loan_id) || !validDate(row.charge_date) || !['รอชำระ', 'ชำระบางส่วน', 'ชำระแล้ว'].includes(row.payment_status)) throw new Error('Invalid collection charge');
  const principal = row.principal_amount === null ? '' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'THB', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(decimal(row.principal_amount)));
  const date = row.loan_date === null ? '' : validDate(row.loan_date) ? row.loan_date.slice(8, 10) + '/' + row.loan_date.slice(5, 7) : (() => { throw new Error('Invalid loan date'); })();
  const rate = row.original_rate === null ? 'Unavailable' : decimal(row.original_rate) + '%';
  if (row.payment_date !== null && !validDate(row.payment_date)) throw new Error('Invalid payment date');
  return { id: row.id, loanId: row.loan_id, loanDisplayKey: `${borrowerDisplayName(row.borrower_name, row.borrower_description)}-${principal}-${date}-${rate}`, chargeDate: row.charge_date, paymentStatus: row.payment_status, paymentDate: row.payment_date, amountRemaining: decimal(row.amount_remaining), totalPaid: decimal(row.total_paid), receivedToday: decimal(row.received_today) };
}
export function encodeCollectionCursor(value, query = '') {
  const { kind, businessDate, id } = value;
  if (!validDate(businessDate) || !validLoanId(id)) throw new Error('Invalid cursor');
  let canonical;
  if (kind === 'collection' && Number.isInteger(value.rank) && value.rank >= 0 && value.rank <= 3) canonical = { v: 2, kind, businessDate, rank: value.rank, id, queryHash: searchQueryHash(query) };
  else if (kind === 'collection-charges' && validLoanId(value.parentId) && validDate(value.chargeDate)) canonical = { v: 1, kind, businessDate, parentId: value.parentId, chargeDate: value.chargeDate, id };
  else throw new Error('Invalid cursor');
  return Buffer.from(JSON.stringify(canonical)).toString('base64url');
}
export function decodeCollectionCursor(cursor, kind, parentId, query = '') {
  if (cursor === null || cursor === undefined || cursor === '') return null;
  if (typeof cursor !== 'string' || cursor.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('Invalid cursor');
  const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!parsed || parsed.kind !== kind || (kind === 'collection-charges' && parsed.parentId !== parentId)) throw new Error('Invalid cursor');
  const canonical = encodeCollectionCursor(parsed, query);
  const legacy = Buffer.from(JSON.stringify({ v: 1, kind, businessDate: parsed.businessDate, rank: parsed.rank, id: parsed.id })).toString('base64url');
  if (!(canonical === cursor || (kind === 'collection' && parsed.v === 1 && normalizeSearchQuery(query) === '' && legacy === cursor))) throw new Error('Invalid cursor');
  return parsed;
}
export async function readCollection(client, { limit, after, borrowerId = null, query = '' }) {
  const clock = await client.query(`SELECT CURRENT_TIMESTAMP AS "asOf", (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS "businessDate"`);
  const { businessDate, asOf } = clock.rows[0];
  const metadata = { businessDate, asOf: new Date(asOf).toISOString(), timezone: 'Asia/Bangkok' };
  if (after && after.businessDate !== businessDate) return { collectionError: 'business_date_changed', collectionStatus: 409 };
  const quality = await client.query(collectionQualitySql, [borrowerId]);
  if (quality.rows[0]?.invalid !== false) return { collectionError: 'source_unavailable', collectionStatus: 503 };
  if (borrowerId === null) {
    const result = await client.query(`${collectionCte}, filtered AS (SELECT * FROM summaries WHERE ($6::text = '' OR strpos(lower(COALESCE(borrower_name, '')), lower($6)) > 0 OR strpos(lower(COALESCE(borrower_description, '')), lower($6)) > 0)), totals AS (SELECT *, CASE WHEN count(*) FILTER (WHERE amount_remaining IS NULL) OVER (PARTITION BY rank)>0 THEN NULL ELSE sum(amount_remaining::numeric) OVER (PARTITION BY rank)::text END AS group_remaining FROM filtered) SELECT * FROM totals WHERE ($3::integer IS NULL OR rank > $3 OR (rank = $3 AND id COLLATE "C" > $4::text COLLATE "C")) ORDER BY rank, id COLLATE "C" LIMIT $5`, [businessDate, null, after?.rank ?? null, after?.id ?? null, limit + 1, query]);
    const items = result.rows.slice(0, limit).map(projectCollection);
    const last = result.rows[Math.min(limit, result.rows.length) - 1];
    return { ...metadata, items, nextCursor: result.rows.length > limit ? encodeCollectionCursor({ kind: 'collection', businessDate, rank: last.rank, id: last.id }, query) : null };
  }
  const summary = await client.query(`${collectionCte} SELECT * FROM summaries`, [businessDate, borrowerId]);
  if (summary.rows.length !== 1) return { collectionError: 'not_found', collectionStatus: 404 };
  const charges = await client.query(`${collectionCte} SELECT id, loan_id, payment_status, borrower_name, borrower_description, principal_amount, loan_date, original_rate, charge_date::text AS charge_date, payment_date::text AS payment_date, amount_remaining::text AS amount_remaining, total_paid::text AS total_paid, received_today::text AS received_today FROM eligible
    WHERE ($3::date IS NULL OR charge_date < $3::date OR (charge_date = $3::date AND id COLLATE "C" > $4::text COLLATE "C"))
    ORDER BY charge_date DESC, id COLLATE "C" LIMIT $5`, [businessDate, borrowerId, after?.chargeDate ?? null, after?.id ?? null, limit + 1]);
  const items = charges.rows.slice(0, limit).map(projectCollectionCharge);
  return { ...metadata, borrower: projectCollection(summary.rows[0]), items, nextCursor: charges.rows.length > limit ? encodeCollectionCursor({ kind: 'collection-charges', businessDate, parentId: borrowerId, chargeDate: items.at(-1).chargeDate, id: items.at(-1).id }) : null };
}
