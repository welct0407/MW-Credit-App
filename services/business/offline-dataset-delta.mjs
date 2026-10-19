import {readOfflineDatasetChunk} from './offline-dataset-chunks.mjs';
import {deltaValueHash,encodeDeltaChunk,readDeltaCursor,readDeltaRequest,wrapDeltaCursor} from '../api/offline-dataset-delta.mjs';

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
 collection:Object.freeze(collectionTables),
 cash:Object.freeze(cashTables),
 // Management shows the analytics itself, so it hashes them like every other table.
 management:Object.freeze([...new Set([...cashTables,'Charges','Loan Assessment SQL Lab','Daily Analytics','Statistics'])]),
});
/** Authoritative provider pages per request (R078: cash 4 → 16, management 1 → 8). */
export const offlineDeterministicPages=Object.freeze({records:32,collection:2,cash:16,management:8});
const domainNames=Object.keys(offlineSourceTables);
const allSources=[...new Set(Object.values(offlineSourceTables).flat())];
// Each table's primary key; every other listed table is keyed by "Row ID".
const primaryKeys={pwa_payment_commands:'request_id',r008_cash_account_cutover:'"Ref Cash Account"','Cash Statement Context':'"Ref Partner"'};
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
/** All requested source fingerprints from one statement (one snapshot, one scan per table). */
async function readSourceFingerprints(client,sources){
 const rows=(await client.query(fingerprintQuery(sources))).rows;
 return new Map(rows.map(row=>[row.relation,row.fingerprint]));
}
function domainVersion(fingerprints,actor,domain,businessDate){
 const rows=offlineSourceTables[domain].filter(relation=>fingerprints.has(relation)).map(relation=>({relation,fingerprint:fingerprints.get(relation)})).sort((a,b)=>a.relation<b.relation?-1:a.relation>b.relation?1:0);
 // v4 (R078): per-domain table sets and the (key, xmin) aggregate. Installed clients see one
 // changed version per domain after the upgrade and walk once.
 return deltaValueHash(['business-offline-v4',actor.issuer,actor.subject,actor.partnerId,domain,businessDate,rows]);
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
export async function readOfflineDatasetDelta(client,actor,domain,input){
 if(!offlineSourceTables[domain])throw Error('invalid_request');
 const request=readDeltaRequest(input),cursor=readDeltaCursor(request.cursor);
 const stamp=(await client.query(`SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "asOf",(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS "businessDate"`)).rows[0];
 // R078: a check that starts a domain may ask for every domain's version (`versions`); the client
 // then skips the requests of the unchanged domains. Computed once, from the same snapshot.
 const versions=!cursor&&request.versions?await readOfflineSourceVersions(client,actor,stamp.businessDate):null,peers=versions?{versions}:{};
 const sourceVersion=cursor?.sourceVersion??versions?.[domain]??await readOfflineSourceVersion(client,actor,domain,stamp.businessDate);
 if(!cursor&&!request.need.length&&request.sourceVersion===sourceVersion)return {schemaVersion:3,domain,...stamp,sourceVersion,unchanged:true,patches:[],values:{},complete:true,nextCursor:null,progress:{completed:1,total:1},...peers};
 // Stable page counts make manifest/content replay deterministic while avoiding a separate HTTP
 // round trip for every small page; the byte and value budgets still apply between pages.
 const chunk=await readOfflineDatasetChunk(client,actor,domain,cursor?.inner??null,{deterministicPages:offlineDeterministicPages[domain]});
 if(chunk.complete&&cursor&&await readOfflineSourceVersion(client,actor,domain,stamp.businessDate)!==sourceVersion){
  // R064: a client declaring acceptChanged keeps the walked ("torn") bundle with
  // no source version and rechecks; older clients still receive 409 and re-walk.
  if(!request.acceptChanged)throw Error('dataset_changed');
  return encodeDeltaChunk({...chunk,sourceVersion:null,changed:true,nextCursor:null},request.need);
 }
 return encodeDeltaChunk({...chunk,sourceVersion,...peers,nextCursor:chunk.nextCursor?wrapDeltaCursor(chunk.nextCursor,sourceVersion):null},request.need);
}
