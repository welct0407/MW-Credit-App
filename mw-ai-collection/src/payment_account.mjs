import { readFileSync } from 'node:fs';

export function loadPaymentBlock(path = new URL('../local/payment_account.json', import.meta.url)) {
  const account = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  for (const key of ['bankName', 'accountNumber', 'accountName']) {
    if (typeof account[key] !== 'string' || !account[key].trim() || /[\r\n]/.test(account[key]))
      throw new Error(`Payment account requires a nonempty single-line ${key}`);
  }
  return `💳 ${account.bankName.trim()}\n${account.accountNumber.trim()}\n${account.accountName.trim()}`;
}
