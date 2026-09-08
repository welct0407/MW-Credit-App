import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Exceptions} from './exception_engine.mjs';
const json=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const r=new Exceptions(fileURLToPath(new URL('../state/collection.db',import.meta.url)),json(new URL('../config.json',import.meta.url)));
const [cmd,id,arg,...rest]=process.argv.slice(2);
try{let out;
 if(cmd==='capture')out=r.capture(json(id));
 else if(cmd==='request')out=r.request(id);
 else if(cmd==='sent')out=r.sent(id,arg,rest.join(' '));
 else if(cmd==='unknown')out=r.unknown(id,[arg,...rest].join(' '));
 else if(cmd==='decision')out=r.decision(id,json(arg));
 else if(cmd==='resolve')out=r.resolve(id,json(arg));
 else if(cmd==='show')out=r.get(id);
 else if(cmd==='status')out=r.list();
 else throw Error('Use capture/request/sent/unknown/decision/resolve/show/status');
 console.log(JSON.stringify(out,null,2));
}catch(e){console.error(e.message);process.exitCode=1;}finally{r.close();}
