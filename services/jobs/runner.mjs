/** SQL owns the fixed financial operation and its atomic completion record. */
export function createCanonicalJobRunner({pool,guardConnection,enabled=false}){
 return async function run({job,businessDate,scope}){
  if(!enabled)return{enabled:false};
  if(!['daily-charges','recent-analytics'].includes(job)||!/^\d{4}-\d{2}-\d{2}$/.test(businessDate??'')||(job==='daily-charges'?scope!=='daily':!/^hour:(0[0-9]|1[0-9]|2[0-3])$/.test(scope??'')))throw Error('invalid_job');
  const c=await pool.connect();let healthy=false;
  try{await guardConnection(c);const result=(await c.query('SELECT public.pwa_job_run_v1($1::text,$2::date,$3::text) AS result',[job,businessDate,scope])).rows[0].result;healthy=true;return result;}finally{c.release(!healthy);}
 };
}
