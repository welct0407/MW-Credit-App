/** sql_query write/side-effect guard: a rule-for-rule port of integration-agent conversation_sql.py (tokenize,
 * guard, prepare). The model writes one SELECT/WITH statement; anything else is rejected before a connection is
 * opened: one statement, no comments, dollar quoting or escape strings, ASCII outside quotes, balanced
 * parentheses, no write/DDL/session/transaction keyword, no row locks and no function with a side effect or one
 * that runs query text. The server enforces the rest (sql-tool.mjs: role, READ ONLY transaction always rolled
 * back, timeouts, server-side cursor and byte bound). Read access is not narrowed (owner decision R085). */
import {ToolError} from './errors.mjs';

export const MAX_SQL=8000;
export const ROW_CAP=500;
export const RESULT_LIMIT=262144;
export const CELL_LIMIT=262144;
export const STATEMENT_TIMEOUT='20s';
export const CURSOR='mw_conversation_sql';
export const BYTES='__mw_row_bytes';
export const TOO_LARGE='SQL_RESULT_TOO_LARGE';
export const DENY_WORDS=Object.freeze(['INSERT','UPDATE','DELETE','MERGE','TRUNCATE','DROP','ALTER','CREATE','GRANT','REVOKE',
 'SET','RESET','COPY','CALL','DO','EXECUTE','PREPARE','LISTEN','NOTIFY','LOCK','VACUUM',
 'ANALYZE','REFRESH','COMMIT','ROLLBACK','BEGIN','START','SAVEPOINT','DECLARE','FETCH','INTO']);
const DENY=new Set(DENY_WORDS.map(w=>w.toLowerCase()));
// Functions with a side effect, a session change, a wait, a file read, or that execute SQL text given to them, and
// the two that act outside the read-only transaction. Matched by name (full match), quoted or not.
// Python's str \w is Unicode-aware (a quoted name may hold non-ASCII letters).
const W='[\\p{L}\\p{N}_]';
const SIDE_EFFECTS=new RegExp('^(?:set_config|pg_advisory'+W+'*|pg_try_advisory'+W+'*|pg_notify|pg_terminate_backend|'
 +'pg_cancel_backend|dblink'+W+'*|lo_'+W+'+|pg_sleep'+W+'*|pg_read_'+W+'+|pg_ls_'+W+'+|pg_stat_file|'
 +'ts_stat|ts_rewrite|query_to_xml'+W+'*|cursor_to_xml'+W+'*|table_to_xml'+W+'*|schema_to_xml'+W+'*|'
 +'database_to_xml'+W+'*|pg_logical_emit_message|pg_export_snapshot)$','iu');
const WORD=/[A-Za-z_][A-Za-z0-9_]*/y;
const NUMBER=/(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][-+]?[0-9]+)?/y;
const OPERATOR=/[-+*/<>=~!@#%^&|`?:]+/y;
const fail=code=>{throw new ToolError(code);};

/** @typedef {{kind:string,text:string,value:string,start:number,end:number}} Token */
const isWord=(token,...words)=>token?.kind==='word'&&words.includes(token.value.toLowerCase());

/** Words, quoted identifiers, literals, numbers, punctuation and operators, with offsets. */
export function tokenize(text){
 /** @type {Token[]} */
 const tokens=[];let i=0;
 while(i<text.length){
  const char=text[i];
  if(' \t\r\n'.includes(char)){i++;continue;}
  if(char==="'"||char==='"'){
   let end=i+1;const body=[];
   for(;;){
    if(end>=text.length)fail('SQL_UNTERMINATED_QUOTE');
    if(text[end]===char){
     if(end+1<text.length&&text[end+1]===char){body.push(char);end+=2;continue;}
     break;
    }
    body.push(text[end]);end++;
   }
   const previous=tokens.at(-1);
   // E'...' and U&'...' / U&"..." (also right after a quoted name, as in "text"E'...').
   if(previous&&previous.end===i&&(isWord(previous,'e','u')||previous.text.endsWith('&')))fail('SQL_ESCAPE_STRINGS_NOT_ALLOWED');
   tokens.push({kind:char==="'"?'string':'quoted',text:text.slice(i,end+1),value:body.join(''),start:i,end:end+1});
   i=end+1;continue;
  }
  const code=char.charCodeAt(0);
  if(code<0x20||code>0x7e)fail('SQL_NON_ASCII_OUTSIDE_QUOTES');
  let matched=false;
  for(const [kind,pattern] of /** @type {[string,RegExp][]} */([['word',WORD],['number',NUMBER],['operator',OPERATOR]])){
   pattern.lastIndex=i;const m=pattern.exec(text);
   if(m){tokens.push({kind,text:m[0],value:m[0],start:i,end:i+m[0].length});i+=m[0].length;matched=true;break;}
  }
  if(matched)continue;
  if('(),.[];'.includes(char)){tokens.push({kind:'punct',text:char,value:char,start:i,end:i+1});i++;}
  else fail('SQL_UNSUPPORTED_CHARACTER');
 }
 return tokens;
}

/** Rejects anything but one plain SELECT/WITH statement without side effects. Runs before connecting. */
export function guard(text){
 if(typeof text!=='string'||!text.trim())fail('SQL_EMPTY');
 if([...text].length>MAX_SQL)fail(`SQL_TOO_LONG: at most ${MAX_SQL} characters`);
 if(text.includes('\0'))fail('SQL_NUL_NOT_ALLOWED');
 if(text.includes('--')||text.includes('/*')||text.includes('*/'))fail('SQL_COMMENTS_NOT_ALLOWED');
 if(text.includes('$'))fail('SQL_DOLLAR_QUOTING_OR_PARAMETERS_NOT_ALLOWED');
 const tokens=tokenize(text);
 if(tokens.some(t=>t.kind==='punct'&&t.value===';')||tokens.some(t=>t.kind==='quoted'&&t.value.includes(';')))fail('SQL_ONE_STATEMENT_WITHOUT_SEMICOLON');
 if(!isWord(tokens[0],'select','with'))fail('SQL_MUST_START_WITH_SELECT_OR_WITH');
 let depth=0;
 for(const token of tokens){
  if(token.kind==='punct'&&(token.value==='('||token.value===')')){
   depth+=token.value==='('?1:-1;
   if(depth<0)fail('SQL_UNBALANCED_PARENTHESES');
  }
 }
 if(depth)fail('SQL_UNBALANCED_PARENTHESES');
 tokens.forEach((token,index)=>{
  if(isWord(token,'for')&&index+1<tokens.length&&isWord(tokens[index+1],'update','share','no','key'))fail('SQL_ROW_LOCKING_NOT_ALLOWED');
  if(token.kind!=='word'&&token.kind!=='quoted')return;
  if(DENY.has(token.value.toLowerCase()))fail('SQL_KEYWORD_NOT_ALLOWED: '+token.value.toUpperCase());
  if(SIDE_EFFECTS.test(token.value))fail('SQL_FUNCTION_NOT_ALLOWED: '+token.value.slice(0,60));
 });
 return text;
}

/** The statement sent to the server: the user query as a subquery under a server-side byte bound. The running
 * total of row sizes is checked on the server; a result over RESULT_LIMIT fails there with an error naming
 * TOO_LARGE (a non-constant cast, so it cannot be folded at plan time) before it is sent. */
export function prepare(text){
 guard(text);
 const total='"'+BYTES+'"';
 return `SELECT r.* FROM (SELECT q.*, sum(pg_column_size(q.*)) OVER (ROWS UNBOUNDED PRECEDING) AS ${total} `
  +`FROM (\n${text}\n) AS q) AS r WHERE CASE WHEN r.${total} > ${RESULT_LIMIT} `
  +`THEN ('${TOO_LARGE} ' || r.${total})::integer > 0 ELSE true END`;
}
