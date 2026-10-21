// R075 receipt recognition business rules, run by the command API against its own environment's
// database on every call. Faithful port of integration-agent receipt_rules.py (account_pattern,
// match_account, validate_receipt field rules), except that each field is judged on its own: a field
// whose rule fails is null with a warning, and nothing here writes or blocks a payment.
// The recognizer result is untrusted model output; only its validated shape reaches this module.

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

/** Preserve every printed mask; never invent hidden digits. Reject other text. */
export function accountPattern(value) {
  let text = String(value ?? '').trim();
  text = [...text].map(ch => { const index = THAI_DIGITS.indexOf(ch); return index < 0 ? ch : String(index); }).join('');
  text = text.replace(/[\s\-().]/g, '').toLowerCase().replace(/[*•●]/g, 'x');
  return /^[0-9x]{8,15}$/.test(text) ? text : '';
}

/** Account ids whose Account Number or Alternative Account Number fits a printed (masked) number. */
export function matchAccounts(numbers, accounts) {
  const matches = new Set();
  for (const number of numbers) {
    const pattern = accountPattern(number);
    if (!pattern || [...pattern].filter(ch => /\d/.test(ch)).length < 4) continue;
    for (const account of accounts) {
      if (account.active !== true) continue;
      for (const field of ['number', 'alternative']) {
        const candidate = accountPattern(account[field]);
        if (candidate && !candidate.includes('x') && candidate.length === pattern.length
          && [...pattern].every((ch, i) => ch === 'x' || ch === candidate[i])) matches.add(account.id);
      }
    }
  }
  return [...matches];
}

/** Gregorian calendar day text or null. */
function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}
export function previousDay(value) {
  const parsed = new Date(value + 'T00:00:00Z');parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}
export function normalizedReference(value) {
  const reference = String(value ?? '').replace(/[\s-]/g, '').toUpperCase();
  return /^[A-Z0-9]{6,100}$/.test(reference) ? reference : null;
}

/** Field rules that need no database: amount, reference text, date window and time. */
export function slipFields(result, businessDate) {
  const warnings = [];
  if (result.is_payment_receipt !== true || result.transfer_successful !== true) return { confirmed: false, warnings: ['slip_not_confirmed'] };
  let amountReceived = null;
  const currency = String(result.currency ?? '').trim().toUpperCase();
  // A correctly grouped thousands comma ("5,000.00", "1,234,567.89") is accepted; "5,00" or "1,2345" are not.
  const amount = typeof result.amount === 'string' && /^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(result.amount) ? result.amount.replaceAll(',', '') : result.amount;
  if (typeof amount !== 'string' || !/^\d{1,12}(?:\.\d{1,2})?$/.test(amount) || !/[1-9]/.test(amount)) warnings.push('amount_unreadable');
  else if (!['', 'THB'].includes(currency)) warnings.push('non_thb');
  else {
    const [whole, fraction = ''] = amount.split('.');
    // The receiving form takes whole baht only: a non-zero fraction warns and never fills.
    if (/[1-9]/.test(fraction)) warnings.push('amount_fractional');
    else if (BigInt(whole) > 0n) amountReceived = BigInt(whole).toString();
    else warnings.push('amount_unreadable');
  }
  const reference = normalizedReference(result.reference);
  if (!reference) warnings.push('reference_unreadable');
  const slipDay = day(result.date);
  const paymentDate = slipDay && (slipDay === businessDate || slipDay === previousDay(businessDate)) ? slipDay : null;
  if (!paymentDate) warnings.push('date_outside_window');
  const clock = typeof result.time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/.test(result.time) ? result.time.slice(0, 5) : null;
  if (!clock) warnings.push('time_unreadable');
  // The transfer time is written with the slip date into Created At, so it needs an accepted date.
  return { confirmed: true, amountReceived, bankReference: reference, paymentDate, slipDay, transferTime: paymentDate ? clock : null, warnings };
}

/**
 * Suggestion for the receiving form. `accounts` are this environment's Cash Accounts
 * ({id,label,number,alternative,active}); `referenceExists(reference)` reads Payments.
 * @returns {Promise<{status:'recognized'|'unrecognized',reason?:string,suggestion:any,warnings:{code:string,date?:string}[]}>}
 */
export async function evaluateSlip(result, { businessDate, accounts, referenceExists }) {
  const fields = slipFields(result, businessDate);
  if (!fields.confirmed) return { status: 'unrecognized', reason: 'slip_not_confirmed', suggestion: null, warnings: fields.warnings.map(code => ({ code })) };
  const warnings = [...fields.warnings];
  let cashAccountId = null;
  // R087: every printed number, sender and recipient alike; exactly one of our active accounts must fit.
  const numbers = result.account_numbers;
  // R076: a slip that shows no account number gives no account signal (no warning, nothing filled); the form
  // names an unmatched or ambiguous account only when the slip printed one.
  if (!Array.isArray(numbers) || numbers.length > 5 || numbers.some(n => typeof n !== 'string')) warnings.push('account_unmatched');
  else if (numbers.length) {
    const matched = matchAccounts(numbers, accounts);
    if (matched.length === 1) cashAccountId = matched[0];
    else warnings.push(matched.length ? 'account_ambiguous' : 'account_unmatched');
  }
  if (fields.bankReference && await referenceExists(fields.bankReference)) warnings.push('reference_exists');
  const order = ['slip_not_confirmed', 'amount_unreadable', 'amount_fractional', 'non_thb', 'account_unmatched', 'account_ambiguous', 'reference_unreadable', 'reference_exists', 'date_outside_window', 'time_unreadable'];
  return {
    status: 'recognized',
    suggestion: { amountReceived: fields.amountReceived, cashAccountId, bankReference: fields.bankReference, paymentDate: fields.paymentDate, transferTime: fields.transferTime, paymentMethod: 'Bank Transfer' },
    // A readable slip date outside the window is named so the form can say which date was not used.
    warnings: order.filter(code => warnings.includes(code)).map(code => code === 'date_outside_window' && fields.slipDay ? { code, date: fields.slipDay } : { code }),
  };
}
