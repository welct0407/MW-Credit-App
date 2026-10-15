// Read-only execution of the existing directly affected model; no report edits or metadata sync.
import {api,read,write} from './ReportingApi.mjs';
const model=read('models.json').daily;
const result=await api('POST',`card/${model.id}/query`,{});
if(result.status!=='completed'||!result.data?.rows?.length)throw Error('Existing Daily Performance query failed');
write('daily-snapshots/report-consumer.json',{verified_at:new Date().toISOString(),model_id:model.id,
 status:result.status,rows:result.data.rows.length,report_definitions_changed:false,financial_values_published:false});
console.log(`Existing Daily Performance model ${model.id}: ${result.data.rows.length} rows; query completed.`);
const access=await api('POST','dataset',{database:2,type:'native',native:{query:`SELECT current_user,
 (SELECT count(*) FROM public.reporting_daily_snapshot),
 (SELECT count(*) FROM public.reporting_cash_account_snapshot),
 has_table_privilege(current_user,'public.reporting_daily_snapshot','INSERT,UPDATE,DELETE,TRUNCATE'),
 has_table_privilege(current_user,'public.reporting_cash_account_snapshot','INSERT,UPDATE,DELETE,TRUNCATE')`}});
if(access.status!=='completed')throw Error('Restricted source query failed');
const [role,portfolioRows,accountRows,portfolioWrite,accountWrite]=access.data.rows[0];
if(role!=='metabase_borrower_reader'||portfolioWrite||accountWrite||!portfolioRows||!accountRows)throw Error('Unexpected reporting access');
write('daily-snapshots/reader-access.json',{verified_at:new Date().toISOString(),role,portfolio_rows:portfolioRows,
 account_rows:accountRows,select_only:true,verified_through_actual_reporting_connection:true});
console.log('Both snapshot views execute through the actual SELECT-only reporting connection.');
