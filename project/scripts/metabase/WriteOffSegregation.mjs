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

// R116 PROD (3 November 2026): live dashboard 3 tab 16 does not have the three-card row above. Since 28 October its scalar
// row is four cards of width 6 on one grid row: 168 Operating income, 169 Operating expenses, 170 Net profit and 171 Average
// daily net profit. The write-off question joins that row as a fifth card, so the equation reads left to right on one line
// and no other placement moves: Income 5, Expenses 5, Principal write-offs 5, Net profit 5, Average daily net profit 4
// (cols 0, 5, 10, 15, 20). The cards keep their ids, titles, filters and parameter mappings; only col and width change.
export const LIVE_ROW_CARDS=Object.freeze([168,169,170,171]);
const LIVE_ROW=[[168,0,6],[169,6,6],[170,12,6],[171,18,6]];
export const writeOffRow=writeoffs=>[[168,'Income',0,5],[169,'Expenses',5,5],[writeoffs,'Principal write-offs',10,5],[170,'Net profit',15,5],[171,'Average daily net profit',20,4]];
const rowOf=(dashcards,tab,ids)=>dashcards.filter(c=>c.dashboard_tab_id===tab&&ids.includes(c.card_id)).sort((a,b)=>a.col-b.col||a.card_id-b.card_id);
const oneLine=(cards,dashcards,tab,ids)=>{
 if(new Set(cards.map(c=>c.row)).size!==1||new Set(cards.map(c=>c.size_y)).size!==1)return null;
 const {row,size_y:height}=cards[0];
 // No other card of the tab may share those grid rows (the row is the whole width of the 24-column grid).
 if(dashcards.some(c=>c.dashboard_tab_id===tab&&!ids.includes(c.card_id)&&c.row<row+height&&c.row+c.size_y>row))return null;
 return {row,height};
};
/** The live pre-R116 scalar row of tab 16, {row, height}; anything but 168, 169, 170, 171 at width 6 on one line throws. */
export function liveIncomeRow(dashcards,tab=16){
 const cards=rowOf(dashcards,tab,LIVE_ROW_CARDS),line=cards.length===4&&JSON.stringify(cards.map(c=>[c.card_id,c.col,c.size_x]))===JSON.stringify(LIVE_ROW)?oneLine(cards,dashcards,tab,LIVE_ROW_CARDS):null;
 if(!line)throw Error('Tab 16 scalar row differs from the live four-card layout (168, 169, 170, 171 at width 6 on one grid row)');
 return line;
}
/** The R116 scalar row of tab 16, {row, height}; anything but writeOffRow(writeoffs) on one line (and, when given, on the
 *  row and height of the live baseline) throws. */
export function writeOffIncomeRow(dashcards,writeoffs,tab=16,expected=null){
 const ids=[...LIVE_ROW_CARDS,writeoffs],cards=rowOf(dashcards,tab,ids);
 const want=JSON.stringify(writeOffRow(writeoffs).map(([id,,col,width])=>[id,col,width]));
 const line=cards.length===5&&JSON.stringify(cards.map(c=>[c.card_id,c.col,c.size_x]))===want?oneLine(cards,dashcards,tab,ids):null;
 if(!line||(expected&&(line.row!==expected.row||line.height!==expected.height)))
  throw Error('Tab 16 scalar row differs from the R116 five-card layout (Income, Expenses, Principal write-offs, Net profit, Average daily net profit)');
 return line;
}
