// R090: sql_query guard and session (services/chat/sql-guard.mjs, sql-tool.mjs) against the vectors of
// integration-agent/tests/test_conversation_sql.py: accepted reads, every rejected form before connecting, the
// prepared byte bound, the guarded read-only session (SET LOCAL ROLE mw_chat_read_dev and the identity
// assertion), caps, JSON-safe values, bounded server errors and loan_payoff. No database.
import test from 'node:test';
import assert from 'node:assert/strict';
import {guard,prepare,DENY_WORDS,BYTES,RESULT_LIMIT,TOO_LARGE,CELL_LIMIT,CURSOR} from '../../services/chat/sql-guard.mjs';
import {createSqlTool,PLAIN_TYPES} from '../../services/chat/sql-tool.mjs';

const ACCEPTED=[
 'SELECT 1',
 'select "Row ID", "Borrower Name" FROM "Borrowers" WHERE "Borrower Name" = \'Somchai; O\'\'Neil\'',
 'WITH t AS (SELECT sum("Amount Remaining") AS due FROM "Charges") SELECT due FROM t',
 'WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM r WHERE n < 5) SELECT n FROM r',
 '  SELECT "Updated At" FROM "Loans" ORDER BY 1 LIMIT 10 OFFSET 10',
 "SELECT count(*) FILTER (WHERE \"Loan Status\" = 'ยังไม่ปิดยอด') FROM \"Loans\"",
 "SELECT 'e' AS letter, settled_at FROM reporting_settlements",
 "SELECT public.loan_close_calculation_v83('L1', current_date)",
 'SELECT "Email", "Login Email" FROM "Partners"',
 'SELECT p FROM "Partners" p',
 'SELECT to_jsonb(p) AS row FROM "Partners" p',
 'SELECT * FROM pwa_push_subscriptions',
 "SELECT attname FROM pg_stats WHERE tablename = 'Loans'",
 'SELECT column_name FROM information_schema.columns',
 'SELECT g.n FROM generate_series(1, 3) AS g(n)',
 'SELECT 1\r\n',
];
const REJECTED=new Map([
 ['','SQL_EMPTY'],['x'.repeat(8001),'SQL_TOO_LONG'],['SELECT 1\x00','SQL_NUL_NOT_ALLOWED'],['SELECT 1 -- note','SQL_COMMENTS_NOT_ALLOWED'],
 ['SELECT /* hi */ 1','SQL_COMMENTS_NOT_ALLOWED'],['SELECT $$x$$','SQL_DOLLAR'],['SELECT $1','SQL_DOLLAR'],
 ["SELECT E'\\x41'",'SQL_ESCAPE_STRINGS_NOT_ALLOWED'],["SELECT e'\\x41'",'SQL_ESCAPE_STRINGS_NOT_ALLOWED'],
 ['SELECT U&"d\\0061ta"','SQL_ESCAPE_STRINGS_NOT_ALLOWED'],["SELECT U&'d\\0061ta'",'SQL_ESCAPE_STRINGS_NOT_ALLOWED'],
 ['SELECT "text"E\'\\x41\'','SQL_ESCAPE_STRINGS_NOT_ALLOWED'],
 ["SELECT to_jsonb(p)->>\"text\"E'Em\\x61il' FROM \"Partners\" p",'SQL_ESCAPE_STRINGS_NOT_ALLOWED'],
 ['SELECT 1; SELECT 2','SQL_ONE_STATEMENT_WITHOUT_SEMICOLON'],['SELECT 1;','SQL_ONE_STATEMENT_WITHOUT_SEMICOLON'],
 ['SELECT 1; DELETE FROM x','SQL_ONE_STATEMENT_WITHOUT_SEMICOLON'],['SELECT 1 FROM "a;b"','SQL_ONE_STATEMENT_WITHOUT_SEMICOLON'],
 ["SELECT 'unterminated",'SQL_UNTERMINATED_QUOTE'],['SELECT 1\u037e','SQL_NON_ASCII_OUTSIDE_QUOTES'],['SELECT\u00a01','SQL_NON_ASCII_OUTSIDE_QUOTES'],
 ['SELECT (1','SQL_UNBALANCED_PARENTHESES'],['SELECT 1) FROM (SELECT 2','SQL_UNBALANCED_PARENTHESES'],
 ['EXPLAIN SELECT 1','SQL_MUST_START_WITH_SELECT_OR_WITH'],['VALUES (1)','SQL_MUST_START_WITH_SELECT_OR_WITH'],
 ['(SELECT 1)','SQL_MUST_START_WITH_SELECT_OR_WITH'],['TABLE "Loans"','SQL_MUST_START_WITH_SELECT_OR_WITH'],
 ['SELECT * FROM "Loans" FOR UPDATE','SQL_ROW_LOCKING_NOT_ALLOWED'],['SELECT * FROM "Loans" FOR NO KEY UPDATE','SQL_ROW_LOCKING_NOT_ALLOWED'],
 ['SELECT * FROM "Loans" FOR SHARE','SQL_ROW_LOCKING_NOT_ALLOWED'],['SELECT * FROM "Loans" FOR KEY SHARE','SQL_ROW_LOCKING_NOT_ALLOWED'],
 ['SELECT 1 AS "delete"','SQL_KEYWORD_NOT_ALLOWED: DELETE'],['SELECT * INTO copy FROM "Loans"','SQL_KEYWORD_NOT_ALLOWED: INTO'],
 ['WITH x AS (DELETE FROM "Loans" RETURNING 1) SELECT * FROM x','SQL_KEYWORD_NOT_ALLOWED: DELETE'],
 ['SELECT pg_sleep(30)','SQL_FUNCTION_NOT_ALLOWED'],['SELECT "pg_sleep"(30)','SQL_FUNCTION_NOT_ALLOWED'],
 ["SELECT set_config('role','x',true)",'SQL_FUNCTION_NOT_ALLOWED'],['SELECT "set_config"(1,2,3)','SQL_FUNCTION_NOT_ALLOWED'],
 ["SELECT pg_catalog.set_config('a','b',true)",'SQL_FUNCTION_NOT_ALLOWED'],['SELECT pg_advisory_lock(1)','SQL_FUNCTION_NOT_ALLOWED'],
 ['SELECT pg_advisory_xact_lock(1)','SQL_FUNCTION_NOT_ALLOWED'],['SELECT pg_try_advisory_xact_lock(1) AS l','SQL_FUNCTION_NOT_ALLOWED'],
 ['SELECT pg_try_advisory_lock_shared(1)','SQL_FUNCTION_NOT_ALLOWED'],["SELECT pg_notify('c','x')",'SQL_FUNCTION_NOT_ALLOWED'],
 ['SELECT pg_terminate_backend(1)','SQL_FUNCTION_NOT_ALLOWED'],['SELECT pg_cancel_backend(1)','SQL_FUNCTION_NOT_ALLOWED'],
 ["SELECT dblink('x','y')",'SQL_FUNCTION_NOT_ALLOWED'],["SELECT lo_import('/etc/passwd')",'SQL_FUNCTION_NOT_ALLOWED'],
 ["SELECT pg_read_file('/etc/passwd')",'SQL_FUNCTION_NOT_ALLOWED'],["SELECT pg_read_binary_file('/x')",'SQL_FUNCTION_NOT_ALLOWED'],
 ["SELECT pg_ls_dir('.')",'SQL_FUNCTION_NOT_ALLOWED'],["SELECT * FROM ts_stat('select ''a''::tsvector')",'SQL_FUNCTION_NOT_ALLOWED'],
 ["SELECT * FROM ts_stat('select ' || chr(115) || 'et_config(1)')",'SQL_FUNCTION_NOT_ALLOWED'],
 ["SELECT word FROM ts_stat('select ' || chr(115)||'et_config'||'(''role'',''chase_writer'',true)::tsvector') WHERE false UNION ALL SELECT current_user::text",'SQL_FUNCTION_NOT_ALLOWED'],
 ["SELECT * FROM ts_stat('with x as (' || 'ins'||'ert into writes values (1) returning 1) select ''a''::tsvector from x')",'SQL_FUNCTION_NOT_ALLOWED'],
 ["SELECT ts_rewrite('a'::tsquery, 'select 1')",'SQL_FUNCTION_NOT_ALLOWED'],["SELECT query_to_xml('select 1', true, true, '')",'SQL_FUNCTION_NOT_ALLOWED'],
 ["SELECT pg_logical_emit_message(false, 'x', repeat('x', 1000000))",'SQL_FUNCTION_NOT_ALLOWED'],
 ["SELECT pg_catalog.\"pg_logical_emit_message\"(true, 'a', 'b')",'SQL_FUNCTION_NOT_ALLOWED'],['SELECT pg_export_snapshot()','SQL_FUNCTION_NOT_ALLOWED'],
 ["SELECT xpath('/a', query_to_xml('select 1',true,true,''))",'SQL_FUNCTION_NOT_ALLOWED'],
]);
for(const word of DENY_WORDS)if(!REJECTED.has(`SELECT 1 FROM t WHERE ${word.toLowerCase()} x`))REJECTED.set(`SELECT 1 FROM t WHERE ${word.toLowerCase()} x`,'SQL_KEYWORD_NOT_ALLOWED: '+word);

const TARGET={dbUser:'mw-credit-app-chat-dev@clever-oasis-508610-n7.iam',readRole:'mw_chat_read_dev',database:'loan_manager_dev'};
/** A fake pool client: records statements; DECLARE/FETCH return the fixed columns and rows (byte total appended). */
function connection({columns=['n'],rows=[[1]],who={session:TARGET.dbUser,role:TARGET.readRole,database:TARGET.database},error,total=true,payoff}={}){
 const c={statements:[],released:null,guarded:0,
  async query(q){
   const text=typeof q==='string'?q:q.text;c.statements.push(typeof q==='string'?q:{text:q.text,values:q.values,rowMode:q.rowMode,types:q.types});
   if(text.startsWith('SELECT session_user'))return {rows:[who]};
   if(text.startsWith('DECLARE')&&error)throw error;
   if(text.startsWith('FETCH')){const limit=Number(/FETCH (\d+)/.exec(text)[1]);c.fetched=limit;
    return {fields:(total?[...columns,BYTES]:columns).map(name=>({name})),rows:rows.slice(0,limit).map(r=>total?[...r,1]:r)};}
   if(text.startsWith('SELECT public.loan_close_calculation_v83')){if(payoff instanceof Error)throw payoff;return {rows:[{value:payoff}]};}
   return {rows:[]};
  },
  release(q){c.released=q;}};
 return c;
}
const tool=client=>createSqlTool({pool:{connect:async()=>client},guardConnection:async c=>{c.guarded++;},...TARGET});

test('guard accepts plain reads including every readable relation',()=>{for(const text of ACCEPTED)assert.equal(guard(text),text);});

test('guard rejects every listed form before connecting',async()=>{
 const sql=createSqlTool({pool:{connect:async()=>{throw Error('connection opened for a rejected query');}},guardConnection:async()=>{},...TARGET});
 for(const [text,code] of REJECTED)await assert.rejects(sql.query(text),e=>e.name==='ToolError'&&e.message.startsWith(code),text.slice(0,60));
});

test('prepared statement wraps the query under a server-side byte bound',()=>{
 const statement=prepare('SELECT 1 AS n');
 assert.ok(statement.includes('FROM (\nSELECT 1 AS n\n) AS q'));
 assert.ok(statement.includes(`sum(pg_column_size(q.*)) OVER (ROWS UNBOUNDED PRECEDING) AS "${BYTES}"`));
 assert.ok(statement.includes(`> ${RESULT_LIMIT}`));
 assert.ok(statement.includes(`'${TOO_LARGE} ' || r."${BYTES}"`));
 assert.throws(()=>prepare('SELECT pg_sleep(1)'),/SQL_FUNCTION_NOT_ALLOWED/);
});

test('session is read-only, guarded, switched to the read role, asserted, cursor-bound and always rolled back',async()=>{
 const client=connection();
 assert.deepEqual(await tool(client).query('SELECT 1 AS n'),{columns:['n'],rows:[{n:1}],row_count:1,complete:true});
 const statements=client.statements.map(s=>typeof s==='string'?s:s.text);
 assert.deepEqual(statements.slice(0,9),['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','SET LOCAL ROLE "mw_chat_read_dev"',
  "SET LOCAL statement_timeout = '20s'","SET LOCAL lock_timeout = '2s'","SET LOCAL idle_in_transaction_session_timeout = '30s'",
  'SET LOCAL search_path = pg_catalog, public',"SET LOCAL timezone = 'Asia/Bangkok'",'SET LOCAL standard_conforming_strings = on',
  'SELECT session_user::text AS session, current_user::text AS role, current_database()::text AS database']);
 assert.equal(client.guarded,1);
 assert.equal(statements[9],`DECLARE ${CURSOR} NO SCROLL CURSOR FOR ${prepare('SELECT 1 AS n')}`);
 assert.equal(statements[10],`FETCH 501 FROM ${CURSOR}`);assert.equal(client.fetched,501);
 assert.equal(client.statements[10].rowMode,'array');
 assert.equal(statements.at(-1),'ROLLBACK');assert.equal(client.released,false);
});

test('identity mismatch stops before the query',async()=>{
 for(const who of [{session:'postgres',role:TARGET.readRole,database:TARGET.database},{session:TARGET.dbUser,role:TARGET.dbUser,database:TARGET.database},
  {session:TARGET.dbUser,role:TARGET.readRole,database:'loan_manager_prod'}]){
  const client=connection({who});
  await assert.rejects(tool(client).query('SELECT 1'),/SQL_READ_IDENTITY_MISMATCH/);
  assert.equal(client.statements.some(s=>(s.text??s).startsWith('DECLARE')),false);
  assert.equal(client.statements.at(-1),'ROLLBACK');
 }
 assert.throws(()=>createSqlTool({pool:{},guardConnection:async()=>{},...TARGET,readRole:'mw_integration_agent'}),/Invalid SQL tool target/);
});

test('row cap, cell cap and size limit',async()=>{
 await assert.rejects(tool(connection({rows:Array.from({length:600},(_,i)=>[i])})).query('SELECT 1'),/^ToolError: SQL_ROW_CAP_NARROW_QUERY/);
 assert.equal((await tool(connection({rows:Array.from({length:500},(_,i)=>[i])})).query('SELECT 1')).row_count,500);
 await assert.rejects(tool(connection({columns:['big'],rows:[['x'.repeat(CELL_LIMIT+1)]]})).query('SELECT 1'),/SQL_RESULT_TOO_LARGE: a value/);
 await assert.rejects(tool(connection({columns:['doc'],rows:[[{k:'x'.repeat(CELL_LIMIT)}]]})).query('SELECT 1'),/SQL_RESULT_TOO_LARGE: a value/);
 await assert.rejects(tool(connection({columns:['x'],rows:Array.from({length:300},()=>['x'.repeat(1000)])})).query('SELECT 1'),/SQL_RESULT_TOO_LARGE: select/);
 await assert.rejects(tool(connection({columns:['?column?','?column?'],rows:[[1,2]]})).query('SELECT 1'),/SQL_DUPLICATE_COLUMN_NAMES/);
});

test('values are JSON safe in psycopg plain() shapes',()=>{
 const parse=oid=>PLAIN_TYPES.getTypeParser(oid,'text');
 assert.equal(parse(1700)('10600.00'),'10600.00');
 assert.equal(parse(1082)('2026-10-21'),'2026-10-21');
 assert.equal(parse(1114)('2026-10-21 14:05:00'),'2026-10-21T14:05:00');
 assert.equal(parse(1184)('2026-10-21 14:05:00+07'),'2026-10-21T14:05:00+07:00');
 assert.deepEqual(parse(3802)('{"partner":{"Email":"a@example.com","name":"A"}}'),{partner:{Email:'a@example.com',name:'A'}});
 assert.equal(parse(20)('42'),42);assert.equal(parse(20)('9223372036854775807'),'9223372036854775807');
 assert.equal(parse(701)('NaN'),'NaN');assert.equal(parse(17)('\\x0102'),'[binary 2 bytes]');
 assert.deepEqual(parse(1231)('{1.50,NULL}'),['1.50',null]);assert.equal(parse(16)('t'),true);
 assert.equal(parse(790)('$1.00'),'$1.00');
});

test('server errors are bounded messages',async()=>{
 await assert.rejects(tool(connection({error:Object.assign(Error('canceling statement due to statement timeout'),{code:'57014'})})).query('SELECT 1'),/^ToolError: SQL_STATEMENT_TIMEOUT/);
 await assert.rejects(tool(connection({error:Object.assign(Error('column "x" does not exist'),{code:'42703'})})).query('SELECT 1'),/^ToolError: SQL_ERROR 42703: column "x" does not exist/);
 await assert.rejects(tool(connection({error:Object.assign(Error('permission denied for table pwa_chat_messages'),{code:'42501'})})).query('SELECT 1'),/SQL_ERROR 42501/);
 await assert.rejects(tool(connection({error:Object.assign(Error('invalid input syntax for type integer: "SQL_RESULT_TOO_LARGE 300000"'),{code:'22P02'})})).query('SELECT 1'),/SQL_RESULT_TOO_LARGE: select fewer/);
 await assert.rejects(tool(connection({error:Object.assign(Error('server closed the connection'),{code:'08006'})})).query('SELECT 1'),e=>e.name!=='ToolError');
});

test('payoff eligible and ineligible',async()=>{
 const calculation={amount:10600,allocations:[],planHash:'x'};
 const client=connection({payoff:calculation});
 assert.deepEqual(await tool(client).payoff('L1'),{loan_id:'L1',eligible:true,calculation,complete:true});
 const statement=client.statements.find(s=>s.text?.startsWith('SELECT public.loan_close'));
 assert.equal(statement.text,"SELECT public.loan_close_calculation_v83($1, (now() AT TIME ZONE 'Asia/Bangkok')::date) AS value");
 assert.deepEqual(statement.values,['L1']);
 assert.ok(client.statements.includes('SET LOCAL ROLE "mw_chat_read_dev"'));
 const value=await tool(connection({payoff:Object.assign(Error('Loan L2 is not an open auto-enabled Daily Interest loan'),{code:'P0001'})})).payoff('L2');
 assert.deepEqual([value.eligible,value.loan_id,value.reason],[false,'L2','Loan L2 is not an open auto-enabled Daily Interest loan']);
 for(const bad of ['',' ','x'.repeat(201),'a\x00b',null])await assert.rejects(tool(connection()).payoff(bad),/INVALID_LOAN_ID/);
});

test('batch 2 (B4): the job status function passes the guard like the other reporting functions',()=>{
 for(const sql of ["SELECT job_name, business_date, state, completed_at FROM pwa_job_status_v1(7) WHERE job_name='daily-charges'",'SELECT * FROM public.pwa_job_status_v1(7)'])assert.equal(guard(sql),sql);
});
