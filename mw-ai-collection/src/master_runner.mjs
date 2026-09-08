import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Master } from './master_engine.mjs';
import { loadPaymentBlock } from './payment_account.mjs';
const json=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const runner=new Master(fileURLToPath(new URL('../state/collection.db',import.meta.url)),json(new URL('../config.json',import.meta.url)));
const [cmd,arg,...rest]=process.argv.slice(2);
try {
  let result;
  if(cmd==='plan')result=runner.plan(json(arg),new Date(),loadPaymentBlock());
  else if(cmd==='verify-fee')result=runner.verifyFee(arg,json(rest[0]));
  else if(cmd==='confirm'||cmd==='unknown')result=runner.finish(arg,rest.join(' '),cmd==='unknown');
  else if(cmd==='status')result={days:runner.days(),operations:runner.db.prepare('SELECT token,date,kind,slot,status FROM master_operations ORDER BY created_at').all()};
  else throw Error('Use plan <facts>, verify-fee <token> <facts>, confirm/unknown <token> <evidence>, status');
  console.log(JSON.stringify(result,null,2));
}catch(e){console.error(e.message);process.exitCode=1;}finally{runner.close();}
