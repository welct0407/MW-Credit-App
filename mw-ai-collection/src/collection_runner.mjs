import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { Ledger } from './ledger.mjs';
import { loadPaymentBlock } from './payment_account.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(readFileSync(resolve(root, 'config.json'), 'utf8'));
const dbPath = resolve(root, 'state/collection.db');
mkdirSync(dirname(dbPath), { recursive: true });
const ledger = new Ledger(dbPath);
const [command, arg, detail] = process.argv.slice(2);
try {
  let result;
  if (command === 'reserve') result = ledger.reserve(config, JSON.parse(readFileSync(arg, 'utf8')), new Date(), loadPaymentBlock());
  else if (command === 'confirm') result = ledger.confirm(arg, detail);
  else if (command === 'unknown') result = ledger.unknown(arg, detail);
  else if (command === 'status') result = ledger.list();
  else throw new Error('Use reserve <facts.json>, confirm <token> <evidence>, unknown <token> <reason>, or status');
  console.log(JSON.stringify(result, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { ledger.close(); }
