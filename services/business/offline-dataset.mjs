/** Offline dataset domains. Protocol 1 (one whole-domain response) is retired; protocol 2 chunks
 * (offline-dataset-chunks.mjs) and protocol 3 deltas (offline-dataset-delta.mjs) remain. */
export const offlineDomains=Object.freeze(['records','collection','cash','management']);

/** Internal readers only: batch identical SELECT templates without changing their
 * projections, nullable values, ordering, or financial SQL providers. Each group
 * is one indexed lateral SQL read, rather than one database roundtrip per row. */
export function bulkReadClient(client){
 let pending=[],scheduled=false;
 async function flush(){
  const queue=pending;pending=[];scheduled=false;
  const groups=new Map();
  for(const item of queue){const key=item.sql+'\0'+item.params.map(value=>value===null?'null':typeof value).join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item)}
  for(const group of groups.values()){
   try{
    const {sql,params}=group[0];
    if(!params.length){const result=await client.query(sql);for(const item of group)item.resolve({rows:structuredClone(result.rows),rowCount:result.rowCount});continue;}
    const replaced=sql.replace(/\$(\d+)\b/g,(_,number)=>{const index=Number(number)-1;if(index>=params.length)throw Error('Invalid internal bulk parameter');const type=typeof params[index];return `(batch.args->>${index})${type==='number'?'::integer':type==='boolean'?'::boolean':''}`});
    const result=await client.query(`SELECT batch.ordinality AS "batchIndex",(SELECT coalesce(jsonb_agg(to_jsonb(source)),'[]'::jsonb) FROM (${replaced}) source) AS values FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS batch(args,ordinality)`,[JSON.stringify(group.map(item=>item.params))]);
    const rows=group.map(()=>[]);for(const row of result.rows)rows[Number(row.batchIndex)-1]=row.values;
    group.forEach((item,index)=>item.resolve({rows:rows[index],rowCount:rows[index].length}));
   }catch(error){for(const item of group)item.reject(error)}
  }
 }
 return {query(sql,params=[]){
  if(typeof sql!=='string'||!/^\s*(SELECT|WITH)\b/i.test(sql)||/;|\b(?:INSERT|UPDATE|DELETE|CALL|COPY|FOR\s+UPDATE)\b/i.test(sql)||params.some(value=>value!==null&&!['string','boolean','number'].includes(typeof value)))return Promise.reject(Error('Invalid internal bulk read'));
  return new Promise((resolve,reject)=>{pending.push({sql,params,resolve,reject});if(!scheduled){scheduled=true;queueMicrotask(()=>void flush())}});
 }};
}
