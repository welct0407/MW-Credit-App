import fs from 'node:fs';
import {api,assertSource,read,write,privateDir,root} from './ReportingApi.mjs';
await assertSource();
const dir=privateDir+'/income-refinement-before';
if(fs.existsSync(dir))throw Error('Refinement baseline exists; do not overwrite');
fs.mkdirSync(dir);
const state=read('income-state.json');
for(const route of ['dashboard/3','collection/graph','native-query-snippet/'+state.snippet_id,...Object.values(state.cards).map(id=>'card/'+id)]){
 fs.writeFileSync(dir+'/'+route.replaceAll('/','-')+'.json',JSON.stringify(await api('GET',route)));
}
fs.copyFileSync(root+'/Documents/AppSheet_Data_Dictionary.xlsx',dir+'/AppSheet_Data_Dictionary.xlsx');
write('income-refinement-backup.json',{saved_at:new Date().toISOString(),directory:dir,baseline_commit:'f320e76e66bb8e0b3d1d1e74278742d72ec7bea4',scope:'Income Statement cards, layout, snippet, dictionary; additive V35 source views'});
console.log('Income Statement refinement rollback metadata saved.');
