import { databaseRoot } from '../database-location.mjs';
import fs from 'node:fs';
import {api,assertSource,root,privateDir,read,write} from './ReportingApi.mjs';
import {definitions} from './IncomePage.mjs';
await assertSource();
const dir=privateDir+'/income-db-views-before';
if(fs.existsSync(dir))throw Error('Baseline exists; do not overwrite it');
fs.mkdirSync(dir);
const models=read('models.json');
const expand=key=>fs.readFileSync(`${root}/scripts/metabase/models/${key}.sql`,'utf8').trim().replace(/\{\{model:([^}]+)\}\}/g,(_,dep)=>'('+expand(dep)+')');
const names=Object.fromEntries(definitions.map(([key])=>[key,'reporting_'+key.replaceAll('-','_')]));
const blocks=[];
for(const [key] of definitions){
 const sql=expand(key),card=await api('GET','card/'+models[key].id);
 fs.writeFileSync(`${dir}/${key}.json`,JSON.stringify(card));
 fs.writeFileSync(`${dir}/${key}.sql`,sql);
 blocks.push(`CREATE VIEW public.${names[key]} AS\n${sql};\nCOMMENT ON VIEW public.${names[key]} IS 'R016: database-owned Income Statement source. Live Bangkok dates; original model grain and financial semantics preserved.';`);
}
for(const route of ['dashboard/3','collection/graph'])fs.writeFileSync(dir+'/'+route.replace('/','-')+'.json',JSON.stringify(await api('GET',route)));
const migration=databaseRoot+'/database/migrations/V34__income_reporting_views.sql';
if(fs.existsSync(migration))throw Error('V34 already reserved');
fs.writeFileSync(migration,'-- R016: owner requested heavy reporting logic in PostgreSQL views.\n-- Additive, read-only definitions. No source rows, existing views or functions change.\n\n'+blocks.join('\n\n')+'\n');
write('income-db-views-plan.json',{baseline:dir,version:34,views:names,model_ids:definitions.map(([k])=>models[k].id),status:'Prepared; not deployed',authorization:'Owner: heavy calculations should be built in database views and read directly from Metabase.'});
console.log('Backed up six models and prepared six additive database views.');
