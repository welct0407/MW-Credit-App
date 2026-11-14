import { BUSINESS_TZ } from '../lib/business-date.mjs';
import { lateChargeSchema } from '../lib/late-charge-schema.mjs';
import { searchQueryHash } from './search-query.mjs';
/** Collection reads mirror the OLTP slice; directory Hidden Flag is not its membership rule. */
import { borrowerDisplayName, validLoanId } from './loan-read-contract.mjs';
/** R137 (owner decision of 9 November 2026; V140 in olap_borrowers_analytics): long_overdue = an unpaid past-due charge and
 * LONG_OVERDUE_SINCE_PAYMENT_DAYS or more days since the borrower's last payment (a borrower who never paid counts from the
 * first charge date); overdue = an unpaid past-due charge with a payment within the last 7 days. A payment is any posted
 * repayment of any amount (principal + interest + late charge above 0) on or before the business date, per borrower across
 * all loans; a 'Referral Rebate Offset' or 'Net-off at Disbursement' receipt is no cash from the borrower and does not count.
 * The first charge date ignores df10: (default-loss) rows. */
export const collectionStatuses = ['not_paid', 'partially_paid', 'overdue', 'long_overdue', 'fully_paid'];
export const LONG_OVERDUE_SINCE_PAYMENT_DAYS = 8;
/** Receipt methods that move no cash from the borrower (V122 rebate offset; first-day and V138 rollover net-offs). */
export const NON_CASH_PAYMENT_METHODS = ['Referral Rebate Offset', 'Net-off at Disbursement'];
const validDate = value => typeof value === 'string' && value >= '0001-01-01' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const decimal = value => value === null ? null : typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value) ? value : (() => { throw new Error('Invalid collection amount'); })();
export const collectionQualitySql = `SELECT EXISTS (
  SELECT 1 FROM public."Charges" c JOIN public."Loans" l ON c."Ref Loans" = l."Row ID"
  JOIN public."Borrowers" b ON l."Ref Borrowers" = b."Row ID"
  WHERE ($1::text IS NULL OR b."Row ID" = $1)
    AND (c."Payment Status" IS NULL OR c."Payment Status" NOT IN ('รอชำระ', 'ชำระบางส่วน', 'ชำระแล้ว') OR c."Charge Date" IS NULL OR NOT isfinite(c."Charge Date") OR c."Charge Date" < DATE '0001-01-01' OR c."Charge Date" > DATE '9999-12-31')
) AS invalid`;
/** R137: each borrower's last payment on or before the business date. With the reader's payment-source grants (R114 COL-2:
 * Repayments."Ref Payment", Payments "Row ID" and "Payment Method"), a posted receipt that moved cash: the receipt is joined
 * and its method is neither a rebate offset nor a net-off. Without them (a reader without the R114 grants) the fallback reads
 * only columns every reader has: any repayment with an amount above 0, whatever its receipt, so a rebate-offset or net-off
 * repayment (and an unlinked legacy one) counts as a payment. The fallback can only show a borrower as Overdue who would
 * be Long Overdue under the full rule, never the reverse; the board never fails for the missing grants. */
const lastPaymentSql = (late, paymentSource) => `SELECT pl."Ref Borrowers" AS lp_borrower, max(r."Payment Date") AS last_paid
  FROM public."Repayments" r${paymentSource ? ' JOIN public."Payments" p ON p."Row ID" = r."Ref Payment"' : ''}
  JOIN public."Charges" pc ON pc."Row ID" = r."Ref Charges" JOIN public."Loans" pl ON pl."Row ID" = pc."Ref Loans"
  WHERE r."Payment Date" <= $1::date AND ($2::text IS NULL OR pl."Ref Borrowers" = $2)${paymentSource ? `
    AND p."Payment Method" IS DISTINCT FROM '${NON_CASH_PAYMENT_METHODS[0]}' AND p."Payment Method" IS DISTINCT FROM '${NON_CASH_PAYMENT_METHODS[1]}'` : ''}
    AND r."Principal Paid"::numeric + r."Interest Paid"::numeric${late ? ' + r."Late Charge Paid"::numeric' : ''} > 0
  GROUP BY pl."Ref Borrowers"`;
/** R118 (V132): collectionCteFor(true) adds the late charge to received today and the charge rows' late columns; the
 * plain collectionCte is the shape before V132 (an older schema, and the membership and receipt reads that need neither).
 * R137: paymentSource (default true) selects the full last-payment rule; false is the no-grant fallback (lastPaymentSql). */
export const collectionCteFor = (late, paymentSource = true) => `WITH today_repayments AS (
  SELECT r."Ref Charges" AS charge_id,
    CASE WHEN count(*) FILTER (WHERE r."Principal Paid" IS NULL OR r."Interest Paid" IS NULL) > 0 THEN NULL
      ELSE sum(r."Principal Paid"::numeric + r."Interest Paid"::numeric${late ? ' + r."Late Charge Paid"::numeric' : ''}) END AS received_today
  FROM public."Repayments" r WHERE r."Payment Date" = $1::date GROUP BY r."Ref Charges"
), last_pay AS (
  -- R137: each borrower's last payment on or before the business date (lastPaymentSql: full rule or the no-grant fallback).
  ${lastPaymentSql(late, paymentSource)}
), first_charge AS (
  -- R137: a borrower who never paid counts from the first charge date (df10: default-loss rows excluded).
  SELECT fl."Ref Borrowers" AS fc_borrower, min(fc."Charge Date") AS first_due
  FROM public."Charges" fc JOIN public."Loans" fl ON fl."Row ID" = fc."Ref Loans"
  WHERE NOT starts_with(fc."Row ID", 'df10:') AND ($2::text IS NULL OR fl."Ref Borrowers" = $2)
  GROUP BY fl."Ref Borrowers"
), eligible AS (
  SELECT c."Row ID" AS id, l."Row ID" AS loan_id, b."Row ID" AS borrower_id,
    b."Borrower Name" AS borrower_name, b."Description" AS borrower_description,
    l."Principal Amount"::numeric::text AS principal_amount, l."Loan Date"::text AS loan_date,
    l."Original Daily Interest Rate"::text AS original_rate,
    c."Charge Date" AS charge_date, c."Payment Status" AS payment_status, c."Payment Date" AS payment_date,
    c."Amount Remaining" AS amount_remaining, c."Total Paid" AS total_paid,
    ${late ? 'c."Late Charge Due"::numeric AS late_charge_due, c."Late Charge Remaining" AS late_charge_remaining' : '0::numeric AS late_charge_due, 0::numeric AS late_charge_remaining'},
    CASE WHEN tr.charge_id IS NULL THEN 0::numeric ELSE tr.received_today END AS received_today
  FROM public."Charges" c JOIN public."Loans" l ON c."Ref Loans" = l."Row ID"
  JOIN public."Borrowers" b ON l."Ref Borrowers" = b."Row ID"
  LEFT JOIN today_repayments tr ON tr.charge_id = c."Row ID"
  WHERE ($2::text IS NULL OR b."Row ID" = $2) AND (
    (c."Payment Status" <> 'ชำระแล้ว' AND c."Charge Date" <= $1::date)
    OR (c."Payment Status" = 'ชำระแล้ว' AND c."Payment Date" = $1::date)
    OR tr.charge_id IS NOT NULL
    OR c."Charge Date" = $1::date)
), grouped AS (
  SELECT borrower_id AS id, borrower_name, borrower_description,
    ($1::date - COALESCE(last_paid, first_due))::integer AS since_days, last_paid IS NULL AS never_paid,
    CASE WHEN count(*) FILTER (WHERE charge_date < $1::date AND payment_status <> 'ชำระแล้ว') > 0
        AND $1::date - COALESCE(last_paid, first_due) >= ${LONG_OVERDUE_SINCE_PAYMENT_DAYS} THEN 3
      WHEN count(*) FILTER (WHERE charge_date < $1::date AND payment_status <> 'ชำระแล้ว') > 0 THEN 2
      -- R110: a future charge part-paid today (pay forward) is not due yet, so it never makes the tile partly paid.
      WHEN count(*) FILTER (WHERE charge_date <= $1::date AND payment_status IN ('รอชำระ', 'ชำระบางส่วน')) = 0 THEN 4
      WHEN count(*) FILTER (WHERE charge_date <= $1::date AND payment_status = 'ชำระบางส่วน') > 0
        OR (count(*) FILTER (WHERE charge_date <= $1::date AND payment_status = 'ชำระแล้ว') > 0 AND count(*) FILTER (WHERE charge_date <= $1::date AND payment_status = 'รอชำระ') > 0) THEN 1
      ELSE 0 END AS rank,
    ($1::date - min(charge_date) FILTER (WHERE charge_date < $1::date AND payment_status <> 'ชำระแล้ว'))::integer AS overdue_days,
    CASE WHEN count(*) FILTER (WHERE charge_date <= $1::date AND amount_remaining IS NULL) > 0 THEN NULL
      ELSE COALESCE(sum(amount_remaining) FILTER (WHERE charge_date <= $1::date), 0::numeric) END AS remaining,
    CASE WHEN count(*) FILTER (WHERE received_today IS NULL) > 0 THEN NULL ELSE sum(received_today) END AS collected,
    CASE WHEN count(*) FILTER (WHERE charge_date = $1::date AND payment_status = 'ชำระแล้ว' AND payment_date < $1::date AND total_paid IS NULL) > 0 THEN NULL
      ELSE COALESCE(sum(total_paid::numeric) FILTER (WHERE charge_date = $1::date AND payment_status = 'ชำระแล้ว' AND payment_date < $1::date), 0::numeric) END AS prepaid,
    (count(*) FILTER (WHERE charge_date = $1::date) > 0
      AND count(*) FILTER (WHERE charge_date = $1::date) = count(*) FILTER (WHERE charge_date = $1::date AND payment_status = 'ชำระแล้ว' AND payment_date < $1::date)
      AND count(*) FILTER (WHERE payment_status <> 'ชำระแล้ว') = 0) AS prepaid_only,
    -- R110 COL-1: the latest earlier payment date of today's charges paid in advance (the "Paid in advance" source).
    max(payment_date) FILTER (WHERE charge_date = $1::date AND payment_status = 'ชำระแล้ว' AND payment_date < $1::date)::text AS prepaid_payment_date
  FROM eligible LEFT JOIN last_pay ON lp_borrower = borrower_id LEFT JOIN first_charge ON fc_borrower = borrower_id
  GROUP BY borrower_id, borrower_name, borrower_description, last_paid, first_due
), summaries AS (
  SELECT id, borrower_name, borrower_description, rank, overdue_days,
    -- R137: days since the last payment (or the first charge) on long overdue rows only; never_paid says which.
    CASE WHEN rank = 3 THEN since_days END AS since_last_payment_days, CASE WHEN rank = 3 THEN never_paid END AS never_paid,
    -- R102/R137 owner decision: the long overdue group lists the fewest days since the last payment first; 0 elsewhere.
    CASE WHEN rank = 3 THEN since_days ELSE 0 END AS sort_days, (remaining + collected)::text AS amount_due,
    collected::text AS amount_collected, remaining::text AS amount_remaining,
    prepaid::text AS prepaid_today, prepaid_only, prepaid_payment_date FROM grouped
)`;
export const collectionCte = collectionCteFor(false);
/** R114 COL-2: whether the reader may join a prepaid charge's repayments to their payment (column grants added by the
 * reader capability contract); without them the source stays unknown and the caption keeps the date. */
export const prepaidSourceAllowedSql = `SELECT has_column_privilege('public."Payments"','Row ID','SELECT')
  AND has_column_privilege('public."Payments"','Payment Method','SELECT')
  AND has_column_privilege('public."Repayments"','Ref Payment','SELECT') AS allowed`;
/** R114 COL-2: the borrowers (of $2) whose latest advance toward today's charges ($1) was a Referral Rebate Offset payment. */
export const prepaidSourceSql = `WITH advance AS (
  SELECT l."Ref Borrowers" AS id, r."Payment Date" AS paid_on, p."Payment Method" AS method
  FROM public."Charges" c JOIN public."Loans" l ON l."Row ID" = c."Ref Loans"
  JOIN public."Repayments" r ON r."Ref Charges" = c."Row ID" JOIN public."Payments" p ON p."Row ID" = r."Ref Payment"
  WHERE c."Charge Date" = $1::date AND r."Payment Date" < $1::date AND l."Ref Borrowers" = ANY($2::text[])
)
SELECT id FROM advance a WHERE paid_on = (SELECT max(b.paid_on) FROM advance b WHERE b.id = a.id)
GROUP BY id HAVING bool_or(method = 'Referral Rebate Offset')`;
/** R114 COL-2: items paid in advance by a rebate offset get prepaidSource 'rebate_offset' (others are left as they are);
 * allowed is the prepaidSourceAllowedSql answer the read took once (R137 uses it for the last-payment rule too). */
async function markPrepaidSource(client, businessDate, items, allowed) {
  const ids = items.filter(item => item.prepaidOnly).map(item => item.id);
  if (!ids.length || allowed !== true) return items;
  const offset = new Set((await client.query(prepaidSourceSql, [businessDate, ids])).rows.map(row => row.id));
  return items.map(item => offset.has(item.id) ? { ...item, prepaidSource: 'rebate_offset' } : item);
}
// R146 group chat summary (V146). The reader login holds column grants only (reader-capability-contract.json), so the guard
// is the table's existence plus SELECT on every column read: a reader without the grant, or a database before V146, gets
// null instead of a failure. No age filter here: freshness is decided on the device from lastMessageAt, so the result does
// not change with the clock.
export const GROUP_CHAT_COLUMNS = ['borrower_id', 'shared_group', 'headline_th', 'headline_en', 'points', 'last_speaker_role', 'last_speaker_borrower_id', 'message_count', 'last_message_at', 'generated_at'];
export const groupChatAllowedSql = `SELECT COALESCE((SELECT bool_and(has_column_privilege(t.oid, c.name, 'SELECT'))
  FROM (SELECT to_regclass('public.pwa_group_chat_summaries')::oid AS oid) t, unnest(ARRAY[${GROUP_CHAT_COLUMNS.map(name => `'${name}'`).join(', ')}]) c(name)
  WHERE t.oid IS NOT NULL), false) AS allowed`;
export const groupChatListSql = `SELECT g.borrower_id AS id, g.last_message_at FROM public.pwa_group_chat_summaries g WHERE g.borrower_id = ANY($1::text[])`;
export const groupChatDetailSql = `SELECT ${GROUP_CHAT_COLUMNS.map(name => 'g.' + name).join(', ')} FROM public.pwa_group_chat_summaries g WHERE g.borrower_id = $1`;
const GROUP_CHAT_ROLES = ['borrower', 'partner', 'referrer', 'business', 'other'];
const instant = value => { const time = value instanceof Date ? value.getTime() : Date.parse(value); return Number.isFinite(time) ? new Date(time).toISOString() : null; };
const chatSpeaker = (role, borrowerId) => {
  if (!GROUP_CHAT_ROLES.includes(role)) return null;
  if (['borrower', 'referrer'].includes(role)) return typeof borrowerId === 'string' && borrowerId ? { role, borrowerId } : null;
  return { role };
};
/** One pwa_group_chat_summaries row as the detail's groupChat; null for a row that is not the V146 shape (display only:
 * a bad summary never fails the collection read). */
export function projectGroupChat(row) {
  if (!row || typeof row.headline_th !== 'string' || typeof row.headline_en !== 'string' || !Array.isArray(row.points) || row.points.length > 4) return null;
  const lastSpeaker = chatSpeaker(row.last_speaker_role, row.last_speaker_borrower_id), lastMessageAt = instant(row.last_message_at), generatedAt = instant(row.generated_at);
  const points = row.points.map(point => {
    const speaker = point && typeof point === 'object' ? chatSpeaker(point.speaker?.role, point.speaker?.borrowerId) : null;
    return speaker && typeof point.th === 'string' && typeof point.en === 'string' ? { speaker, th: point.th, en: point.en } : null;
  });
  if (!lastSpeaker || !lastMessageAt || !generatedAt || points.includes(null) || !Number.isSafeInteger(row.message_count) || typeof row.shared_group !== 'boolean') return null;
  return { headline: { th: row.headline_th, en: row.headline_en }, points, lastSpeaker, lastMessageAt, generatedAt, messageCount: row.message_count, shared: row.shared_group };
}
// R149 group chat seen (V147): the signed-in user's own "seen up to" value per borrower, so the list mark agrees across
// that user's devices. Same guard as the summaries (existence plus SELECT on every column read); without it the field
// is left out and the device decides from its own storage, as in R146.
export const GROUP_CHAT_SEEN_COLUMNS = ['borrower_id', 'partner_id', 'seen_last_message_at'];
export const groupChatSeenAllowedSql = `SELECT COALESCE((SELECT bool_and(has_column_privilege(t.oid, c.name, 'SELECT'))
  FROM (SELECT to_regclass('public.pwa_group_chat_seen')::oid AS oid) t, unnest(ARRAY[${GROUP_CHAT_SEEN_COLUMNS.map(name => `'${name}'`).join(', ')}]) c(name)
  WHERE t.oid IS NOT NULL), false) AS allowed`;
export const groupChatSeenListSql = `SELECT t.borrower_id AS id, t.seen_last_message_at FROM public.pwa_group_chat_seen t WHERE t.partner_id = $2 AND t.borrower_id = ANY($1::text[])`;
/** R146: chatSummaryAt (the summary's last substantive message time, or null) on every list item.
 * R149: with the reader's Partner id, chatSeenAt too (that user's stored seen time, or null); the field is omitted when
 * the caller has no Partner id, the summaries are not readable, or the seen table is missing or not granted. */
async function markChatSummary(client, items, partnerId) {
  const none = () => items.map(item => ({ ...item, chatSummaryAt: null }));
  if (!items.length || (await client.query(groupChatAllowedSql)).rows[0]?.allowed !== true) return none();
  const ids = items.map(item => item.id);
  const found = new Map((await client.query(groupChatListSql, [ids])).rows.map(row => [row.id, instant(row.last_message_at)]));
  const marked = items.map(item => ({ ...item, chatSummaryAt: found.get(item.id) ?? null }));
  if (typeof partnerId !== 'string' || !partnerId || (await client.query(groupChatSeenAllowedSql)).rows[0]?.allowed !== true) return marked;
  const seen = new Map((await client.query(groupChatSeenListSql, [ids, partnerId])).rows.map(row => [row.id, instant(row.seen_last_message_at)]));
  return marked.map(item => ({ ...item, chatSeenAt: seen.get(item.id) ?? null }));
}
// R153 (V148) the borrower's Instagram group chat link, "Borrowers"."IG Group URL", set by the owner. One rule in SQL (the
// column check borrowers_ig_group_url_check and pwa_submit_operation_v2), here (the borrower command's canonicaliser in
// services/business/borrowers.mjs imports it) and in the PWA (apps/pwa/src/ig-group-url.ts).
export const IG_GROUP_URL_PATTERN = /^https:\/\/((www\.)?instagram\.com\/direct\/|ig\.me\/)[A-Za-z0-9._~%/?=&+-]{1,255}$/;
export const validIgGroupUrl = value => typeof value === 'string' && IG_GROUP_URL_PATTERN.test(value);
// R154 (V149) the borrower's Instagram group invite link, "Borrowers"."IG Group Invite Link" (https://ig.me/j/... only): it
// opens the group itself in the Instagram app on a phone. The same one-rule arrangement as the group chat link.
export const IG_GROUP_INVITE_PATTERN = /^https:\/\/ig\.me\/j\/[A-Za-z0-9._~%/?=&+-]{1,255}$/;
export const validIgGroupInviteLink = value => typeof value === 'string' && IG_GROUP_INVITE_PATTERN.test(value);
// The reader login holds column grants only, and has_column_privilege by column name raises before the column exists, so
// each guard finds its column in pg_attribute first: no column (an older database) or no grant reads false and that link is
// left out. One guard per column: the reader is granted each column after its own migration.
const borrowerColumnAllowedSql = column => `SELECT COALESCE((SELECT has_column_privilege(a.attrelid, a.attnum, 'SELECT') FROM pg_attribute a
  WHERE a.attrelid = to_regclass('public."Borrowers"') AND a.attname = '${column}' AND a.attnum > 0 AND NOT a.attisdropped), false) AS allowed`;
export const igGroupUrlAllowedSql = borrowerColumnAllowedSql('IG Group URL');
export const igGroupInviteAllowedSql = borrowerColumnAllowedSql('IG Group Invite Link');
export const igGroupInviteSql = `SELECT b."Row ID" AS id, b."IG Group Invite Link" AS url FROM public."Borrowers" b WHERE b."Row ID" = ANY($1::text[]) AND b."IG Group Invite Link" IS NOT NULL`;
export const igGroupUrlSql = `SELECT b."Row ID" AS id, b."IG Group URL" AS url FROM public."Borrowers" b WHERE b."Row ID" = ANY($1::text[]) AND b."IG Group URL" IS NOT NULL`;
/** R153: id -> link for the given borrowers (only links that match the rule); empty when the column is missing or not granted. */
export async function readIgGroupUrls(client, ids) {
  if (!ids.length || (await client.query(igGroupUrlAllowedSql)).rows[0]?.allowed !== true) return new Map();
  return new Map((await client.query(igGroupUrlSql, [ids])).rows.filter(row => validIgGroupUrl(row.url)).map(row => [row.id, row.url]));
}
/** R154: id -> {url, inviteUrl} for the given borrowers, each present only when its column is readable and the value
 * matches its rule. */
export async function readIgGroupLinks(client, ids) {
  const links = new Map(), urls = await readIgGroupUrls(client, ids);
  for (const [id, url] of urls) links.set(id, { url });
  if (ids.length && (await client.query(igGroupInviteAllowedSql)).rows[0]?.allowed === true) {
    for (const row of (await client.query(igGroupInviteSql, [ids])).rows) if (validIgGroupInviteLink(row.url)) links.set(row.id, { ...links.get(row.id), inviteUrl: row.url });
  }
  return links;
}
/** R158 (owner, 14 November 2026: "i want the link to the group to be moved out of the summary card ... i want to open the
 * group even there's no conversation"): every collection item (list and detail borrower) carries chatUrl and chatInviteUrl,
 * each only when its column is readable and the value valid. The Collection page header opens one per device; the summary
 * card no longer carries the links. */
export async function markGroupLinks(client, items) {
  if (!items.length) return items;
  const links = await readIgGroupLinks(client, items.map(item => item.id));
  return items.map(item => {
    const link = links.get(item.id);
    return link ? { ...item, ...(link.url ? { chatUrl: link.url } : {}), ...(link.inviteUrl ? { chatInviteUrl: link.inviteUrl } : {}) } : item;
  });
}
/** R146: the borrower's current group chat summary, or null (none, or the reader may not read the table). R158: without
 * the group links (they ride on the collection item, markGroupLinks). */
async function readGroupChat(client, borrowerId) {
  if ((await client.query(groupChatAllowedSql)).rows[0]?.allowed !== true) return null;
  return projectGroupChat((await client.query(groupChatDetailSql, [borrowerId])).rows[0]);
}
export function projectCollection(row) {
  if (!validLoanId(row.id) || !collectionStatuses[row.rank] || typeof row.prepaid_only !== 'boolean' || !(row.overdue_days === null || (Number.isSafeInteger(row.overdue_days) && row.overdue_days > 0))) throw new Error('Invalid collection source');
  // R137: a long overdue row carries the days since the last payment (8 or more) and whether the borrower never paid; other
  // rows carry null for both. A source row without the columns (an older reader) omits them.
  const since = row.since_last_payment_days, never = row.never_paid;
  if (since !== undefined && (row.rank === 3 ? !(Number.isSafeInteger(since) && since >= LONG_OVERDUE_SINCE_PAYMENT_DAYS && typeof never === 'boolean') : !(since === null && never === null))) throw new Error('Invalid collection source');
  // R102: overdueDays counts from the oldest overdue unpaid charge (null when none is overdue).
  // R097: prepaidToday is what was paid on earlier days toward charges dated today (row display only; collected stays cash today).
  // R110: prepaidPaymentDate names when that advance was paid (null when nothing today was paid earlier).
  if (row.prepaid_payment_date !== undefined && row.prepaid_payment_date !== null && !validDate(row.prepaid_payment_date)) throw new Error('Invalid collection source');
  return { id: row.id, displayName: borrowerDisplayName(row.borrower_name, row.borrower_description), status: collectionStatuses[row.rank], overdueDays: row.overdue_days, ...(since !== undefined ? { sinceLastPaymentDays: since, neverPaid: never } : {}), amountDue: decimal(row.amount_due), amountCollected: decimal(row.amount_collected), amountRemaining: decimal(row.amount_remaining), prepaidToday: decimal(row.prepaid_today), prepaidOnly: row.prepaid_only, ...(row.prepaid_payment_date !== undefined ? { prepaidPaymentDate: row.prepaid_payment_date } : {}), ...(row.group_remaining !== undefined ? {groupRemaining:decimal(row.group_remaining),...(row.group_collected!==undefined?{groupCollected:decimal(row.group_collected)}:{})} : {}) };
}
export function projectCollectionCharge(row) {
  if (!validLoanId(row.id) || !validLoanId(row.loan_id) || !validDate(row.charge_date) || !['รอชำระ', 'ชำระบางส่วน', 'ชำระแล้ว'].includes(row.payment_status)) throw new Error('Invalid collection charge');
  const principal = row.principal_amount === null ? '' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'THB', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(decimal(row.principal_amount)));
  const date = row.loan_date === null ? '' : validDate(row.loan_date) ? row.loan_date.slice(8, 10) + '/' + row.loan_date.slice(5, 7) : (() => { throw new Error('Invalid loan date'); })();
  const rate = row.original_rate === null ? 'Unavailable' : decimal(row.original_rate) + '%';
  if (row.payment_date !== null && !validDate(row.payment_date)) throw new Error('Invalid payment date');
  return { id: row.id, loanId: row.loan_id, loanDisplayKey: `${borrowerDisplayName(row.borrower_name, row.borrower_description)}-${principal}-${date}-${rate}`, chargeDate: row.charge_date, paymentStatus: row.payment_status, paymentDate: row.payment_date, amountRemaining: decimal(row.amount_remaining), totalPaid: decimal(row.total_paid), receivedToday: decimal(row.received_today),
    // R118: the charge's late charge (0 when none; a row read without the columns, the synthetic draft, reads 0).
    lateChargeDue: row.late_charge_due === undefined ? '0' : decimal(row.late_charge_due), lateChargeRemaining: row.late_charge_remaining === undefined ? '0' : decimal(row.late_charge_remaining) };
}
export function encodeCollectionCursor(value, query = '') {
  const { kind, businessDate, id } = value;
  if (!validDate(businessDate) || !validLoanId(id)) throw new Error('Invalid cursor');
  let canonical;
  // v5 (R102): the board keyset is (rank, days, name, id); days is the long overdue group's sort key (0 in other groups):
  // since R137 the days since the last payment (8 or more), which keeps the v5 rule days > 0 for rank 3.
  if (kind === 'collection' && Number.isInteger(value.rank) && value.rank >= 0 && value.rank <= 4 && Number.isSafeInteger(value.days) && (value.rank === 3 ? value.days > 0 : value.days === 0) && typeof value.name === 'string') canonical = { v: 5, kind, businessDate, rank: value.rank, days: value.days, name: value.name, id, queryHash: searchQueryHash(query) };
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
  if (canonical !== cursor) throw new Error('Invalid cursor');
  return parsed;
}
export async function readCollection(client, { limit, after, borrowerId = null, query = '', partnerId = null }) {
  const late = await lateChargeSchema(client);
  const clock = await client.query(`SELECT CURRENT_TIMESTAMP AS "asOf", (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS "businessDate"`);
  const { businessDate, asOf } = clock.rows[0];
  const metadata = { businessDate, asOf: new Date(asOf).toISOString(), timezone: BUSINESS_TZ };
  if (after && after.businessDate !== businessDate) return { collectionError: 'business_date_changed', collectionStatus: 409 };
  const quality = await client.query(collectionQualitySql, [borrowerId]);
  if (quality.rows[0]?.invalid !== false) return { collectionError: 'source_unavailable', collectionStatus: 503 };
  // R114 COL-2 / R137: the payment-source grants decide the prepaid caption and the last-payment rule (never a 42501).
  const paymentSource = (await client.query(prepaidSourceAllowedSql)).rows[0]?.allowed === true;
  const collectionCte = collectionCteFor(late, paymentSource);
  if (borrowerId === null) {
    const result = await client.query(`${collectionCte}, filtered AS (SELECT * FROM summaries WHERE ($6::text = '' OR strpos(lower(COALESCE(borrower_name, '')), lower($6)) > 0 OR strpos(lower(COALESCE(borrower_description, '')), lower($6)) > 0)), totals AS (SELECT *, CASE WHEN count(*) FILTER (WHERE amount_remaining IS NULL) OVER (PARTITION BY rank)>0 THEN NULL ELSE sum(amount_remaining::numeric) OVER (PARTITION BY rank)::text END AS group_remaining, CASE WHEN count(*) FILTER (WHERE amount_collected IS NULL) OVER (PARTITION BY rank)>0 THEN NULL ELSE sum(amount_collected::numeric) OVER (PARTITION BY rank)::text END AS group_collected FROM filtered) SELECT * FROM totals WHERE ($3::integer IS NULL OR rank > $3 OR (rank = $3 AND (sort_days > $8::integer OR (sort_days = $8::integer AND (COALESCE(borrower_name, '') COLLATE "C" > $7::text COLLATE "C" OR (COALESCE(borrower_name, '') COLLATE "C" = $7::text COLLATE "C" AND id COLLATE "C" > $4::text COLLATE "C")))))) ORDER BY rank, sort_days, COALESCE(borrower_name, '') COLLATE "C" ASC, id COLLATE "C" ASC LIMIT $5`, [businessDate, null, after?.rank ?? null, after?.id ?? null, limit + 1, query, after?.name ?? null, after?.days ?? null]);
    const items = await markGroupLinks(client, await markChatSummary(client, await markPrepaidSource(client, businessDate, result.rows.slice(0, limit).map(projectCollection), paymentSource), partnerId));
    const last = result.rows[Math.min(limit, result.rows.length) - 1];
    return { ...metadata, items, nextCursor: result.rows.length > limit ? encodeCollectionCursor({ kind: 'collection', businessDate, rank: last.rank, days: last.sort_days, name: last.borrower_name ?? '', id: last.id }, query) : null };
  }
  const summary = await client.query(`${collectionCte} SELECT * FROM summaries`, [businessDate, borrowerId]);
  if (summary.rows.length !== 1) return { collectionError: 'not_found', collectionStatus: 404 };
  const charges = await client.query(`${collectionCte} SELECT id, loan_id, payment_status, borrower_name, borrower_description, principal_amount, loan_date, original_rate, charge_date::text AS charge_date, payment_date::text AS payment_date, amount_remaining::text AS amount_remaining, total_paid::text AS total_paid, received_today::text AS received_today, late_charge_due::text AS late_charge_due, late_charge_remaining::text AS late_charge_remaining FROM eligible
    WHERE ($3::date IS NULL OR charge_date < $3::date OR (charge_date = $3::date AND id COLLATE "C" > $4::text COLLATE "C"))
    ORDER BY charge_date DESC, id COLLATE "C" LIMIT $5`, [businessDate, borrowerId, after?.chargeDate ?? null, after?.id ?? null, limit + 1]);
  const items = charges.rows.slice(0, limit).map(projectCollectionCharge);
  const [borrower] = await markGroupLinks(client, await markPrepaidSource(client, businessDate, [projectCollection(summary.rows[0])], paymentSource));
  // R146: the detail envelope carries the borrower's group chat summary (null when there is none).
  const groupChat = await readGroupChat(client, borrowerId);
  return { ...metadata, borrower, groupChat, items, nextCursor: charges.rows.length > limit ? encodeCollectionCursor({ kind: 'collection-charges', businessDate, parentId: borrowerId, chargeDate: items.at(-1).chargeDate, id: items.at(-1).id }) : null };
}
