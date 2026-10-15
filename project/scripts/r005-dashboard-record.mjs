import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='outputs/r005-20260917';
const saved=JSON.parse(await fs.readFile(`${out}/dashboard-saved-definitions.json`,'utf8'));
const before=JSON.parse(await fs.readFile(`${out}/dev-oltp-reversal-final.json`,'utf8')).tables;
const dict=t=>Object.fromEntries(t.rows.filter(r=>r.length===2));
const defs=saved.definitions.map(dict);
const get=(key,name)=>{const a=defs.filter(d=>d[key]===name);assert.equal(a.length,1,`${key}: ${name}`);return a[0];};
const old=(key,name)=>dict(before.find(t=>t.rows.some(r=>r[0]===key&&r[1]===name))||{rows:[]});
const items=[];
function add(object,property,value,previous,prod=value,reason){
 const row={id:`R005-DASH-${String(items.length+1).padStart(3,'0')}`,app:'OLTP',object,property,operation:previous===undefined?'add':'change',before:previous===undefined?{state:'absent'}:{state:'value',value:previous},dev:{state:'value',value},prod:{state:'value',value:prod},devStatus:'Verified',prodStatus:'Pending',savedVersion:saved.version,evidence:'dashboard-saved-definitions.json',prodBefore:{state:'unknown'},prodObserved:{state:'unknown'}};
 if(reason)row.environmentReason=reason;
 items.push(row);
}
const table=get('Table name','Cash Holder Balances');
assert.equal(table['Are updates allowed?'],'READ_ONLY');assert.equal(table['Data Source'],'database-3');
const tableConfig={...table};delete tableConfig['Data Source'];
add('Cash Holder Balances','Configuration',tableConfig);
add('Cash Holder Balances','Data Source','database-3',undefined,'database-2','DEV and PROD connection bindings from Environment_Inventory.md; same public SQL view.');
for(const name of ['_RowNumber','Ref Cash Holder','Holder Name','Cash In','Cash Out','Current Balance','Business Cash Held','Reimbursement / Advance Due']){
 add(`Cash Holder Balances.${name}`,'Configuration',get('Column name',name));
}
assert.equal(get('Column name','Ref Cash Holder').Key,'Yes');
assert.equal(get('Column name','Holder Name').Label,'Yes');
add('Cash Holders.Related Cash Holder Balances','Configuration',get('Column name','Related Cash Holder Balances'));
const due=get('Column name','Todays Amount Due')['App formula'];
assert.equal(due,'=[Todays Amount Collected] + [Todays Amount Remaining]');
add('Borrowers.Todays Amount Due','App formula',due,old('Column name','Todays Amount Due')['App formula']);
const pool=get('Column name','Total Cash Pool');assert.equal(pool['App formula'],'=ANY(Loan Form Context[Contributed Capital])');
add('Statistics.Total Cash Pool','Configuration',pool);
const slice=get('Slice Name','Business Cash Held');assert.equal(slice['Row filter condition'],'=[Business Cash Held] <> 0');assert.equal(slice['Update mode'],'READ_ONLY');
add('Slices.Business Cash Held','Configuration',slice);
for(const name of ['Business Cash Held','Cash Holder Balances_Detail','Cash Holder Balances_Inline']){
 const view=get('View name',name);add(`Views.${name}`,'Configuration',{...view,'View configuration':JSON.parse(view['View configuration']),'For this data':name==='Business Cash Held'?'Business Cash Held':'Cash Holder Balances'});
}
for(const [name,property] of [['Dashboard','ViewEntries'],['KPIs','ColumnOrder']]){
 const final=JSON.parse(get('View name',name)['View configuration']);
 const previous=JSON.parse(old('View name',name)['View configuration']);
 add(`Views.${name}`,`View configuration.${property}`,final[property],previous[property]);
 assert.deepEqual({...final,[property]:null},{...previous,[property]:null},`Unexpected ${name} options changed`);
}
const rule=get('Rule name','Statistics - Total Cash Pool - Orange');assert.equal(rule['Format these columns and actions'],'Total Cash Pool');assert.equal(JSON.parse(rule['Like this']).textColor,'#FF8C00');
add('Format rules.Statistics - Total Cash Pool - Orange','Configuration',{...rule,'Like this':JSON.parse(rule['Like this']),'If this condition is true':null});
assert.deepEqual(get('View name','Cash Holders_Detail'),old('View name','Cash Holders_Detail'),'Existing holder detail options changed');
const delta={schemaVersion:1,release:'R005',revision:3,scope:'Dashboard/Collection refinement. Additive to retained original and Delete reversal R005 checklists.',apps:{OLTP:{dev:saved.appId,prod:'93844270-6aa5-420b-a960-bcdf08abd357'}},continuation:{versions:'DEV SQL V21; OLTP 1.000125; OLAP 1.000123 unchanged',done:'Five requested refinements implemented and focused current-GUI checks passed; opening entries are DEV fixtures only.',next:'Resolve unavailable deployment-check rerun before full R005 readiness; owner review/acceptance and explicit PROD authorization remain pending.',decisions:'No production edits authorized. Old whole-app/intermediate capture gates superseded by current AGENTS.md.',evidence:'DASHBOARD_REPORT.md; dashboard-saved-definitions.json; dashboard-final-diagnostics.json'},items,editDispositions:[{change:'Imported Cash In key/label',disposition:'Replaced before final save by stable Ref Cash Holder key and Holder Name label.'},{change:'New format rule initially had no target; warning reported',disposition:'Native selection corrected; final Total Cash Pool target saved and orange rendered; final editor No issues found.'},{change:'Interim rule targeted Open Loan Business Insights action',disposition:'Superseded before testing by Total Cash Pool only; saved artifact verifies final target.'},{change:'Initial free-text slice input did not persist',disposition:'Re-entered through Expression Assistant and saved; zero balance excluded in current GUI.'}],reconciliation:{unmappedRecordedEdits:0,generatedDependencies:['Cash Holders.Related Cash Holder Balances','Cash Holder Balances_Detail','Cash Holder Balances_Inline'],unchangedConsumer:'Cash Holders_Detail options match starting evidence; automatic columns expose generated relationship.',note:'Targeted changed-object comparison only; no untouched configuration completeness claim.'}};
await fs.writeFile(`${out}/dashboard-delta.json`,JSON.stringify(delta,null,2));
const inventory=[];
const inv=(object,property,value)=>inventory.push({object,property,value});
inv('OLTP / Cash Holder Balances','Availability and ownership','Existing V20 SQL view added READ_ONLY on database-3. One row per holder. OLAP Cash Holder Summary still consumes the same view. Cash Ledger entry remains OLAP only.');
for(const name of ['Ref Cash Holder','Holder Name','Cash In','Cash Out','Current Balance','Business Cash Held','Reimbursement / Advance Due']){
 const c=get('Column name',name);const q=JSON.parse(c['Type Qualifier']);
 inv(`OLTP / Cash Holder Balances / ${name}`,'Column definition',`Type ${c.Type}; Key ${c.Key}; Label ${c.Label}; Hidden ${c.Hidden}; Read-Only ${c['Read-Only']}. ${c.Type==='Ref'?'Ref Cash Holders.Row ID; IsPartOf false.':c.Type==='Price'?`Currency ${q.CurrencySymbol}; DecimalDigits ${q.DecimalDigits}; thousands separator ${q.ShowThousandsSeparator}.`:''} Exact remaining properties in dashboard-saved-definitions.json.`);
}
inv('OLTP / Cash Holders / Related Cash Holder Balances','Generated virtual column','List Ref Cash Holder Balances.Ref Cash Holder; REF_ROWS("Cash Holder Balances", "Ref Cash Holder"); read-only, visible, not key/label. Generated inline/detail views are read-only.');
inv('OLTP / Borrowers / Todays Amount Due','App formula',due);
inv('OLTP / Statistics / Total Cash Pool','Virtual column','Price, ฿, zero decimals, read-only, visible. ANY(Loan Form Context[Contributed Capital]). One-row SQL limit lookup; no ledger aggregation.');
inv('OLTP / Business Cash Held','Slice','Source Cash Holder Balances; [Business Cash Held] <> 0; READ_ONLY; all eight imported columns; **auto** actions. Exact membership in dashboard-delta.json.');
await fs.writeFile(`${out}/dashboard-model-inventory.json`,JSON.stringify(inventory,null,2));
console.log(JSON.stringify({deltaItems:items.length,modelRows:inventory.length,savedVersion:saved.version,assertions:'passed'}));
