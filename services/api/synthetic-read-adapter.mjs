import { evaluateReadAccess } from './read-access.mjs';

const statuses = ['not_paid', 'partially_paid', 'overdue', 'fully_paid'];
const money = value => value === null ? null : typeof value === 'string' && /^\d+(?:\.\d{1,2})?$/.test(value) ? value : null;
const localized = value => ({ en: typeof value?.en === 'string' ? value.en : '', th: typeof value?.th === 'string' ? value.th : '' });
const date = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
};
const projectSummary = row => ({
  id: row.id,
  name: localized(row.name),
  initials: typeof row.initials === 'string' ? row.initials : '',
  area: localized(row.area),
  hasActiveLoan: row.hasActiveLoan === true,
  outstandingPrincipal: money(row.outstandingPrincipal),
  collection: {
    status: statuses.includes(row.collection?.status) ? row.collection.status : null,
    amountDue: money(row.collection?.amountDue),
    amountCollected: money(row.collection?.amountCollected),
    amountRemaining: money(row.collection?.amountRemaining),
  },
  ...(row.note ? { note: localized(row.note) } : {}),
});
const projectDetail = row => ({
  ...projectSummary(row),
  loans: (Array.isArray(row.loans) ? row.loans : []).map(loan => ({
    id: typeof loan.id === 'string' ? loan.id : '',
    outstandingPrincipal: money(loan.outstandingPrincipal),
    nextDate: date(loan.nextDate),
    charges: (Array.isArray(loan.charges) ? loan.charges : []).map(charge => ({
      id: typeof charge.id === 'string' ? charge.id : '',
      label: localized(charge.label), amount: money(charge.amount), date: date(charge.date),
    })),
  })),
});

/** Synthetic read adapter only. No network, token verification, SQL, or financial calculation. */
export function createSyntheticReadAdapter({ getAccessContext, getRows, businessDate, asOf }) {
  function read(view, id, detail = false) {
    let access;
    try { access = evaluateReadAccess(getAccessContext()); } catch { return { ok: false, code: 'access_denied' }; }
    if (!access.ok) return access;
    if (!['borrowers', 'collection'].includes(view)) return { ok: false, code: 'not_found' };
    if (detail && (typeof id !== 'string' || id.length === 0)) return { ok: false, code: 'not_found' };
    try {
      const validAsOf = typeof asOf === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(asOf) && date(asOf.slice(0, 10)) !== null && Number.isFinite(Date.parse(asOf));
      if (date(businessDate) === null || !validAsOf) return { ok: false, code: 'source_unavailable' };
      const rows = getRows();
      if (!Array.isArray(rows) || rows.length > 100) return { ok: false, code: 'source_unavailable' };
      if (rows.some(row => !row || typeof row.id !== 'string' || !row.id.trim() || typeof row.hidden !== 'boolean' || (row.collection?.status !== null && !statuses.includes(row.collection?.status))) || new Set(rows.map(row => row.id)).size !== rows.length) return { ok: false, code: 'source_unavailable' };
      const eligible = rows.filter(row => row && typeof row.id === 'string' && (view === 'borrowers' ? row.hidden === false : statuses.includes(row.collection?.status)));
      const envelope = { ok: true, schemaVersion: 1, source: 'synthetic', businessDate, timezone: 'Asia/Bangkok', asOf };
      if (detail) {
        const matches = eligible.filter(row => row.id === id);
        if (matches.length !== 1) return { ok: false, code: 'not_found' };
        return { ...envelope, item: projectDetail(matches[0]) };
      }
      const ordered = view === 'collection' ? [...eligible].sort((a, b) => statuses.indexOf(a.collection.status) - statuses.indexOf(b.collection.status)) : eligible;
      return { ...envelope, items: ordered.map(projectSummary) };
    } catch { return { ok: false, code: 'source_unavailable' }; }
  }
  return {
    listBorrowers: () => read('borrowers'),
    listCollection: () => read('collection'),
    getBorrowerDetail: (id, view = 'borrowers') => read(view, id, true),
  };
}
