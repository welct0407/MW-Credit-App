import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Reminders, decide } from './reminder_engine.mjs';
const root = fileURLToPath(new URL('../',import.meta.url));
const config = JSON.parse(readFileSync(resolve(root,'config.json'),'utf8'));
const runner = new Reminders(resolve(root,'state/collection.db'),config);
const [command,arg,...rest] = process.argv.slice(2);
try {
  let result;
  if(command === 'init') result = runner.init();
  else if(command === 'status') { const state = runner.get(); result = {...state,decision:decide(state,config.reminders)}; }
  else if(command === 'observe') result = runner.observe(JSON.parse(readFileSync(arg,'utf8')));
  else if(command === 'reserve') result = runner.reserve(JSON.parse(readFileSync(arg,'utf8')).facts);
  else if(command === 'confirm' || command === 'unknown') result = runner.finish(arg,rest.join(' '),command === 'unknown');
  else throw new Error('Use init, status, observe <input>, reserve <facts>, confirm <token> <evidence>, unknown <token> <reason>');
  console.log(JSON.stringify(result,null,2));
} catch(error) { console.error(error.message); process.exitCode=1; }
finally { runner.close(); }
