import {readOfflineDatasetChunk} from './offline-dataset-chunks.mjs';
import {deltaValueHash,encodeDeltaChunk,readDeltaCursor,readDeltaRequest,wrapDeltaCursor} from '../api/offline-dataset-delta.mjs';

// Source tables only: polling never evaluates the forecast/analytics providers.
// Include derived persisted inputs, receipts, direct CRUD and deletes, not merely
// the PWA command journal. No authentication/delivery last-seen tables belong here.
const financialTables=['Borrowers','Loans','Charges','Payments','Payment Allocations','Repayments','Business Expenses','Cash Accounts','Cash Holders','Cash Ledger','Cash Pool Contributions','Settlements','Partners','Cash Statement Context','Cash Account Daily Analytics','Daily Analytics','Statistics','r005_cash_cutover_sources','r008_cash_account_cutover'];
const collectionTables=['Borrowers','Loans','Charges','Payments','Payment Allocations','Repayments'];
const sourceTables={records:[...financialTables,'pwa_payment_commands'],collection:collectionTables,cash:financialTables,management:[...financialTables,'Loan Assessment SQL Lab']};
const sourceSql=tables=>tables.map(table=>`SELECT '${table}' AS relation,encode(sha256(convert_to(coalesce(string_agg(row_hash,'' ORDER BY row_hash),''),'UTF8')),'hex') AS fingerprint FROM (SELECT encode(sha256(convert_to(to_jsonb(s)::text||':'||s.xmin::text,'UTF8')),'hex') AS row_hash FROM public."${table}" s) hashes`).join(' UNION ALL ');
const queries=Object.fromEntries(Object.entries(sourceTables).map(([domain,tables])=>[domain,sourceSql(tables)]));
export async function readOfflineSourceVersion(client,actor,domain,businessDate){
 if(!queries[domain])throw Error('invalid_request');
 const rows=(await client.query(queries[domain])).rows.sort((a,b)=>a.relation<b.relation?-1:a.relation>b.relation?1:0);
 // xmin also detects an edit then revert while a traversal was in progress.
 return deltaValueHash(['business-offline-v3',actor.issuer,actor.subject,actor.partnerId,domain,businessDate,rows]);
}
export async function readOfflineDatasetDelta(client,actor,domain,input){
 const request=readDeltaRequest(input),cursor=readDeltaCursor(request.cursor);
 const stamp=(await client.query(`SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "asOf",(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS "businessDate"`)).rows[0];
 const sourceVersion=cursor?.sourceVersion??await readOfflineSourceVersion(client,actor,domain,stamp.businessDate);
 if(!cursor&&!request.need.length&&request.sourceVersion===sourceVersion)return {schemaVersion:3,domain,...stamp,sourceVersion,unchanged:true,patches:[],values:{},complete:true,nextCursor:null,progress:{completed:1,total:1}};
 // Stable page counts make manifest/content replay deterministic while avoiding
 // a separate HTTP round trip for every small record page. Costlier analytics
 // remain one page; the existing byte boundary still applies between pages.
 const chunk=await readOfflineDatasetChunk(client,actor,domain,cursor?.inner??null,{deterministicPages:{records:8,collection:2,cash:4,management:1}[domain]});
 if(chunk.complete&&cursor&&await readOfflineSourceVersion(client,actor,domain,stamp.businessDate)!==sourceVersion)throw Error('dataset_changed');
 return encodeDeltaChunk({...chunk,sourceVersion,nextCursor:chunk.nextCursor?wrapDeltaCursor(chunk.nextCursor,sourceVersion):null},request.need);
}
