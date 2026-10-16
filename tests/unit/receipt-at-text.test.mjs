import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readCollectionReceipts} from '../../services/business/collection-receipts.mjs';
import {collectionQualitySql} from '../../services/api/collection-read-contract.mjs';
// APP-DATE-01: naive Bangkok timestamps must leave the server as text, never as a node-pg Date (UTC-shifted instant).
test('collection receipts select receiptAt as text',async()=>{
 let captured=null;
 const client={query:async(sql,params)=>{
  if(sql.includes('"receiptAt"')){captured={sql,params};return {rows:[]};}
  if(sql.includes('AS day'))return {rows:[{day:'2026-10-15',stamp:new Date().toISOString()}]};
  if(sql===collectionQualitySql)return {rows:[{invalid:false}]};
  if(sql.includes('count(*)'))return {rows:[{n:1}]};
  throw Error('Unexpected SQL');
 }};
 await readCollectionReceipts(client,'synthetic-borrower',{businessDate:'2026-10-15',chargeIds:['synthetic-charge']});
 assert.ok(captured,'receipt query issued');
 assert.match(captured.sql,/END\)::text AS "receiptAt"/);
});
test('offline dataset readers select every receiptAt as text',()=>{
 for(const file of ['offline-dataset-chunks.mjs']){ // offline-dataset.mjs (protocol 1) no longer reads rows.
  const src=readFileSync(new URL('../../services/business/'+file,import.meta.url),'utf8');
  const all=(src.match(/AS "receiptAt"/g)||[]).length,text=(src.match(/::text AS "receiptAt"/g)||[]).length;
  assert.ok(all>0,file+' selects receiptAt');
  assert.equal(text,all,file+': every receiptAt is cast to text');
 }
});
