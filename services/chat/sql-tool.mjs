/** sql_query and loan_payoff on the chat pool (design §4.1, Archie resolution 11), first ported from integration-agent
 * conversation_sql.py run/query/payoff; that conversation is decommissioned (R091), so the row, result and cell
 * limits (sql-guard.mjs) and their messages are R092's own. Each call is one READ ONLY repeatable-read transaction, always rolled back: the connection
 * guard first (the IAM login), then SET LOCAL ROLE mw_chat_read_<env> so the model's SQL can call no
 * pwa_chat_*_v1 function and read no pwa_chat_* table, the agent's session settings, and the session_user,
 * current_user and current_database() assertion before the statement runs. Rows come through a server-side cursor
 * that fetches at most ROW_CAP + 1 rows; the byte bound is checked on the server (sql-guard.mjs prepare). */
import pg from 'pg';
import {ToolError} from './errors.mjs';
import {BYTES,CELL_LIMIT,CURSOR,RESULT_LIMIT,ROW_CAP,STATEMENT_TIMEOUT,TOO_LARGE,prepare} from './sql-guard.mjs';

/** Python json.dumps(value, ensure_ascii=False) text (default ', ' and ': ' separators), for the byte bounds. */
export function pythonJson(value){
 if(value===null||value===undefined)return 'null';
 if(typeof value==='boolean')return value?'true':'false';
 if(typeof value==='number')return Number.isFinite(value)?String(value):value>0?'Infinity':value<0?'-Infinity':'NaN';
 if(typeof value==='string')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(pythonJson).join(', ')+']';
 return '{'+Object.entries(value).map(([k,v])=>JSON.stringify(k)+': '+pythonJson(v)).join(', ')+'}';
}
const bytes=text=>Buffer.byteLength(text,'utf8');
const TOO_LARGE_MESSAGE=`${TOO_LARGE}: over ${RESULT_LIMIT>>10} KB; summarise in SQL instead (aggregate, fewer columns, LIMIT)`;

// JSON-safe values with psycopg's shapes after plain(): numeric as exact text, dates and times as isoformat,
// json as values, bytea as a size label, anything unknown as its text.
const isoTimestamp=text=>text.replace(' ','T');
const isoTimestamptz=text=>isoTimestamp(text).replace(/([+-]\d{2})$/,'$1:00');
const float=text=>{const v=Number.parseFloat(text);return Number.isNaN(v)?'NaN':Number.isFinite(v)?v:v>0?'Infinity':'-Infinity';};
const integer=text=>{const v=Number(text);return Number.isSafeInteger(v)?v:text;};
const SCALAR={16:t=>t==='t',20:integer,21:Number,23:Number,26:Number,700:float,701:float,1114:isoTimestamp,1184:isoTimestamptz,
 114:t=>JSON.parse(t),3802:t=>JSON.parse(t),17:t=>`[binary ${t.startsWith('\\x')?(t.length-2)/2:Buffer.byteLength(t)} bytes]`};
const ARRAY={1000:16,1005:21,1007:23,1016:20,1021:700,1022:701,1231:1700,1009:25,1015:1043,1014:1042,1182:1082,1115:1114,1185:1184,2951:2950,199:114,3807:3802,1183:1083};
const identity=t=>t;
export const PLAIN_TYPES=Object.freeze({getTypeParser(oid,format){
 if(format==='binary')return identity;
 if(SCALAR[oid])return SCALAR[oid];
 if(ARRAY[oid]){const element=SCALAR[ARRAY[oid]]??identity;return text=>pg.types.arrayParser.create(text,v=>v===null?null:element(v)).parse();}
 return identity;
}});

function oversized(value){
 if(typeof value==='string')return [...value].length>CELL_LIMIT;
 if(value&&typeof value==='object')return bytes(pythonJson(value))>CELL_LIMIT;
 return false;
}
/** A bounded server message the model can act on; never a connection detail or credential. */
export function databaseError(error){
 const state=typeof error?.code==='string'?error.code:'';
 const message=String(error?.message??'').replaceAll('\n',' ').slice(0,300);
 if(state==='57014')return new ToolError('SQL_STATEMENT_TIMEOUT: narrow or aggregate the query');
 if(state==='55P03')return new ToolError('SQL_LOCK_TIMEOUT');
 if(state==='22P02'&&message.includes(TOO_LARGE))return new ToolError(TOO_LARGE_MESSAGE);
 if(['42','22','0A','25','21','2B','54','53'].includes(state.slice(0,2)))return new ToolError(`SQL_ERROR ${state}: ${message}`);
 return null;
}
const quoteIdent=name=>'"'+name.replaceAll('"','""')+'"';

/** @param {{pool:any,guardConnection:(client:any)=>Promise<void>,dbUser:string,readRole:string,database:string}} options */
export function createSqlTool({pool,guardConnection,dbUser,readRole,database}){
 if(!/^mw_chat_read_(dev|prod)$/.test(readRole??'')||typeof dbUser!=='string'||typeof database!=='string')throw Error('Invalid SQL tool target');
 /** One guarded read-only session; work(client) runs after the identity assertion. Always rolled back. */
 async function session(work){
  const client=await pool.connect();let quarantine=false;
  try{
   await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   await guardConnection(client);
   await client.query(`SET LOCAL ROLE ${quoteIdent(readRole)}`);
   await client.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
   await client.query("SET LOCAL lock_timeout = '2s'");
   await client.query("SET LOCAL idle_in_transaction_session_timeout = '30s'");
   await client.query('SET LOCAL search_path = pg_catalog, public');
   await client.query("SET LOCAL timezone = 'Asia/Bangkok'");
   await client.query('SET LOCAL standard_conforming_strings = on'); // the guard's tokenizer assumes it
   const who=(await client.query('SELECT session_user::text AS session, current_user::text AS role, current_database()::text AS database')).rows[0];
   if(who?.session!==dbUser||who?.role!==readRole||who?.database!==database)throw new ToolError('SQL_READ_IDENTITY_MISMATCH');
   return await work(client);
  }catch(error){
   if(error instanceof ToolError)throw error;
   const mapped=databaseError(error);
   throw mapped??error;
  }finally{
   try{await client.query('ROLLBACK');}catch{quarantine=true;}
   client.release(quarantine);
  }
 }
 /** Executes through a server-side cursor: the client never holds more than ROW_CAP + 1 rows. */
 const run=statement=>session(async client=>{
  await client.query(`DECLARE ${CURSOR} NO SCROLL CURSOR FOR ${statement}`);
  const result=await client.query({text:`FETCH ${ROW_CAP+1} FROM ${CURSOR}`,rowMode:'array',types:PLAIN_TYPES});
  await client.query(`CLOSE ${CURSOR}`);
  if(!Array.isArray(result.fields))throw new ToolError('SQL_NO_RESULT_SET');
  return {columns:result.fields.map(f=>f.name),rows:result.rows};
 });
 return {
  /** sql_query: the guarded statement's rows as an observation body. */
  async query(text){
   let {columns,rows}=await run(prepare(text));
   if(columns.at(-1)===BYTES){columns=columns.slice(0,-1);rows=rows.map(r=>r.slice(0,-1));}
   if(rows.length>ROW_CAP)throw new ToolError(`SQL_ROW_CAP_NARROW_QUERY: more than ${ROW_CAP} rows; aggregate in SQL (sum, count, group by) or LIMIT the rows you will list`);
   if(new Set(columns).size!==columns.length)throw new ToolError('SQL_DUPLICATE_COLUMN_NAMES: give every output column a distinct alias');
   if(rows.some(row=>row.some(oversized)))throw new ToolError(TOO_LARGE_MESSAGE);
   const result={columns,rows:rows.map(row=>Object.fromEntries(columns.map((c,i)=>[c,row[i]]))),row_count:rows.length,complete:true};
   if(bytes(pythonJson(result))>RESULT_LIMIT)throw new ToolError(TOO_LARGE_MESSAGE);
   return result;
  },
  /** loan_payoff: the encoded Daily Interest payoff for today (Bangkok), or why the loan is ineligible. */
  async payoff(loanId){
   if(typeof loanId!=='string'||!loanId.trim()||[...loanId].length>200||loanId.includes('\0'))throw new ToolError('INVALID_LOAN_ID');
   try{
    const value=await session(async client=>(await client.query({text:"SELECT public.loan_close_calculation_v83($1, (now() AT TIME ZONE 'Asia/Bangkok')::date) AS value",values:[loanId],types:PLAIN_TYPES})).rows[0]?.value);
    return {loan_id:loanId,eligible:true,calculation:value??null,complete:true};
   }catch(error){
    if(error?.code==='P0001')return {loan_id:loanId,eligible:false,reason:(String(error.message||'not eligible')).replaceAll('\n',' ').slice(0,300),complete:true};
    throw error;
   }
  },
 };
}
