// R116 (V128): principal write-offs apart from profit on the Income Statement page (dashboard 3, tab 16). The definitions
// shared by StatementCleanup.mjs (the canonical page builder) and Refine-WriteOffSegregation.mjs (the targeted change).
// Snippet 2 (live-income-period.sql) gains "Principal Write-offs", signed like "Operating Expenses", so
// Operating Income + Operating Expenses + Principal Write-offs = Net Profit, and Operating Income is gross profit.
export const BRIDGE_BEFORE_SQL=`SELECT v.movement AS "Movement",v.amount AS "Amount" FROM statement s CROSS JOIN LATERAL (VALUES (1,'Income',s."Operating Income"),(2,'Expenses',s."Operating Expenses")) v(step,movement,amount) ORDER BY v.step`;
export const BRIDGE_BEFORE_NAME='Income less expenses · Total = Net profit';
export const WRITE_OFF_BRIDGE_SQL=`SELECT v.movement AS "Movement",v.amount AS "Amount" FROM statement s CROSS JOIN LATERAL (VALUES (1,'Income',s."Operating Income"),(2,'Expenses',s."Operating Expenses"),(3,'Write-offs',s."Principal Write-offs")) v(step,movement,amount) ORDER BY v.step`;
export const WRITE_OFF_BRIDGE_NAME='Income less expenses and write-offs · Total = Net profit';
export const WRITE_OFF_BRIDGE_TITLE='Income − expenses − write-offs = net profit';
export const WRITE_OFF_SCALAR_SQL='SELECT "Principal Write-offs" FROM statement';
export const WRITE_OFF_SCALAR_NAME='Principal write-offs';
export const NOTE_BEFORE='Net profit = interest − expenses. Amounts in baht.';
export const WRITE_OFF_NOTE='Net profit = gross interest − expenses − principal write-offs. Amounts in baht.';
export const SNIPPET_PREFIX='WITH statement AS ({{snippet: Income statement period}}) ';
// The template tags of the tab 16 statement questions, as StatementCleanup.mjs builds them (statement_period on the
// reporting calendar Date field 82, model 186 Income Events, snippet 2).
const dateTag=n=>({id:'r016-'+n,name:n,'display-name':'Statement period',type:'dimension',dimension:['field',82,null],'widget-type':'date/all-options',alias:'d."Date"'});
const cardTag=id=>({id:'r016-model-'+id,name:'#'+id,'display-name':'Model '+id,type:'card','card-id':id});
const snippetTag=(name,id)=>({id:'r016-snippet-'+id,name:'snippet: '+name,'display-name':name,type:'snippet','snippet-id':id,'snippet-name':name});
export const incomeTags={statement_period:dateTag('statement_period'),'#186':cardTag(186),'snippet: Income statement period':snippetTag('Income statement period',2)};
export const incomeQuery=select=>({database:2,type:'native',native:{query:SNIPPET_PREFIX+select,'template-tags':incomeTags}});
/** The scalar row of tab 16 (row 3, height 3): [card, title, col, width]; four of width 6 once the write-off card exists. */
export const incomeRow=writeoffs=>writeoffs
 ?[[168,'Income',0,6],[169,'Expenses',6,6],[writeoffs,'Principal write-offs',12,6],[170,'Net profit',18,6]]
 :[[168,'Income',0,8],[169,'Expenses',8,8],[170,'Net profit',16,8]];
