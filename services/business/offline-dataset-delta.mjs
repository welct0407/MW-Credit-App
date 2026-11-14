import {readOfflineDatasetChunk,readRecordsTargeted,resolveRecordsScope,resolveCollectionScope,readCollectionTargeted,resolveCashScope,readCashTargeted,readOfflineStamp,dayTraversal,offlineDayKeys,TARGETED_LIMITS,MAX_CHUNK_VALUES} from './offline-dataset-chunks.mjs';
import {createHash} from 'node:crypto';
import {deltaValueHash,deltaCursorTraversal,encodeDeltaChunk,readDeltaCursor,readDeltaRequest,wrapDeltaCursor} from '../api/offline-dataset-delta.mjs';
import {applyDatasetPatch,datasetDigests,digestDifferences} from '../lib/offline-dataset-digest.mjs';
import {log} from '../lib/log.mjs';

// R078 source fingerprints. Polling never evaluates the forecast/analytics providers; it hashes
// the base tables each domain's providers read (views and functions resolved against the
// migrated catalogue). Derived persisted inputs, receipts, direct CRUD and deletes count; the
// PWA command journal only where a provider reads it. No authentication/delivery last-seen
// tables belong here. Never drop a table a domain's output depends on.
const ledgerTables=['Cash Accounts','Cash Holders','Cash Ledger','Cash Pool Contributions','Settlements','Partners','Business Expenses','Loans','Payments','Repayments','r008_cash_account_cutover'];
const collectionTables=['Borrowers','Loans','Charges','Payments','Payment Allocations','Repayments','Cash Accounts'];
// cash: overview (Cash Dashboard, Cash Account Balances), statements (recent statement views,
// counterparty Borrowers/Partners) and preferences (Cash Statement Context).
const cashTables=[...ledgerTables,'Cash Statement Context','Borrowers'];
export const offlineSourceTables=Object.freeze({
 // The records dashboard reads olap_portfolio_summary: its Statistics row set (CROSS JOIN) and the
 // 30-day "Daily Analytics" window. The hourly analytics job flips Statistics."Analytics Refresh
 // Request" and rewrites today's analytics row, so records hashes Statistics by identity and Daily
 // Analytics by content (without the refresh time): unchanged values give an unchanged version.
 records:Object.freeze([...collectionTables,'Cash Holders','Cash Ledger','Cash Pool Contributions','Settlements','Partners','Business Expenses','r008_cash_account_cutover','pwa_payment_commands','Statistics#identity','Daily Analytics#content']),
 // R146: the collection list mark and detail card read pwa_group_chat_summaries (V146); records does not.
 // R149: its items also carry the reading user's chatSeenAt from pwa_group_chat_seen (V147).
 collection:Object.freeze([...collectionTables,'pwa_group_chat_summaries','pwa_group_chat_seen']),
 cash:Object.freeze(cashTables),
 // Management shows the analytics itself, so it hashes them like every other table.
 management:Object.freeze([...new Set([...cashTables,'Charges','Loan Assessment SQL Lab','Daily Analytics','Statistics'])]),
});
/** Authoritative provider pages per request (R078: cash 4 → 16, management 1 → 8). */
export const offlineDeterministicPages=Object.freeze({records:32,collection:2,cash:16,management:8});
const domainNames=Object.keys(offlineSourceTables);
const allSources=[...new Set(Object.values(offlineSourceTables).flat())];
// Each table's primary key; every other listed table is keyed by "Row ID".
const primaryKeys={pwa_group_chat_summaries:'borrower_id',pwa_group_chat_seen:'borrower_id',pwa_payment_commands:'request_id',r008_cash_account_cutover:'"Ref Cash Account"','Cash Statement Context':'"Ref Partner"'};
/** One aggregate per source, order-independent (no sort): row count plus the sum of a 64-bit
 * hash per row. (key, xmin) detects what to_jsonb(row)||xmin did: every INSERT, UPDATE or
 * DELETE creates or removes a tuple version with a fresh xmin, edit-then-revert included. */
function sourceSql(source){
 const [table,mode]=source.split('#'),key=`s.${primaryKeys[table]??'"Row ID"'}::text`;
 const value=mode==='identity'?`${key}||':'||coalesce(s."Statistics ID"::text,'')`:mode==='content'?`(to_jsonb(s)-'Generated At')::text`:`${key}||':'||s.xmin::text`;
 const where=mode==='content'?` WHERE s."Snapshot Date">=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-31`:'';
 return `SELECT '${source}' AS relation,count(*)::text||':'||coalesce(sum(hashtextextended(${value},0)),0)::text AS fingerprint FROM public."${table}" s${where}`;
}
const queries=new Map();
const fingerprintQuery=sources=>{const key=sources.join('\n');if(!queries.has(key))queries.set(key,sources.map(sourceSql).join(' UNION ALL '));return queries.get(key)};
// Sources a database may not have yet. The suites that pin an older migration head (and a command image that meets a
// database before V146, which the PROD order does not allow but a rollback can) must keep syncing: an absent or
// unreadable optional table is left out of the fingerprint, exactly as the collection read answers null for it, and
// domainVersion already hashes only the relations it was given. The version changes once when the table appears.
// R149: pwa_group_chat_seen (V147) likewise; its fingerprint key is the borrower (one row version per user and borrower,
// so (borrower, xmin) with the row count detects every write).
const optionalSources=Object.freeze(['pwa_group_chat_summaries','pwa_group_chat_seen']);
/** The requested sources this database has: every required one, and each optional one that exists and is readable. */
async function availableSources(client,sources){
 const wanted=optionalSources.filter(table=>sources.includes(table));if(!wanted.length)return sources;
 const present=new Set((await client.query(`SELECT name FROM unnest($1::text[]) name WHERE COALESCE(has_table_privilege(to_regclass('public.'||quote_ident(name)),'SELECT'),false)`,[wanted])).rows.map(row=>row.name));
 return sources.filter(source=>!wanted.includes(source)||present.has(source));
}
/** All requested source fingerprints from one statement (one snapshot, one scan per table). */
async function readSourceFingerprints(client,sources){
 const rows=(await client.query(fingerprintQuery(await availableSources(client,sources)))).rows;
 return new Map(rows.map(row=>[row.relation,row.fingerprint]));
}
// R154 hotfix (owner's PROD report of 14 November 2026: a borrower record cached before V149 had no igGroupInviteLink, so
// the edit form hid the invite field). A shape bump below changes every version, but a client holding a change cursor
// asked for a row delta or a day change, which re-read only the rows changed since its cursor and answered with the new
// version: the unchanged rows kept their old shape for good (until a reconciliation or a full sync). The shape is now
// also stamped into the version itself (its last 8 hex digits), so the server tells a bundle read under an earlier shape
// and walks it instead (acceptsRowDelta). A version from before this stamp matches it with probability 2^-32.
export const OFFLINE_DATASET_SHAPE='business-offline-v11';
const SHAPE_STAMP='5a9e'+Number(OFFLINE_DATASET_SHAPE.slice(OFFLINE_DATASET_SHAPE.lastIndexOf('-v')+2)).toString(16).padStart(4,'0');
/** The 64-hex version with the current shape stamped into its last 8 digits. */
export const shapedVersion=hash=>hash.slice(0,56)+SHAPE_STAMP;
/** Whether a client may take a row delta or a day change (both keep its unchanged rows): its stored version was read under
 * the current shape. null is a bundle holding own writes applied locally (the client then sends no version); it keeps
 * the delta it had, and a reconciliation heals a bundle that was also of an earlier shape. */
export const acceptsRowDelta=sourceVersion=>sourceVersion===null||typeof sourceVersion==='string'&&sourceVersion.length===64&&sourceVersion.endsWith(SHAPE_STAMP);
function domainVersion(fingerprints,actor,domain,businessDate){
 const rows=offlineSourceTables[domain].filter(relation=>fingerprints.has(relation)).map(relation=>({relation,fingerprint:fingerprints.get(relation)})).sort((a,b)=>a.relation<b.relation?-1:a.relation>b.relation?1:0);
 // v4 (R078): per-domain table sets and the (key, xmin) aggregate. Installed clients see one
 // changed version per domain after the upgrade and walk once.
 // v6 (R116): the Cash Ledger list changed order and gained borrower names; every installed bundle walks once,
 // also across a day change (the client's v5 version can no longer match), so no saved list keeps the old shape.
 // v7 (R118): charges, drafts, related records and upcoming rows carry the late charge; every installed bundle walks once.
 // v8 (R120): borrower records carry the referral rebate terms and expenses the applied terms; every bundle walks once.
 // v9 (R146): collection items carry chatSummaryAt and the detail the group chat summary; every bundle walks once.
 // v10 (R153): borrower records carry igGroupUrl (V148 changes every borrower version, not the xmin fingerprints) and
 // the group chat summaries their url; every bundle walks once.
 // v11 (R154): borrower records carry igGroupInviteLink (V149 changes every borrower version) and the group chat
 // summaries their inviteUrl; every bundle walks once.
 return shapedVersion(deltaValueHash([OFFLINE_DATASET_SHAPE,actor.issuer,actor.subject,actor.partnerId,domain,businessDate,rows]));
}
export async function readOfflineSourceVersion(client,actor,domain,businessDate){
 if(!offlineSourceTables[domain])throw Error('invalid_request');
 return domainVersion(await readSourceFingerprints(client,offlineSourceTables[domain]),actor,domain,businessDate);
}
/** Every domain's version from one statement over the union of the source tables. */
export async function readOfflineSourceVersions(client,actor,businessDate){
 const fingerprints=await readSourceFingerprints(client,allSources);
 return Object.fromEntries(domainNames.map(domain=>[domain,domainVersion(fingerprints,actor,domain,businessDate)]));
}
// R078 protocol v4. V97's public.pwa_row_changes logs every changed row of the tracked tables. The log is
// an accelerator, never the authority: the per-domain fingerprint above still decides "unchanged", and a
// difference the log cannot explain (TRUNCATE, writes with triggers bypassed, a gap, a delete, anything
// unmapped or over the limits, any error) falls back to the v3 walk. Only records answers with a delta.
const changeTables=Object.fromEntries(Object.entries(offlineSourceTables).map(([domain,sources])=>[domain,[...new Set(sources.map(source=>source.split('#')[0]))]]));
/** The change-log position of this request's snapshot, or null where the log is absent or unreadable. */
export async function readChangeCursor(client,businessDate){
 const available=(await client.query(`SELECT CASE WHEN to_regclass('public.pwa_row_changes') IS NULL THEN false ELSE has_table_privilege(to_regclass('public.pwa_row_changes'),'SELECT') END AS available`)).rows[0]?.available===true;
 if(!available)return null;
 const row=(await client.query(`SELECT coalesce(max(seq),0)::text AS seq,min(seq)::text AS "minSeq",pg_snapshot_xmin(pg_current_snapshot())::text AS xmin FROM public.pwa_row_changes`)).rows[0];
 return row&&/^\d+$/.test(row.seq)&&/^\d+$/.test(row.xmin)?{seq:row.seq,xmin:row.xmin,businessDate,minSeq:row.minSeq??null}:null;
}
/** row_key of the change-log row V97 writes for a TRUNCATE (a real key '*' only costs an extra walk). */
export const TRUNCATE_MARKER='*';
const publicCursor=cursor=>cursor?{changes:{seq:cursor.seq,xmin:cursor.xmin,businessDate:cursor.businessDate}}:{};
/** Rows changed since the client's cursor: seq after it, or written by a transaction still in progress at
 * that snapshot (seq is assigned at insert, not commit). Null when the cursor cannot be continued (gap, other
 * database, size bound, a TRUNCATE marker). acrossDays: a day change reads the rows of an earlier day's cursor. */
export async function readChangedRows(client,domain,since,current,limit=TARGETED_LIMITS.rows,{acrossDays=false}={}){
 if(!current||!acrossDays&&since.businessDate!==current.businessDate)return null;
 const seq=BigInt(since.seq);if(seq>BigInt(current.seq)||current.minSeq!==null&&seq<BigInt(current.minSeq)-1n)return null;
 const rows=(await client.query(`SELECT table_name AS "table",row_key AS key FROM public.pwa_row_changes WHERE table_name=ANY($1::text[]) AND (seq>$2::bigint OR txid>=$3::xid8) ORDER BY seq LIMIT $4`,[changeTables[domain],since.seq,since.xmin,limit+1])).rows;
 // V97 (50825c4) logs a TRUNCATE of a tracked table as one marker row: the domain walks.
 return rows.length>limit||rows.some(row=>row.key===TRUNCATE_MARKER)?null:rows;
}
async function guarded(client,work){
 await client.query('SAVEPOINT offline_v4');
 try{const value=await work();await client.query('RELEASE SAVEPOINT offline_v4');return value}
 catch(error){if(error?.message==='offline_read_cancelled')throw error;await client.query('ROLLBACK TO SAVEPOINT offline_v4');await client.query('RELEASE SAVEPOINT offline_v4');return null}
}
const patchValueCount=patches=>patches.reduce((sum,patch)=>sum+(['append','upsert','replaceWhere'].includes(patch.mode)?patch.value.length:1),0);
/** R078 row deltas for collection and cash (clients declaring rowDeltas): {patches, scope} or null (walk). scope
 * travels to the client, which checks the rows that may have left it (deltaScopeMoves). */
async function readRowDelta(client,actor,domain,request,stamp,current){
 const rows=await readChangedRows(client,domain,request.since,current);
 if(!rows?.length)return null;
 if(domain==='collection'){const scope=await resolveCollectionScope(client,rows);if(!scope)return null;const patches=await readCollectionTargeted(client,actor,stamp,scope);return patchValueCount(patches)>4*MAX_CHUNK_VALUES?null:{patches,scope}}
 const scope=await resolveCashScope(client,rows);if(!scope)return null;
 const patches=await readCashTargeted(client,actor,stamp,scope);
 return patchValueCount(patches)>4*MAX_CHUNK_VALUES?null:{patches,scope:{ledgerIds:scope.ledgerIds,from:scope.from}};
}
/** Records changed since the client's cursor, as targeted patches; null means walk instead. */
async function readRecordsDelta(client,actor,request,stamp,current){
 const rows=await readChangedRows(client,'records',request.since,current);
 if(!rows?.length)return null;
 const scope=await resolveRecordsScope(client,rows);if(!scope)return null;
 const patches=await readRecordsTargeted(client,actor,stamp,scope);
 return patchValueCount(patches)>4*MAX_CHUNK_VALUES?null:patches;
}
// R078 day change (owner, 19 October 2026: "smaller is better, but it shouldn't compromise data integrity").
// A bundle read on an earlier business date keeps its date-independent keys (offlineDayKeys ind) and the day plan
// re-reads the others, as a resumable traversal ('records@day:<from>'). Row changes since the bundle's cursor are
// combined: records re-reads them like a v4 delta; cash and management take only changes in tables that feed
// re-read keys alone. The fingerprint stays the authority: with nothing in the change log, the sources must hash
// to the client's version at its own date. Anything else (an error, a gap or marker, a moved row, an unlisted
// key on the client, more than DAY_CHANGE_MAX_DAYS) walks.
export const DAY_CHANGE_MAX_DAYS=14;
/** Tables whose changes reach only keys the day plan re-reads (records: the dashboard-only tables). */
const dayRereadTables=Object.freeze({records:['Settlements','Partners','Cash Pool Contributions','r008_cash_account_cutover','Statistics','Daily Analytics'],cash:[],management:['Daily Analytics','Statistics','Loan Assessment SQL Lab']});
async function readDayChange(client,actor,domain,request,stamp,current,sourceVersion){
 const from=request.since.businessDate,days=(Date.parse(stamp.businessDate+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000,traversal=dayTraversal(domain,from);
 if(!traversal||!(days>=1&&days<=DAY_CHANGE_MAX_DAYS))return null;
 const rows=await readChangedRows(client,domain,request.since,current,TARGETED_LIMITS.rows,{acrossDays:true});
 if(!rows)return null;
 if(!rows.length&&(request.sourceVersion===null||await readOfflineSourceVersion(client,actor,domain,from)!==request.sourceVersion))return null;
 const rest=rows.filter(row=>!dayRereadTables[domain].includes(row.table));
 let targeted=[];
 if(rest.length){
  if(domain!=='records')return null;
  const scope=await resolveRecordsScope(client,rest);if(!scope)return null;
  targeted=await readRecordsTargeted(client,actor,stamp,{...scope,dashboard:false});
 }
 const chunk=await readOfflineDatasetChunk(client,actor,traversal,null,{deterministicPages:offlineDeterministicPages[domain]});
 if(chunk.businessDate!==stamp.businessDate)return null;
 const {ind:keep,dep:reread}=offlineDayKeys[domain];
 return {...encodeDeltaChunk({...chunk,patches:[...targeted,...chunk.patches],sourceVersion,delta:true,dayChange:{from,keep,reread},...publicCursor(current),nextCursor:chunk.nextCursor?wrapDeltaCursor(chunk.nextCursor,sourceVersion):null},request.need,{dates:true,inline:request.inlineValues}),schemaVersion:4};
}
// R078 reconciliation (owner, 19 October 2026: twice a day). The client sends the digests of its stored bundle
// and that bundle's source version; the server walks the domain in this request (one snapshot, no round trips),
// applies the patches exactly as a client does and compares the digests key by key. Cached per actor, day and
// source version for 12 h. A version that moved never reports a mismatch.
const RECONCILE_CACHE_MS=12*60*60*1000,RECONCILE_BUDGET_MS=40*1000,reconcileCache=new Map();
const sha256=text=>createHash('sha256').update(text).digest('hex');
async function readOfflineReconcile(client,actor,domain,request,stamp){
 const started=Date.now(),base={schemaVersion:3,domain,...stamp,reconcile:true,patches:[],values:{},complete:true,nextCursor:null};
 const finish=(result,fields={})=>{log(result==='mismatch'?'WARNING':'INFO','offline_reconcile',{domain,result,keys:fields.keys??[],ms:Date.now()-started});return {...base,result,...fields}};
 const sourceVersion=await readOfflineSourceVersion(client,actor,domain,stamp.businessDate);
 if(sourceVersion!==request.sourceVersion)return finish('stale',{sourceVersion});
 const key=JSON.stringify([domain,actor.issuer,actor.subject,actor.partnerId,stamp.businessDate,sourceVersion]),cached=reconcileCache.get(key);
 let server=cached&&Date.now()-cached.at<RECONCILE_CACHE_MS?cached.digests:null;
 if(!server){
  /** @type {Record<string,unknown>} */
  const data={};let cursor=null;
  for(;;){
   if(Date.now()-started>RECONCILE_BUDGET_MS)return finish('unavailable');
   const chunk=await readOfflineDatasetChunk(client,actor,domain,cursor,{deterministicPages:offlineDeterministicPages[domain]});
   for(const patch of chunk.patches)applyDatasetPatch(data,patch);
   if(chunk.complete)break;cursor=chunk.nextCursor;
  }
  if(await readOfflineSourceVersion(client,actor,domain,stamp.businessDate)!==sourceVersion)return finish('changed');
  server=await datasetDigests(data,sha256);
  for(const [entry,value] of reconcileCache)if(Date.now()-value.at>=RECONCILE_CACHE_MS)reconcileCache.delete(entry);
  while(reconcileCache.size>=64)reconcileCache.delete(reconcileCache.keys().next().value);
  reconcileCache.set(key,{at:Date.now(),digests:server});
 }
 const keys=digestDifferences(server,request.digests);
 return finish(keys.length||server.digest!==request.digests.digest?'mismatch':'match',{sourceVersion,keys,digest:server.digest});
}
export async function readOfflineDatasetDelta(client,actor,domain,input){
 if(!offlineSourceTables[domain])throw Error('invalid_request');
 const request=readDeltaRequest(input),cursor=readDeltaCursor(request.cursor);
 const stamp=await readOfflineStamp(client);
 if(request.reconcile)return readOfflineReconcile(client,actor,domain,request,stamp);
 // A continuing traversal: the domain's walk, or its day-change re-read.
 const traversal=cursor?deltaCursorTraversal(cursor):domain,day=traversal===domain?null:traversal===dayTraversal(domain,traversal.slice(domain.length+5))?{from:traversal.slice(domain.length+5)}:undefined;
 if(day===undefined)throw Error('invalid_request');
 const encode=(chunk,need)=>encodeDeltaChunk(chunk,need,{dates:request.dates});
 // A delta (schemaVersion 4) answers in one request for a client declaring inlineValues, within the caps.
 const encodeDelta=(chunk,need)=>encodeDeltaChunk(chunk,need,{dates:request.dates,inline:request.inlineValues});
 // R078: a check that starts a domain may ask for every domain's version (`versions`); the client
 // then skips the requests of the unchanged domains. Computed once, from the same snapshot.
 const versions=!cursor&&request.versions?await readOfflineSourceVersions(client,actor,stamp.businessDate):null,peers=versions?{versions}:{};
 const sourceVersion=cursor?.sourceVersion??versions?.[domain]??await readOfflineSourceVersion(client,actor,domain,stamp.businessDate);
 // The change-log position of this same snapshot: a client keeps the one of the request that starts its
 // bundle (a walk's first request, an unchanged check, a delta) and asks for changes since it (v4).
 const current=cursor?null:await readChangeCursor(client,stamp.businessDate),changes=publicCursor(current);
 if(!cursor&&!request.need.length&&request.sourceVersion===sourceVersion)return {schemaVersion:3,domain,...stamp,sourceVersion,unchanged:true,patches:[],values:{},complete:true,nextCursor:null,progress:{completed:1,total:1},...changes,...peers};
 // R154 hotfix: a bundle read under an earlier shape never takes a row delta or a day change; it walks below.
 const shapeCurrent=acceptsRowDelta(request.sourceVersion);
 if(!cursor&&request.since&&shapeCurrent&&request.rowDeltas&&(domain==='collection'||domain==='cash')&&current){
  const value=await guarded(client,()=>readRowDelta(client,actor,domain,request,stamp,current));
  if(value)return {...encodeDelta({domain,generation:'v4:'+current.seq,startedAt:stamp.asOf,...stamp,sourceVersion,delta:true,patches:value.patches,scope:value.scope,complete:true,nextCursor:null,progress:{completed:1,total:1},...changes,...peers},request.need),schemaVersion:4};
 }
 if(!cursor&&request.since&&shapeCurrent&&domain==='records'&&current){
  const patches=await guarded(client,()=>readRecordsDelta(client,actor,request,stamp,current));
  // The fingerprint of this snapshot travels with the delta, so the client stores the two together.
  if(patches)return {...encodeDelta({domain,generation:'v4:'+current.seq,startedAt:stamp.asOf,...stamp,sourceVersion,delta:true,patches,complete:true,nextCursor:null,progress:{completed:1,total:1},...changes,...peers},request.need),schemaVersion:4};
 }
 // A client that hydrates businessDate (dates) and holds a bundle of an earlier business date.
 if(!cursor&&request.since&&shapeCurrent&&request.dates&&current&&request.since.businessDate<stamp.businessDate&&offlineDayKeys[domain]){
  const value=await guarded(client,()=>readDayChange(client,actor,domain,request,stamp,current,sourceVersion));
  if(value)return value;
 }
 // Stable page counts make manifest/content replay deterministic while avoiding a separate HTTP
 // round trip for every small page; the byte and value budgets still apply between pages.
 const chunk={...await readOfflineDatasetChunk(client,actor,traversal,cursor?.inner??null,{deterministicPages:offlineDeterministicPages[domain]}),...(day?{dayChange:day}:{})};
 if(chunk.complete&&cursor&&await readOfflineSourceVersion(client,actor,domain,stamp.businessDate)!==sourceVersion){
  // R064: a client declaring acceptChanged keeps the walked ("torn") bundle with
  // no source version and rechecks; older clients still receive 409 and re-walk.
  if(!request.acceptChanged)throw Error('dataset_changed');
  return encode({...chunk,sourceVersion:null,changed:true,nextCursor:null},request.need);
 }
 return encode({...chunk,sourceVersion,...changes,...peers,nextCursor:chunk.nextCursor?wrapDeltaCursor(chunk.nextCursor,sourceVersion):null},request.need);
}
