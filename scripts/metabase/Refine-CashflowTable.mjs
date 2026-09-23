import './LegacyStatementGuard.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,privateDir,write} from './ReportingApi.mjs';
import {specs,transactionFormatting} from './CashflowPage.mjs';

await assertSource();
const backup=JSON.parse(fs.readFileSync(privateDir+'/cashflow-table-refinement/card-196.json','utf8'));
const card=await api('GET','card/196');
assert.equal(card.id,backup.id);
assert.equal(card.updated_at,backup.updated_at,'Cashflow table changed since scoped backup');
assert.deepEqual(card.dataset_query,backup.dataset_query);
assert.deepEqual(card.visualization_settings,backup.visualization_settings);

const spec=specs.find(s=>s.key==='transactions');
const query=`WITH statement AS ({{snippet: Cashflow statement period}}) ${spec.sql.replace('{{model:cashflow-transactions}}','{{#190}}')}`;
const dataset_query={...card.dataset_query,stages:card.dataset_query.stages.map((stage,i)=>i===0?{...stage,native:query}:stage)};
const column_settings=Object.fromEntries(['Money In','Money Out','Balance After'].map(name=>[JSON.stringify(['name',name]),{
 number_style:'decimal',currency:'THB',currency_style:'symbol',decimals:0,number_separators:'.,',compact:false
}]));
const visualization_settings={'table.pivot':false,column_settings,'table.column_formatting':transactionFormatting};
await api('PUT','card/196',{dataset_query,visualization_settings});
const saved=await api('GET','card/196');
assert.equal(saved.dataset_query.stages[0].native,query);
assert.deepEqual(saved.visualization_settings,visualization_settings);
const result=await api('POST','card/196/query',{});
assert.equal(result.status,'completed');
assert.deepEqual(result.data.cols.map(c=>c.name),['Date / Time','Transaction Type','Counterparty','Money In','Money Out','Balance After','From Account','To Account','Notes']);
assert.ok(result.data.rows.every(row=>/^\d{2}\/\d{2} \d{2}:\d{2}$/.test(row[0])));
write('cashflow-table-refinement.json',{
 card_id:196,source_database:2,date_format:'DD/MM HH:MM',statement_date_with_posting_time:true,
 visible_columns:result.data.cols.map(c=>c.name),
 money_in_color:transactionFormatting[0].color,money_out_color:transactionFormatting[1].color,
 color_rule:'positive cells only; zero stays neutral',
 row_count:result.data.rows.length,private_rollback:'cashflow-table-refinement/card-196.json',
 saved_query_and_visualization_settings_verified:true
});
console.log('Cashflow table query and formatting saved and read back.');
