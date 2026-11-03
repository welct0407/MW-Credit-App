// R118 (V132): late charges on the Income Statement page (dashboard 3, tab 16). The definitions Refine-LateCharges.mjs uses.
// A late charge is income: V132 folds it into "Income" of reporting_income_events (so Operating Income, Net Profit and the
// waterfall already count it) and appends "Late Charges Received", the late part of that income. Snippet 2
// (live-income-period.sql) returns it last as "Late Charges Received", a memo figure that is not added to Net Profit again.
import {isDeepStrictEqual} from 'node:util';
import {LIVE_ROW_CARDS,WRITE_OFF_NOTE} from './WriteOffSegregation.mjs';
export {SNIPPET_PREFIX,incomeQuery} from './WriteOffSegregation.mjs';
export const LATE_COLUMN='Late Charges Received';
export const LATE_SCALAR_SQL=`SELECT "${LATE_COLUMN}" FROM statement`;
export const LATE_SCALAR_NAME='Late charges received';
export const NOTE_BEFORE=WRITE_OFF_NOTE;
export const LATE_NOTE='Net profit = gross interest and late charges − expenses − principal write-offs; late charges received is part of income. Amounts in baht.';
// The R116 row (Refine-WriteOffSegregation.mjs, applied with R116): Income 5, Expenses 5, Principal write-offs 5, Net profit 5,
// Average daily net profit 4 on one grid row. R118 adds the memo card last, so the equation still reads left to right, and
// every card takes width 4 (6 × 4 = 24 columns): cols 0, 4, 8, 12, 16, 20.
export const r116Row=writeoffs=>[[168,'Income',0,5],[169,'Expenses',5,5],[writeoffs,'Principal write-offs',10,5],[170,'Net profit',15,5],[171,'Average daily net profit',20,4]];
export const lateRow=(writeoffs,latecharges)=>[[168,'Income',0,4],[169,'Expenses',4,4],[writeoffs,'Principal write-offs',8,4],[170,'Net profit',12,4],[171,'Average daily net profit',16,4],[latecharges,'Late charges received',20,4]];
const rowOf=(dashcards,tab,ids)=>dashcards.filter(c=>c.dashboard_tab_id===tab&&ids.includes(c.card_id)).sort((a,b)=>a.col-b.col||a.card_id-b.card_id);
const oneLine=(cards,dashcards,tab,ids)=>{
 if(new Set(cards.map(c=>c.row)).size!==1||new Set(cards.map(c=>c.size_y)).size!==1)return null;
 const {row,size_y:height}=cards[0];
 // No other card of the tab may share those grid rows (the row is the whole width of the 24-column grid).
 if(dashcards.some(c=>c.dashboard_tab_id===tab&&!ids.includes(c.card_id)&&c.row<row+height&&c.row+c.size_y>row))return null;
 return {row,height};
};
const matches=(dashcards,tab,layout)=>{
 const ids=layout.map(([id])=>id),cards=rowOf(dashcards,tab,ids);
 return cards.length===ids.length&&JSON.stringify(cards.map(c=>[c.card_id,c.col,c.size_x]))===JSON.stringify(layout.map(([id,,col,width])=>[id,col,width]))?oneLine(cards,dashcards,tab,ids):null;
};
/** The live R116 scalar row of tab 16, {row, height}. Fails closed without the R116 write-off question id (state
 *  cards.writeoffs) and on anything but the R116 five-card row on one grid row. */
export function r116IncomeRow(dashcards,writeoffs,tab=16){
 if(!Number.isInteger(writeoffs)||writeoffs<1)throw Error('statement-cleanup-state.json has no cards.writeoffs: apply R116 (Refine-WriteOffSegregation.mjs) first');
 const line=matches(dashcards,tab,r116Row(writeoffs));
 if(!line)throw Error('Tab 16 scalar row differs from the R116 five-card layout (168, 169, write-offs, 170, 171 at 5/5/5/5/4 on one grid row)');
 return line;
}
/** The R118 scalar row of tab 16, {row, height}; anything but lateRow on one line (and, when given, on the row and height
 *  of the R116 baseline) throws. */
export function lateIncomeRow(dashcards,writeoffs,latecharges,tab=16,expected=null){
 const line=Number.isInteger(writeoffs)&&Number.isInteger(latecharges)?matches(dashcards,tab,lateRow(writeoffs,latecharges)):null;
 if(!line||(expected&&(line.row!==expected.row||line.height!==expected.height)))
  throw Error('Tab 16 scalar row differs from the R118 six-card layout (Income, Expenses, Principal write-offs, Net profit, Average daily net profit, Late charges received at width 4)');
 return line;
}
/** The five R116 row cards keep their placement (id, tab, row, height), parameter mappings and visualization settings
 *  exactly as in the baseline; only col and size_x may change. Throws naming the first card and field that differ. */
export function assertLateRowCardsKept(baselineDashcards,dashcards,writeoffs,tab=16){
 for(const id of [...LIVE_ROW_CARDS,writeoffs]){
  const find=list=>list.filter(c=>c.dashboard_tab_id===tab&&c.card_id===id);
  const [before,after]=[find(baselineDashcards),find(dashcards)];
  if(before.length!==1||after.length!==1)throw Error(`Tab 16 card ${id} is not placed exactly once`);
  for(const field of ['id','card_id','dashboard_tab_id','row','size_y','parameter_mappings','visualization_settings'])
   if(!isDeepStrictEqual(before[0][field]??null,after[0][field]??null))throw Error(`Tab 16 card ${id} changed ${field}; only col and size_x may change`);
 }
}
