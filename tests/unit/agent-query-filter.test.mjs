import test from 'node:test';
import assert from 'node:assert/strict';
import {compileAgentFilter} from '../../services/agent-conversations/query-filter.mjs';
const fields={name:{column:'Borrower Name',type:'text'},amount:{column:'Principal Amount',type:'numeric'},day:{column:'Loan Date',type:'date'},active:{column:'Active',type:'boolean'}};
test('typed filters parameterize values and use only catalogue identifiers',()=>{
 const attack="x' OR TRUE; DROP TABLE Loans;--";
 const result=compileAgentFilter({op:'and',args:[{op:'contains',field:'name',value:attack},{op:'gte',field:'amount',value:'100.50'},{op:'not',arg:{op:'isNull',field:'day'}},{op:'in',field:'active',value:[true,false]}]},fields);
 assert.deepEqual(result.params,[attack,'100.50',true,false]);
 assert.ok(!result.sql.includes(attack));assert.match(result.sql,/t\."Borrower Name"/);assert.match(result.sql,/\$2::numeric/);
 assert.deepEqual(compileAgentFilter(null,fields),{sql:'TRUE',params:[]});
});
test('unknown fields, malformed shapes/types, invalid dates and excessive ASTs deny',()=>{
 const bad=[{op:'eq',field:'password',value:'x'},{op:'eq',field:'name',value:'x',sql:'TRUE'},{op:'sql',field:'name',value:'TRUE'},
 {op:'contains',field:'amount',value:'1'},{op:'eq',field:'amount',value:'NaN'},{op:'eq',field:'amount',value:1},
 {op:'eq',field:'day',value:'2026-02-30'},{op:'eq',field:'active',value:'true'},{op:'eq',field:'name',value:null},
 {op:'and',args:[]},{op:'in',field:'name',value:Array(101).fill('a')},{op:'eq',field:'name',value:'x'.repeat(16385)}];
 let deep={op:'isNull',field:'day'};for(let i=0;i<8;i++)deep={op:'not',arg:deep};bad.push(deep);
 bad.push({op:'and',args:Array.from({length:20},()=>({op:'and',args:Array.from({length:6},()=>({op:'isNull',field:'day'}))}))});
 for(const filter of bad)assert.throws(()=>compileAgentFilter(filter,fields),/invalid_agent_query/);
});
