import { borrowers, dueFor, sampleDate, type Borrower } from './fixtures';
import { createSyntheticReadAdapter, type BorrowerDetail, type BorrowerSummary, type SourceBorrower } from '../../../services/api/synthetic-read-adapter.mjs';
import type { AccessContext } from '../../../services/api/read-access.mjs';

export type PreviewAccessState = 'allowed' | 'signed_out' | 'expired' | 'access_denied' | 'unmapped_login';
export const previewBusinessDate = sampleDate;
const sampleNow = Date.parse('2026-10-07T05:00:00Z');
const sourceRows: SourceBorrower[] = borrowers.map(row => ({
  id: row.id, name: row.name, initials: row.initials, area: row.area,
  hidden: false, hasActiveLoan: row.loans.length > 0,
  outstandingPrincipal: row.principal.toFixed(2),
  collection: {
    status: row.status === 'overdue' ? 'overdue' : row.status === 'due' ? 'not_paid' : null,
    amountDue: dueFor(row).toFixed(2), amountCollected: '0.00', amountRemaining: dueFor(row).toFixed(2),
  },
  ...(row.note ? { note: row.note } : {}),
  loans: row.loans.map(loan => ({
    id: loan.id, outstandingPrincipal: loan.principal.toFixed(2), nextDate: loan.nextDate,
    charges: loan.charges.map(charge => ({ id: charge.id, label: charge.label, amount: charge.amount.toFixed(2), date: charge.date })),
  })),
}));

/** Deliberately fictional simulator inputs. This is not sign-in or a trusted browser session. */
export function previewAccessContext(state: PreviewAccessState): AccessContext {
  const config = { mode: 'synthetic' as const, environment: 'dev', issuer: 'synthetic-verifier', audience: 'synthetic-preview' };
  return {
    config, nowMs: sampleNow,
    principal: state === 'signed_out' ? null : { ...config, serverVerified: true, subject: 'synthetic-subject', email: 'sample-login@example.test', emailVerified: true, expiresAtMs: state === 'expired' ? sampleNow - 1 : sampleNow + 3600000, revoked: false, disabled: false },
    grants: state === 'access_denied' ? [] : [{ subject: 'synthetic-subject', environment: 'dev', enabled: true, permissions: ['oltp.read'] }],
    partners: state === 'unmapped_login' ? [] : [{ id: 'SYNTHETIC-PARTNER', loginEmail: 'sample-login@example.test' }],
  };
}
export function previewReadAdapter(state: PreviewAccessState) {
  return createSyntheticReadAdapter({ getAccessContext: () => previewAccessContext(state), getRows: () => sourceRows, businessDate: sampleDate, asOf: '2026-10-07T05:00:00Z' });
}

export type PreviewBorrower = Omit<Borrower, 'principal' | 'loans'> & {
  principal: number | null; remaining: number | null;
  hasActiveLoan: boolean; collectionStatus: BorrowerSummary['collection']['status'];
  loans: { id: string; principal: number | null; nextDate: string | null; charges: { id: string; label: Borrower['name']; amount: number | null; date: string | null }[] }[];
};
const displayAmount = (value: string | null) => value === null ? null : Number(value);
/** Number conversion here is display-only; the read contract retains decimal strings. */
export function toPreviewBorrower(row: BorrowerSummary | BorrowerDetail): PreviewBorrower {
  return {
    id: row.id, name: row.name, initials: row.initials, area: row.area,
    principal: displayAmount(row.outstandingPrincipal), remaining: displayAmount(row.collection.amountRemaining),
    hasActiveLoan: row.hasActiveLoan, collectionStatus: row.collection.status,
    status: row.collection.status === 'overdue' ? 'overdue' : row.collection.status ? 'due' : 'clear',
    note: row.note,
    loans: 'loans' in row ? row.loans.map(loan => ({ id: loan.id, principal: displayAmount(loan.outstandingPrincipal), nextDate: loan.nextDate, charges: loan.charges.map(charge => ({ id: charge.id, label: charge.label, amount: displayAmount(charge.amount), date: charge.date })) })) : [],
  };
}
