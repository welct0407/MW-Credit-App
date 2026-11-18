/**
 * R176 (owner, 18 November 2026: "copy and open"): the daily payment reminder the partner pastes into the borrower's
 * Instagram chat. Thai only, whatever the app language. 📌 stays the first character: the agent's group chat summary
 * treats partner messages starting with 📌 as routine.
 */

/**
 * The reminder's amount from an API decimal string, grouped on the string (no Number, no Intl): thousands separators,
 * the decimals only when not zero, no currency sign ('3600.00' gives '3,600', '3600.50' gives '3,600.50'). Null for a
 * missing, non-decimal, zero or negative value.
 */
export function reminderAmount(amount: string | null | undefined): string | null {
  const match = typeof amount === 'string' ? /^(\d+)(?:\.(\d+))?$/.exec(amount) : null;
  if (!match) return null;
  const whole = match[1].replace(/^0+(?=\d)/, ''), fraction = match[2] ?? '';
  const decimals = /[1-9]/.test(fraction);
  if (whole === '0' && !decimals) return null;
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (decimals ? '.' + fraction : '');
}

/** The reminder text, or null when there is no amount to remind (see reminderAmount). */
export function reminderMessage(amount: string | null | undefined): string | null {
  const text = reminderAmount(amount);
  // The wording is under owner review (18 November 2026): change it here only.
  return text === null ? null : `📌วันนี้มีส่งยอด ${text} นะคะ`;
}
