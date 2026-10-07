import { collectionCte, collectionQualitySql } from './collection-read-contract.mjs';
import { borrowerDisplayName, validLoanId } from './loan-read-contract.mjs';
export const validUpcomingDate = value => typeof value === 'string' && value >= '0001-01-01' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const decimal = value => value === null ? null : typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value) ? value : (() => { throw new Error('Invalid upcoming amount'); })();
const bases = ['Recorded', 'Recorded settlement', 'Recorded - review status', 'Projected'];
const failure = (code, status = 503) => ({ collectionError: code, collectionStatus: status });
export function encodeUpcomingCursor(value) {
  const { parentId, businessDate, dueDate, loanId, id } = value;
  if (![parentId, loanId, id].every(validLoanId) || !validUpcomingDate(businessDate) || !validUpcomingDate(dueDate)) throw new Error('Invalid upcoming cursor');
  return Buffer.from(JSON.stringify({ v: 1, kind: 'collection-upcoming', parentId, businessDate, dueDate, loanId, id })).toString('base64url');
}
export function decodeUpcomingCursor(cursor, parentId, businessDate, dueDate) {
  if (cursor === null || cursor === undefined || cursor === '') return null;
  if (typeof cursor !== 'string' || cursor.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('Invalid cursor');
  const row = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!row || row.v !== 1 || row.kind !== 'collection-upcoming' || row.parentId !== parentId || row.businessDate !== businessDate || row.dueDate !== dueDate || encodeUpcomingCursor(row) !== cursor) throw new Error('Invalid cursor');
  return row;
}
export const upcomingSummarySql = `SELECT s."Row ID" AS id, s."Due Date"::text AS "dueDate", s."Total Charge"::text AS "totalCharge"
  FROM public.oltp_upcoming_charge_summary_v2 s
  WHERE s."Ref Borrower" = $1 AND s."As Of Date" = $2::date
    AND EXISTS (SELECT 1 FROM public.oltp_upcoming_charge_events_v1 e
      WHERE e."Ref Borrower" = $1 AND e."As Of Date" = $2::date AND e."Due Date" = s."Due Date"
      AND e."Borrower Due Date Rank" BETWEEN 1 AND 5 AND e."Due Date" > $2::date AND e."Due Date" <= $3::date)
  ORDER BY s."Due Date" ASC LIMIT 6`;
export async function readUpcoming(client, { borrowerId, businessDate: requestedDate, dueDate = null, limit = 25, after = null }) {
  const clock = await client.query(`SELECT CURRENT_TIMESTAMP AS "asOf", (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS "businessDate"`);
  const { businessDate, asOf } = clock.rows[0];
  if (requestedDate !== businessDate) return failure('business_date_changed', 409);
  const metadata = { businessDate, asOf: new Date(asOf).toISOString(), timezone: 'Asia/Bangkok' };
  const quality = await client.query(collectionQualitySql, [borrowerId]);
  if (quality.rows[0]?.invalid !== false) return failure('source_unavailable');
  const membership = await client.query(`${collectionCte} SELECT id FROM summaries`, [businessDate, borrowerId]);
  if (membership.rows.length !== 1) return failure('not_found', 404);
  const coverage = await client.query(`SELECT "As Of Date"::text AS "businessDate", "Horizon End"::text AS "horizonEnd", "Review Loans" AS "reviewLoans", LEAST(($2::date + interval '3 months')::date, $2::date + 93)::text AS "expectedHorizonEnd" FROM public.oltp_upcoming_charge_coverage_v1 WHERE "Ref Borrower" = $1 LIMIT 2`, [borrowerId, businessDate]);
  if (coverage.rows.length !== 1) return failure('source_unavailable');
  const source = coverage.rows[0];
  if (!validUpcomingDate(source.businessDate)) return failure('source_unavailable');
  if (source.businessDate !== businessDate) return failure('business_date_changed', 409);
  if (!validUpcomingDate(source.horizonEnd) || source.horizonEnd !== source.expectedHorizonEnd || !Number.isInteger(source.reviewLoans) || source.reviewLoans < 0) return failure('source_unavailable');
  const summary = await client.query(upcomingSummarySql, [borrowerId, businessDate, source.horizonEnd]);
  const items = summary.rows.map(row => {
    if (!validLoanId(row.id) || !validUpcomingDate(row.dueDate) || row.dueDate <= businessDate || row.dueDate > source.horizonEnd) throw new Error('Invalid upcoming summary');
    return { id: row.id, dueDate: row.dueDate, totalCharge: decimal(row.totalCharge) };
  });
  if (items.length > 5 || new Set(items.map(row => row.dueDate)).size !== items.length || new Set(items.map(row => row.id)).size !== items.length) return failure('source_unavailable');
  const context = { ...metadata, horizonEnd: source.horizonEnd, reviewRequired: source.reviewLoans > 0 };
  if (!dueDate) return { ...context, items };
  const selected = items.find(row => row.dueDate === dueDate);
  if (!selected) return failure('not_found', 404);
  const invalidBasis = await client.query(`SELECT EXISTS (SELECT 1 FROM public.oltp_upcoming_charge_events_v1 e WHERE e."Ref Borrower" = $1 AND e."As Of Date" = $2::date AND e."Due Date" = $3::date AND e."Borrower Due Date Rank" BETWEEN 1 AND 5 AND (e."Basis" IS NULL OR e."Basis" NOT IN ('Recorded', 'Recorded settlement', 'Recorded - review status', 'Projected'))) AS invalid`, [borrowerId, businessDate, dueDate]);
  if (invalidBasis.rows[0]?.invalid !== false) return failure('source_unavailable');
  const result = await client.query(`SELECT e."Row ID" AS id, e."Ref Loan" AS "loanId", e."Principal Remaining"::text AS "principalRemaining", e."Interest Remaining"::text AS "interestRemaining", e."Amount Remaining"::text AS "amountRemaining", e."Basis" AS basis,
    b."Borrower Name" AS name, b."Description" AS description, l."Principal Amount"::numeric::text AS principal, l."Loan Date"::text AS "loanDate", l."Original Daily Interest Rate"::text AS rate
    FROM public.oltp_upcoming_charge_events_v1 e JOIN public."Loans" l ON e."Ref Loan" = l."Row ID" AND l."Ref Borrowers" = $1 JOIN public."Borrowers" b ON b."Row ID" = l."Ref Borrowers"
    WHERE e."Ref Borrower" = $1 AND e."As Of Date" = $2::date AND e."Due Date" = $3::date AND e."Borrower Due Date Rank" BETWEEN 1 AND 5 AND e."Due Date" > $2::date AND e."Due Date" <= $4::date
      AND ($5::text IS NULL OR e."Ref Loan" COLLATE "C" > $5::text COLLATE "C" OR (e."Ref Loan" COLLATE "C" = $5::text COLLATE "C" AND e."Row ID" COLLATE "C" > $6::text COLLATE "C"))
    ORDER BY e."Ref Loan" COLLATE "C", e."Row ID" COLLATE "C" LIMIT $7`, [borrowerId, businessDate, dueDate, source.horizonEnd, after?.loanId ?? null, after?.id ?? null, limit + 1]);
  const details = result.rows.slice(0, limit).map(row => {
    if (!validLoanId(row.id) || !validLoanId(row.loanId) || !bases.includes(row.basis)) throw new Error('Invalid upcoming detail');
    const principal = row.principal === null ? '' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'THB', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(decimal(row.principal)));
    const date = row.loanDate === null ? '' : validUpcomingDate(row.loanDate) ? row.loanDate.slice(8, 10) + '/' + row.loanDate.slice(5, 7) : (() => { throw new Error('Invalid loan date'); })();
    const rate = row.rate === null ? 'Unavailable' : decimal(row.rate) + '%';
    return { id: row.id, loanId: row.loanId, loanDisplayKey: `${borrowerDisplayName(row.name, row.description)}-${principal}-${date}-${rate}`, principalRemaining: decimal(row.principalRemaining), interestRemaining: decimal(row.interestRemaining), amountRemaining: decimal(row.amountRemaining), basis: row.basis };
  });
  return { ...context, dueDate, totalCharge: selected.totalCharge, items: details, nextCursor: result.rows.length > limit ? encodeUpcomingCursor({ parentId: borrowerId, businessDate, dueDate, loanId: details.at(-1).loanId, id: details.at(-1).id }) : null };
}
