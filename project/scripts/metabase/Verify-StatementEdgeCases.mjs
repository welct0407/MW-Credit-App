// Read-only synthetic provider substitutions exercise the same deployed calculation bodies.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,read,write,root} from './ReportingApi.mjs';
const checks=[];
const sql=async query=>{const r=await api('POST','dataset',{database:2,type:'native',native:{query}});assert.equal(r.status,'completed');return r.data.rows;};
const source=(await sql("SELECT prosrc FROM pg_proc WHERE oid='public.reporting_cash_period(date,date,text)'::regprocedure"))[0][0];
for(const unknown of [false,true]){
 const scopes=`(SELECT '__ALL__'::text id,'Synthetic'::text label,${unknown?'NULL::date':"public.olap_reporting_date()-2"} available,${unknown?'NULL::numeric':'-100::numeric'} baseline)`;
 const entries=`(SELECT * FROM (VALUES ('before','__ALL__',public.olap_reporting_date()-1,-25::numeric,0::numeric,25::numeric),('today','__ALL__',public.olap_reporting_date(),5::numeric,5::numeric,0::numeric)) v("Entry ID","Scope ID","Date","Net Movement","Money In","Money Out"))`;
 const q=source.replaceAll('public.reporting_cash_scopes',scopes).replaceAll('public.reporting_cash_entries',entries).replaceAll('p_from','public.olap_reporting_date()').replaceAll('p_to','public.olap_reporting_date()').replaceAll('p_scope',"'__ALL__'");
 const r=(await sql(q))[0];assert.equal(Number(r[5]),5);assert.equal(Number(r[6]),0);
 if(unknown){assert.equal(r[4],null);assert.equal(r[8],null);assert.equal(r[10],'Opening unavailable');}
 else{assert.equal(Number(r[4]),-125);assert.equal(Number(r[8]),-120);assert.equal(r[10],'Balances match');}
 checks.push(unknown?'Unknown opening remains NULL while synthetic movements remain visible':'Negative opening and closing preserved through deployed period logic');
}
const plan=read('statement-cleanup-plan.json');
for(const key of ['income-trend','flow-trend']){
 let q=plan.questions.find(s=>s.key===key).dataset_query.native.query;
 q=q.replace(/\[\[AND \{\{(?:statement_period|cashflow_period)\}\}\]\]/,"AND d.\"Date\"=public.olap_reporting_date()-1");
 const empty='(SELECT public.olap_reporting_date()-1 AS "Date",NULL::numeric AS "Income",NULL::numeric AS "Expenses",NULL::numeric AS "Net Profit",NULL::numeric AS "Money In",NULL::numeric AS "Money Out",NULL::timestamp AS "Generated At" WHERE false)';
 q=q.replaceAll('{{#205}}',empty).replaceAll('{{#206}}','(SELECT e.*,NULL::text AS "Cash Account ID" FROM '+empty+' e)').replaceAll('{{cash_account}}',"'__ALL__'");
 const rows=await sql(q);assert.equal(rows.length,1);assert.ok(rows[0].slice(1).every(x=>x===null));checks.push(key+': missing stored day retained as NULL gap with no zero fallback');
}
write('statement-cleanup/edge-verification.json',{at:new Date().toISOString(),checks,read_only_synthetic:true,financial_values_published:false});console.log(checks.length+' synthetic edge checks passed');
