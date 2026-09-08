import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {DailyBatch} from './batch_engine.mjs';
import {loadPaymentBlock} from './payment_account.mjs';
const json=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const config=json(new URL('../config.json',import.meta.url));
const b=new DailyBatch(fileURLToPath(new URL('../state/collection.db',import.meta.url)),config);
try{
  const [command,a,c]=process.argv.slice(2);
  let result;
  switch(command){
    case 'init': result={status:'INITIALIZED'};break;
    case 'status': result=b.summary(a);break;
    case 'show': result=b.get(a);break;
    case 'create': result=b.create(json(a));break;
    case 'prepare': result=b.prepare(a,json(c),loadPaymentBlock());break;
    case 'start': result=b.start(a,json(c));break;
    case 'confirm': result=b.finish(a,json(c));break;
    case 'review': result=b.review(a,c);break;
    default: throw Error('Use init, status [date], show token, create file, prepare/start/confirm token file, review token reason');
  }
  console.log(JSON.stringify(result));
}catch(e){console.error(e.message);process.exitCode=1;}finally{b.close();}
