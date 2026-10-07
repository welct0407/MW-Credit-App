// Borrower-scoped physical Loan reads only. No financial formulas or status inference.
export const loanColumns = [
  'l."Row ID" AS id', 'l."Ref Borrowers" AS "borrowerId"',
  'l."Loan Date"::text AS "loanDate"', 'l."Due Date"::text AS "dueDate"', 'l."Close Date"::text AS "closeDate"',
  'l."Loan Type" AS "loanType"', 'l."Loan Status" AS status',
  'l."Principal Amount"::numeric::text AS "principalAmount"',
  'l."Outstanding Principal"::text AS "outstandingPrincipal"',
  'l."Total Principal Received"::text AS "totalPrincipalReceived"',
  'l."Total Interest Received"::text AS "totalInterestReceived"',
  'l."Total Amount Received"::text AS "totalAmountReceived"',
  'l."Defaulted" AS defaulted', 'l."Auto Charge Enabled" AS "autoChargeEnabled"',
].join(', ');
export const validLoanId = id => typeof id === 'string' && id.length > 0 && id.length <= 256 && !/[\u0000-\u001f]/.test(id);
const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const amount = value => typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value) ? value : null;
export function projectLoan(row, borrowerId) {
  if (!validLoanId(row.id) || row.borrowerId !== borrowerId || (row.loanDate !== null && !validDate(row.loanDate))) throw new Error('Invalid loan source');
  return {
    id: row.id, borrowerId,
    loanDate: row.loanDate, dueDate: validDate(row.dueDate) ? row.dueDate : null, closeDate: validDate(row.closeDate) ? row.closeDate : null,
    loanType: typeof row.loanType === 'string' ? row.loanType : null, status: typeof row.status === 'string' ? row.status : null,
    principalAmount: amount(row.principalAmount), outstandingPrincipal: amount(row.outstandingPrincipal),
    totalPrincipalReceived: amount(row.totalPrincipalReceived), totalInterestReceived: amount(row.totalInterestReceived), totalAmountReceived: amount(row.totalAmountReceived),
    defaulted: typeof row.defaulted === 'boolean' ? row.defaulted : null,
    autoChargeEnabled: typeof row.autoChargeEnabled === 'boolean' ? row.autoChargeEnabled : null,
  };
}
export function encodeLoanCursor(borrowerId, row) {
  if (!validLoanId(borrowerId) || !validLoanId(row.id) || (row.loanDate !== null && !validDate(row.loanDate))) throw new Error('Invalid loan cursor');
  return Buffer.from(JSON.stringify({ v: 1, borrowerId, loanDate: row.loanDate, id: row.id }), 'utf8').toString('base64url');
}
export function decodeLoanCursor(cursor, borrowerId) {
  if (cursor === null || cursor === undefined || cursor === '') return null;
  if (typeof cursor !== 'string' || cursor.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('Invalid loan cursor');
  const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!parsed || parsed.v !== 1 || parsed.borrowerId !== borrowerId || encodeLoanCursor(borrowerId, parsed) !== cursor) throw new Error('Invalid loan cursor');
  return parsed;
}
