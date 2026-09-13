import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

// Documentation checkpoint only; no AppSheet connection or operational data.
const out = 'outputs/borrower-cleanup-20260913';
await fs.mkdir(out, { recursive: true });
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load('Documents/AppSheet_Data_Dictionary.xlsx'));
const columns = wb.worksheets.getItem('Columns');
const targets = new Set(['Borrower Name', 'Description', 'Communication Name', 'City', 'AI Collection Enabled']);
const rows = columns.getRange('A5:H410').values;
const selected = rows.map((values, i) => ({ row: i + 5, values })).filter(x => x.values[0] === 'Borrowers' && targets.has(x.values[2]));
if (selected.length !== 5) throw Error('Expected five unique borrower inventory rows');
console.log(JSON.stringify(selected));
if (process.argv[2] === 'final') {
  const evidence = JSON.parse(await fs.readFile(`${out}/final-schema.json`, 'utf8'));
  const removed = new Set(evidence.removed);
  const retiredTables = new Set(['Collection Bank Accounts', 'Collection Settings']);
  const note = 'Removed 13 September 2026; historical inventory only, not an active dependency.';
  const notes = {
    'Borrower Name': 'Internal Borrower Name retained; display Borrower Name - Thai in both apps.',
    'Description': 'Internal Description retained; display English Name in both apps. Existing formulas/API keys preserved.',
    'Communication Name': 'Required in both apps. OLTP editable; OLAP table remains read-only. Blank initial value.',
    'City': 'Required in both apps. Blank initial value; display เมือง / City. Existing values preserved.',
    'AI Collection Enabled': 'Initial TRUE in both apps for new rows only. Existing row values not edited by cleanup.'
  };
  for (const [i,r] of rows.entries()) {
    if (r[0]==='Borrowers' && notes[r[2]]) {
      columns.getRange(`H${i+5}`).values=[[notes[r[2]]]];
      if (['Communication Name','City'].includes(r[2])) columns.getRange(`F${i+5}`).values=[['Required; OLTP editable, OLAP table read-only']];
    }
    if (retiredTables.has(r[0]) || (r[0]==='Borrowers' && removed.has(r[2]))) {
      columns.getRange(`E${i+5}:H${i+5}`).values=[['Retired — neither app','Removed',note,'Historical definition retired; see cleanup change log for rollback.']];
    }
  }
  if (!rows.some(r=>r[0]==='Borrowers'&&r[2]==='Address')) columns.tables.items[0].rows.add(null,[['Borrowers',84,'Address','Physical / Text','OLTP + OLAP','Optional; OLTP editable, OLAP table read-only','Borrower address from owner location sheet; seven exact-name matches imported.','Blank initial; no formula. Included in both apps borrower views and affected slices.']]);
  columns.getRange('A399:H399').format.wrapText=true;
  columns.getRange('G370').values=[['Explicit communication name; required. Stored position 7 in both apps.']];
  columns.getRange('G397').values=[['Borrower city from owner location sheet. Stored position 10 in both apps.']];
  columns.getRange('G398').values=[['Workplace/locality from owner location sheet. Stored position 11 in both apps.']];
  columns.getRange('A399:H399').format.rowHeight=78;
  columns.getRange('A2').values=[['13 September 2026: borrower cleanup reconciled in OLTP 3.000064 and OLAP 1.100041. Retired rows are historical, not active schema.']];
  const tables=wb.worksheets.getItem('Tables');
  tables.getRange('D5:F5').values=[[12,26,65]];
  tables.getRange('G5').values=[['OLTP 38 =12 stored +26 VCs; OLAP 77 =12 stored +65 VCs. Address loaded; obsolete fields removed. OLAP read-only.']];
  for(const [i,r]of tables.getRange('A5:G25').values.entries()) if(retiredTables.has(r[0])) tables.getRange(`C${i+5}:G${i+5}`).values=[['Retired — neither app',0,0,0,note]];
  tables.getRange('A2').values=[['13 September 2026: Borrowers cleanup complete in both apps; stored counts include ordinal/key. Two collection tables retired.']];
  const slices=wb.worksheets.getItem('Slices');
  for(const [i,r]of slices.getRange('A5:H25').values.entries()) {
    if(r[1]==='Collection Setup Review') slices.getRange(`A${i+5}:H${i+5}`).values=[['Retired OLTP',r[1],'Borrowers','Not active','Removed',0,'Historical setup-review slice',note]];
    const s=evidence.apps[String(r[0]).toLowerCase()]?.slices.find(s=>s.name===r[1]);
    if(s){slices.getRange(`F${i+5}`).values=[[s.columns.length]];slices.getRange(`H${i+5}`).values=[['Cleanup reconciled. Address included; filters and permissions preserved.']];}
  }
  const sc=wb.worksheets.getItem('Slice Columns');
  const membership=sc.getRange('A5:D600').values;
  const added=[];
  for(const [app,data]of Object.entries(evidence.apps))for(const s of data.slices)for(const [i,n]of s.columns.entries()){
    const row=membership.findIndex(r=>r[0]===app.toUpperCase()&&r[1]===s.name&&r[3]===n);
    if(row>=0)sc.getRange(`C${row+5}`).values=[[i+1]];else added.push([app.toUpperCase(),s.name,i+1,n]);
  }
  for(const [i,r]of membership.entries()){
    const app=evidence.apps[String(r[0]).toLowerCase()];
    const s=app?.slices.find(s=>s.name===r[1]);
    if(!String(r[0]).startsWith('Retired ')&&(r[1]==='Collection Setup Review'||(s&&!s.columns.includes(r[3]))))sc.getRange(`A${i+5}`).values=[['Retired '+r[0]]];
  }
  if(added.length)sc.tables.items[0].rows.add(null,added);
  const variances=wb.worksheets.getItem('App Variances');
  for(const [i,r]of variances.getRange('A5:F260').values.entries()){
    if(retiredTables.has(r[1])||(r[1]==='Borrowers'&&removed.has(r[2]))||r[2]==='Collection Setup Review')variances.getRange(`D${i+5}:F${i+5}`).values=[['Removed','Removed / absent',note]];
    else if(r[1]==='Borrowers'&&notes[r[2]])variances.getRange(`F${i+5}`).values=[[notes[r[2]]]];
  }
  if(!variances.getRange('A5:F260').values.some(r=>r[1]==='Borrowers'&&r[2]==='Address'))variances.tables.items[0].rows.add(null,[['Column','Borrowers','Address','Yes — 3.000064','Yes — 1.100041','Text, optional; blank initial. Seven source addresses imported and reloaded.']]);
  const relationships=wb.worksheets.getItem('Relationships');
  const rels=relationships.getUsedRange().values;
  for(const [i,r]of rels.entries())if(i>=4&&!String(r[0]).startsWith('Retired')&&r.some(v=>typeof v==='string'&&/Receiving Bank Account|Collection Bank Accounts|Collection Settings/.test(v)))relationships.getRange(`A${i+1}`).values=[['Retired — '+r[0]]];
  wb.worksheets.getItem('README').getRange('B5').values=[['Borrower cleanup verified: OLTP 3.000064; OLAP 1.100041. New-GUI form/detail checks passed; owner acceptance pending. Retired inventory is explicitly labeled.']];
  wb.worksheets.getItem('README').getRange('B6').values=[['Cleanup rollback OLTP 3.000052 / OLAP 1.100033; native database copy Money BACKUP Borrower Cleanup 20260913. Restore schema/data separately and preserve intervening edits.']];
  wb.recalculate();
  console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!',options:{useRegex:true,maxResults:10}})).ndjson);
  const preview=await wb.render({sheetName:'Columns',range:'A397:H399',scale:1,format:'png'});
  await fs.writeFile(`${out}/dictionary-final.png`,new Uint8Array(await preview.arrayBuffer()));
  await (await SpreadsheetFile.exportXlsx(wb)).save(`${out}/AppSheet_Data_Dictionary.xlsx`);
} else if (process.argv[2] !== 'edit') {
  const preview = await wb.render({ sheetName: 'Columns', range: 'A7:H9', scale: 1, format: 'png' });
  await fs.writeFile(`${out}/dictionary-before.png`, new Uint8Array(await preview.arrayBuffer()));
} else {
  const notes = {
    'Borrower Name': 'Internal name preserved. OLTP display changed to Borrower Name - Thai. OLAP display reconciliation pending.',
    'Description': 'Internal Description preserved. OLTP display changed to English Name. OLAP and Partner Operations GUI label reconciliation pending.',
    'Communication Name': 'OLTP Require enabled. OLAP reconciliation pending. Blank initial value retained.',
    'City': 'OLTP Require enabled; display เมือง / City and blank initial retained. OLAP reconciliation pending.',
    'AI Collection Enabled': 'OLTP initial changed to TRUE for new rows. Existing row values untouched. OLAP reconciliation pending.'
  };
  for (const { row, values } of selected) {
    columns.getRange(`H${row}`).values = [[notes[values[2]] + ' Final readback/tests pending.']];
    columns.getRange(`H${row}`).format.wrapText = true;
    if (row < 10) columns.getRange(`A${row}:H${row}`).format.rowHeight = 42;
    if (['Communication Name', 'City'].includes(values[2])) columns.getRange(`F${row}`).values = [['OLTP required; OLAP prior optional, table read-only. Pending final reconciliation.']];
  }
  columns.getRange('A2').values = [['13 September 2026: borrower cleanup PARTIAL. Five OLTP settings saved; post-save readback and OLAP reconciliation pending. All other inventory retains prior verification scope.']];
  wb.worksheets.getItem('README').getRange('B5').values = [['Borrower cleanup PARTIAL: five OLTP settings saved; Chrome control failed before final version/readback. OLAP remains prior configuration. See authoritative borrower cleanup change log.']];
  wb.recalculate();
  console.log((await wb.inspect({kind:'match', searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!', options:{useRegex:true,maxResults:10}})).ndjson);
  const preview = await wb.render({sheetName:'Columns',range:'A7:H9',scale:1,format:'png'});
  await fs.writeFile(`${out}/dictionary-after.png`,new Uint8Array(await preview.arrayBuffer()));
  await (await SpreadsheetFile.exportXlsx(wb)).save(`${out}/AppSheet_Data_Dictionary.xlsx`);
}
