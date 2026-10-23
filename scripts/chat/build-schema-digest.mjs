#!/usr/bin/env node
/** R090: build services/chat/assets/schema-digest.json from a disposable rebuild of database/migrations (the database
 * CI's loopback cluster), the Node port of integration-agent/scripts/build-schema-digest.py (which reads the data
 * dictionary). Every relation in schemas public and agent_audit with its kind, comment and columns (name, type,
 * comment), except the chat journal (pwa_chat_*, which the chat SQL role cannot read), and the allow-listed business
 * functions with purpose and use_when (owner R085: business functions in, other writers away). Every routine of
 * public, agent_audit and assessment_lab that is no extension member is classified (allowed, a trigger, an excluded
 * prefix or name); an unclassified routine or a missing allow-listed one fails the build. The digest records the
 * migration head it was built from (tests/unit/chat-schema-digest.test.mjs compares it with database/migrations).
 *
 *   node scripts/chat/build-schema-digest.mjs --port <port> [--host 127.0.0.1] [--user postgres] [--database loan_manager_dev]
 *   node scripts/chat/build-schema-digest.mjs --port <port> --check   # exit 1 when the asset differs from a fresh build
 *
 * Read-only catalogue queries; loopback hosts only (never Cloud SQL). */
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {codePointCompare} from '../../services/lib/offline-dataset-digest.mjs';

export const OUTPUT=new URL('../../services/chat/assets/schema-digest.json',import.meta.url);
const KINDS={r:'table',v:'view',m:'materialized view',p:'partitioned table',f:'foreign table'};
const ROUTINE_KINDS={f:'function',p:'procedure',a:'aggregate',w:'window'};
const VOLATILITY={i:'IMMUTABLE',s:'STABLE',v:'VOLATILE'};
const SCHEMAS=['public','agent_audit'];
const ROUTINE_SCHEMAS=['public','agent_audit','assessment_lab'];
const TRIGGER_RESULTS=['trigger','event_trigger'];
const COMMENT_LIMIT=200;
const EXCLUDED_RELATIONS=/^public\.pwa_chat_/;

// Owner (R085), Archie's classification, verbatim from the agent builder.
export const ALLOWED=new Map([
 ["public.loan_close_calculation_v83(p_loan text, p_day date)",["The system's Loan Close calculation for an open, auto-enabled Daily Interest loan on p_day (amount, allocations, mutation, planHash); raises P0001 for any other loan.",
  "Cross-checking the charge-balance payoff (business rules section 6) through the loan_payoff tool; call directly only for a date other than today."]],
 ["public.loan_close_calculation_v83(p_loan text, p_day date, p_exclude_payment text)",["The same payoff computed as if closing payment p_exclude_payment did not exist (correction preview).",
  "\"What would the payoff have been without payment X\"."]],
 ["public.first_day_components_v83(l \"Loans\")",["First-day charge split (principal share; interest incl. transfer fee) for a Loans row; empty if none.",
  "Explaining the net-off at disbursement: SELECT * FROM \"Loans\" l, public.first_day_components_v83(l)."]],
 ["public.original_daily_interest_rate(p \"Loans\", historical boolean)",["Whole-percent daily rate frozen at creation (historical=true reconstructs it from the note or first charge); NULL without evidence.",
  "Explaining why the daily amount changed after a principal payment."]],
 ["public.vc_daily_interest(p \"Loans\")",["Current daily interest earned by an open auto-charged loan (Daily: the daily amount; Installment: interest share per day; else 0).",
  "\"Interest per day\" for a loan or a borrower total."]],
 ["public.daily_interest_basis(p_arrangement text)",["Parses [daily, principal] from a loan's \"Loan Arrangement\" note.",
  "Only for an old loan's original basis."]],
 ["public.daily_interest_basis_note(p_basis numeric[])",["Renders a basis as the standard note.",
  "Rarely; formatting only."]],
 ["public.vc_charge_values(p \"Charges\")",["A charge's paid and remaining principal/interest, repayment count, status and last paid date, computed from repayments.",
  "Cross-checking trigger balances; usually the Charges columns suffice."]],
 ["public.vc_borrower_values(p_id text)",["One borrower row: interest received, principal lent, loan count, outstanding principal, interest on open loans, daily interest, has closed/open loans.",
  "A one-call borrower summary when olap_borrowers_analytics is more than needed."]],
 ["public.payment_charge_balances(p_id text)",["The charges a Payments row is eligible to pay under its allocation method, with remaining principal/interest.",
  "\"Why did payment X pay these charges\" or previewing a Processing payment."]],
 ["public.selected_charge_ids(value text)",["Decodes a \"Selected Charge IDs\" list.",
  "Joining Selected Charges payments to charges."]],
 ["public.payment_inputs(p \"Payments\")",["A payment's financial inputs as an array.",
  "Comparing a payment before/after a correction."]],
 ["public.pwa_effective_payment_plan_v2(p_id text)",["The per-charge plan the app posted for payment p_id; NULL when none.",
  "\"How was this app payment split across charges\"."]],
 ["public.pwa_plan_effects_v83(lines jsonb)",["Normalises plan lines.",
  "Only with pwa_effective_payment_plan_v2."]],
 ["public.forecast_schedule_v1(l jsonb, charges jsonb, t date, e date)",["Simulates a loan's due dates and amounts from t to e (at most 93 days), recorded vs projected, with issues.",
  "Prefer oltp_upcoming_charge_events_v1 or reporting_forecast_events_v1, which call it; use directly only for a non-today window."]],
 ["public.forecast_scenario_v1(ui numeric, up numeric, oi numeric, op numeric, ci numeric, cp numeric, rr numeric, scenario text)",["Planning/Schedule/Stress projection of remaining interest and principal from the reporting_forecast_loans_v1 columns ui, up, oi, op and collection percentages.",
  "\"What if only N% is collected\"."]],
 ["public.pwa_assessment_refresh_window_v2(start_day date, end_day date, as_of date)",["Clamps an assessment window to valid dates.",
  "Rarely."]],
 ["public.reporting_borrower_period_v1(p_start date, p_end date, p_population text)",["Per-borrower facts for a Bangkok date range (principal issued/returned, interest received, loans issued, first vs repeat, shares, ranks); p_population defaults to 'All with loan history'.",
  "Period rankings, e.g. \"who paid most interest in September\"."]],
 ["public.reporting_cash_period(p_from date, p_to date, p_scope text)",["Cash-account period totals; p_scope is a \"Cash Accounts\".\"Row ID\" or '__ALL__'.",
  "\"Cash in/out for account X this month\"."]],
 ["public.reporting_cash_period_entries(p_from date, p_to date, p_scope text)",["The transactions behind reporting_cash_period, with running balances.",
  "Listing cash movements."]],
 ["public.partner_net_profit(p_partner text)",["A Partner's net profit to date (interest share minus expense share).",
  "\"How much has Tommy/Lisa earned\"; pair with reporting_partner_position_v1."]],
 ["public.partner_pool_share_at_date(p_date date, p_role text)",["A Partner role's (A/B) capital share of the pool on a date; raises if the pool is not positive.",
  "Explaining an expense or profit split on a date."]],
 ["public.fifo_current_month_settled(prior_net numeric, month_net numeric, completed numeric)",["How much of this month's net profit counts as settled under FIFO.",
  "Partner settlement questions only."]],
 ["public.olap_reporting_date()",["Today in Bangkok as the reporting date.",
  "Every \"as of today\" filter."]],
 ["public.analytics_history_start()",["The earliest business date in the data.",
  "\"Since when do we have records\"."]],
 ["public.default_cash_account(p_holder text)",["A cash holder's active default account id.",
  "Which account receives by default."]],
 ["public.receiving_cash_account(p_borrower text)",["The account a borrower should pay into.",
  "\"Where should borrower X transfer\"."]],
 ["public.pwa_cash_opening_basis_v2(p_holder text)",["A holder's current balance and per-account balances.",
  "Current cash held by Tommy/Lisa (or \"Cash Account Balances\")."]],
]);
export const EXCLUDED_PREFIXES=Object.freeze(["public.pwa_", "public.vc_refresh_", "public.r051_", "agent_audit.", "assessment_lab."]);
export const EXCLUDED_NAMES=Object.freeze({
 "apply_loan_close_calculation_v83":"posts the loan close",
 "apply_principal_daily_interest":"rewrites a Loans row during a principal payment",
 "close_payment_loans":"closes loans after a payment",
 "create_first_day_charge":"inserts the first-day charge",
 "create_referral_rebate":"inserts the referral rebate expense",
 "first_day_receipt":"posts the first-day net-off receipt",
 "generate_due_charges":"inserts due charges",
 "generate_loan_charge":"inserts a loan charge",
 "initialize_cash_accounts":"creates cash accounts and openings",
 "move_payment_interest":"moves a payment allocation",
 "payment_crud_*_core_v83":"payment correction core (writes allocations and repayments)",
 "post_loan_default":"posts a default loss",
 "post_payment*":"posts payments",
 "recalculate_business_expenses_from_date":"rewrites expense allocations",
 "refresh_daily_analytics":"rewrites the Daily Analytics snapshot",
 "refresh_daily_analytics_scoped":"rewrites the Daily Analytics snapshot",
 "request_business_history":"queues a history refresh",
 "sync_cash_ledger":"writes the cash ledger",
 "undo_loan_default":"reverses a default",
 "cash_account_holder":"locks with FOR SHARE, which the read-only transaction rejects",
 "attach_payment_receipt_evidence":"writes receipt evidence onto a payment",
 // R090: routines of the migration chain that the PROD-captured dictionary does not list (same rule: writers away).
 "reallocate_payment_interest*":"reallocates payment interest (operator path)",
 "payment_reallocation_permitted":"guard predicate of the reallocation triggers",
});

const quote=x=>/^[a-z_][a-z0-9_]*$/.test(x)?x:'"'+x.replaceAll('"','""')+'"';
export const qualified=(schema,name)=>quote(schema)+'.'+quote(name);
const glob=pattern=>new RegExp('^'+pattern.replace(/[.+^${}()|[\]\\]/g,'\\$&').replaceAll('*','.*').replaceAll('?','.')+'$');
/** 'trigger', 'allowed' or 'excluded' for a routine signature; null when it is unclassified. */
export function classify(name,result){
 if(TRIGGER_RESULTS.includes(result))return 'trigger';
 if(ALLOWED.has(name))return 'allowed';
 const bare=name.split('(')[0];
 if(EXCLUDED_PREFIXES.some(p=>bare.startsWith(p)))return 'excluded';
 if(Object.keys(EXCLUDED_NAMES).some(p=>glob(p).test(bare.split('.').slice(1).join('.'))))return 'excluded';
 return null;
}

/** The digest of a migrated database (client: a connected pg client). */
export async function build(client){
 const head=(await client.query("SELECT max(version::integer) AS head FROM public.flyway_schema_history WHERE success AND version ~ '^[0-9]+$'")).rows[0].head;
 const relations=(await client.query(`SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,obj_description(c.oid,'pg_class') AS comment,
  coalesce((SELECT json_agg(json_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'comment',col_description(c.oid,a.attnum)) ORDER BY a.attnum)
   FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]') AS columns
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname=ANY($1) AND c.relkind IN ('r','v','m','p','f') AND NOT c.relispartition
   AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')`,[SCHEMAS])).rows
  .map(r=>({relation:qualified(r.schema,r.name),kind:KINDS[r.kind]??r.kind,...(r.comment?{comment:r.comment}:{}),
   // Null comments are omitted: the digest goes into every model request.
   columns:r.columns.map(c=>({name:c.name,type:c.type,...(c.comment?{comment:c.comment}:{})}))}))
  .filter(r=>!EXCLUDED_RELATIONS.test(r.relation));
 const routines=(await client.query(`SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS args,pg_get_function_result(p.oid) AS result,
  p.prokind AS kind,p.provolatile AS volatility,obj_description(p.oid,'pg_proc') AS comment
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname=ANY($1) AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')`,[ROUTINE_SCHEMAS])).rows;
 const functions=[];
 for(const r of routines){
  const name=`${quote(r.schema)}.${quote(r.name)}(${r.args})`;
  const category=classify(name,r.result);
  if(category===null)throw Error('routine is neither allow-listed, a trigger nor excluded: '+name);
  if(category!=='allowed')continue;
  const [purpose,useWhen]=ALLOWED.get(name);
  functions.push({function:name,result:r.result,kind:ROUTINE_KINDS[r.kind]??'function',volatility:VOLATILITY[r.volatility]??'VOLATILE',
   purpose,use_when:useWhen,...(r.comment?{comment:[...r.comment].slice(0,COMMENT_LIMIT).join('')}:{})});
 }
 const missing=[...ALLOWED.keys()].filter(name=>!functions.some(f=>f.function===name));
 if(missing.length)throw Error('allow-listed routine missing from the database: '+missing.sort().join(', '));
 relations.sort((a,b)=>codePointCompare(a.relation,b.relation));
 functions.sort((a,b)=>codePointCompare(a.function,b.function));
 return {format:1,migration:head,
  source:'disposable rebuild of database/migrations (relations in public and agent_audit except the chat journal; the allow-listed business functions)',
  notes:'PostgreSQL 18, search_path pg_catalog, public; quote mixed-case identifiers exactly as written ("Loans"."Row ID"). Business dates are Asia/Bangkok. Call only the functions listed here; anything that modifies data fails in the read-only transaction.',
  relations,functions};
}
/** Compact JSON with one function and one relation per line (small for the prompt, readable in a diff). */
export function render(value){
 const {relations,functions,...head}=value;
 const lines=[JSON.stringify(head).slice(0,-1)+',"functions":['];
 for(const [i,f] of functions.entries())lines.push(JSON.stringify(f)+(i<functions.length-1?',':''));
 lines.push('],"relations":[');
 for(const [i,r] of relations.entries())lines.push(JSON.stringify(r)+(i<relations.length-1?',':''));
 return lines.join('\n')+'\n]}\n';
}

async function main(argv){
 const options={host:'127.0.0.1',user:'postgres',database:'loan_manager_dev',port:null,check:false};
 for(let i=0;i<argv.length;i++){
  const arg=argv[i];
  if(arg==='--check')options.check=true;
  else if(['--host','--user','--database','--port'].includes(arg))options[arg.slice(2)]=argv[++i];
  else throw Error('Unknown argument '+arg);
 }
 if(!/^[0-9]{2,5}$/.test(options.port??'')||!['127.0.0.1','localhost','::1'].includes(options.host))throw Error('A loopback --port of the disposable rebuild is required');
 const {default:pg}=await import('pg');
 const client=new pg.Client({host:options.host,port:Number(options.port),user:options.user,database:options.database});
 await client.connect();
 let text;
 try{await client.query('BEGIN READ ONLY');text=render(await build(client));}finally{await client.end();}
 if(options.check){
  let current='';try{current=readFileSync(OUTPUT,'utf8');}catch{/* absent */}
  if(current!==text){console.error('schema digest is stale: run node scripts/chat/build-schema-digest.mjs --port <rebuild port>');return 1;}
  return 0;
 }
 writeFileSync(OUTPUT,text);
 const value=JSON.parse(text);
 console.log(JSON.stringify({migration:value.migration,relations:value.relations.length,columns:value.relations.reduce((n,r)=>n+r.columns.length,0),functions:value.functions.length,bytes:Buffer.byteLength(text)}));
 return 0;
}
if(process.argv[1]===fileURLToPath(import.meta.url))process.exitCode=await main(process.argv.slice(2));
