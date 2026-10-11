/** No timers or scheduler installation. Caller invokes an explicitly owned boundary. */
export function createCanonicalJobRunner({pool,guardConnection,enabled=false}){
 return async function run({job,businessDate,scope}){
  if(!enabled)return{enabled:false};
  if(!['daily-charges','recent-analytics'].includes(job)||!/^\d{4}-\d{2}-\d{2}$/.test(businessDate??'')||(job==='daily-charges'?scope!=='daily':!/^hour:(0[0-9]|1[0-9]|2[0-3])$/.test(scope??'')))throw Error('invalid_job');
  const c=await pool.connect();let healthy=false;
  try{
   await c.query('BEGIN');await guardConnection(c);
   const clock=(await c.query("SELECT (clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date::text AS day,to_char(clock_timestamp() AT TIME ZONE 'Asia/Bangkok','HH24') AS hour")).rows[0];
   // Only the current boundary: historical recovery is an explicit reviewed operation.
   if(clock.day!==businessDate||job==='recent-analytics'&&scope!=='hour:'+clock.hour)throw Error('job_boundary_changed');
   await c.query(`INSERT INTO public.pwa_job_runs(job_name,business_date,scope_key,state) VALUES($1,$2,$3,'pending') ON CONFLICT DO NOTHING`,[job,businessDate,scope]);
   const row=(await c.query('SELECT * FROM public.pwa_job_runs WHERE job_name=$1 AND business_date=$2 AND scope_key=$3 FOR UPDATE',[job,businessDate,scope])).rows[0];
   if(row.state==='completed'){await c.query('COMMIT');healthy=true;return{enabled:true,state:'completed',replayed:true};}
   if(row.state!=='pending'&&row.state!=='failed')throw Error('job_requires_reconciliation');
   await c.query("UPDATE public.pwa_job_runs SET state='leased',lease_generation=lease_generation+1,lease_expires_at=clock_timestamp()+interval '30 seconds',started_at=clock_timestamp() WHERE run_id=$1",[row.run_id]);
   if(job==='daily-charges')await c.query('SELECT public.generate_due_charges($1::date)',[businessDate]);
   else await c.query('SELECT public.refresh_daily_analytics($1::date-1,$1::date)',[businessDate]);
   await c.query("UPDATE public.pwa_job_runs SET state='completed',lease_expires_at=NULL,completed_at=clock_timestamp(),checkpoint=$2 WHERE run_id=$1 AND lease_generation=$3",[row.run_id,businessDate+'|'+scope,String(BigInt(row.lease_generation)+1n)]);
   await c.query('COMMIT');healthy=true;return{enabled:true,state:'completed',replayed:false};
  }catch(error){try{await c.query('ROLLBACK');healthy=true}catch{}throw error;}finally{c.release(!healthy);}
 };
}
