import fs from 'node:fs';
import {api,assertSource,read,write,root,privateDir} from './ReportingApi.mjs';
import {definitions,descriptions} from './IncomePage.mjs';
await assertSource();
if(!fs.existsSync(privateDir+'/income-before/dashboard.json')||!fs.existsSync(root+'/outputs/r016-20260922/income-grants-applied.json'))throw Error('Missing income backup or authorized grant evidence');
const models=read('models.json');
const raw=key=>fs.readFileSync(`${root}/scripts/metabase/models/${key}.sql`,'utf8').trim();
const expand=key=>raw(key).replace(/\{\{model:([^}]+)\}\}/g,(_,dep)=>'('+expand(dep)+')');
for(const [key,,grain]of definitions){
 const r=await api('POST','dataset',{database:2,type:'native',native:{query:expand(key)}});
 if(r.status!=='completed'){fs.writeFileSync(privateDir+'/income-query-error.json',JSON.stringify(r));throw Error('Income preflight failed '+key);}
 const index=r.data.cols.findIndex(c=>c.name===grain),values=r.data.rows.map(row=>row[index]);
 if(index<0||values.some(v=>v==null)||new Set(values).size!==values.length)throw Error('Invalid grain '+key);
 console.log('Preflight passed '+key);
}
for(const [key,name,grain,description]of definitions){
 const tags={},query=raw(key).replace(/\{\{model:([^}]+)\}\}/g,(_,dep)=>{const m=models[dep];if(!m)throw Error('Missing model dependency');const tag='#'+m.id;tags[tag]={id:'r016-model-'+m.id,name:tag,'display-name':m.name,type:'card','card-id':m.id};return '{{'+tag+'}}';});
 const id=models[key]?.id;
 const c=await api(id?'PUT':'POST',id?'card/'+id:'card',{name,description,type:'model',display:'table',collection_id:8,visualization_settings:{},dataset_query:{database:2,type:'native',native:{query,'template-tags':tags}}});
 models[key]={id:c.id,name,collection_id:8,grain:description,grain_field:grain};write('models.json',models);
 const r=await api('POST',`card/${c.id}/query`,{});if(r.status!=='completed')throw Error('Saved income model failed '+key);
 const columns=r.data.cols.map(col=>({...col,semantic_type:col.name===grain?'type/PK':col.name==='Net Margin'?'type/Percentage':col.base_type==='type/Text'?'type/Category':col.semantic_type,
  description:descriptions[col.name]??`${col.name}. ${description}`,
  ...(/Decimal|Float|Integer|BigInteger/.test(col.base_type)&&col.name!==grain?{settings:{number_style:col.name==='Net Margin'?'percent':'decimal',decimals:col.name==='Net Margin'?1:2}}:{})}));
 await api('PUT','card/'+c.id,{result_metadata:columns});
 models[key].columns=columns.map(({name,base_type,semantic_type,description})=>({name,base_type,semantic_type,description}));models[key].rows=r.row_count;write('models.json',models);
 console.log(`Saved ${name} (${c.id}), ${columns.length} fields`);
}
