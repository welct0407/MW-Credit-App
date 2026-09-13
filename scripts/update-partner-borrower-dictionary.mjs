import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

// Documentation only. This script never connects to AppSheet or contains borrower data.
const mode = process.argv[2] || 'inspect';
const input = 'Documents/AppSheet_Data_Dictionary.xlsx';
const outputDir = 'outputs/partner-borrower-setup-20260913';
await fs.mkdir(outputDir, {recursive:true});
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(input));
if (mode === 'inspect') {
  console.log((await wb.inspect({kind:'sheet',include:'id,name',maxChars:2200})).ndjson);
  for (const [name,range] of [['Tables','A4:G6'],['Columns','A370:H376']]) {
    const image = await wb.render({sheetName:name,range,scale:1,format:'png'});
    await fs.writeFile(`${outputDir}/before-${name}.png`,new Uint8Array(await image.arrayBuffer()));
  }
} else if (mode === 'edit') {
  const version='3.000050';
  const cols=wb.worksheets.getItem('Columns');
  const existing=cols.getRange('A5:H398').values;
  const newFields=[
    ['Partners',18,'Instagram Username','Physical / Text','OLTP; OLAP pending','Shown, editable, optional, searchable','Partner Instagram handle. App position 6. No separate partner list.','Stored; no formula, default, key or label. Verification binding belongs to later agent implementation.'],
    ['Partners',19,'Language Preference','Physical / Text','OLTP; OLAP pending','Shown, editable, optional, searchable','Language for partner notices, replies and email. App position 7.','Stored; blank initial value. Preferences not inferred or populated. Borrower drafts retain approved Thai.'],
    ['Partners',20,'IG Integration Enabled','Physical / Yes/No','OLTP; OLAP pending','Shown, editable, optional, searchable','Master opt-in for partner Instagram and email fallback. App position 8.','Initial value FALSE; no app formula. Existing partners unchecked. Only TRUE permits future agent communication.'],
    ['Borrowers',82,'City','Physical / Text','OLTP; OLAP pending','Shown, editable, optional, searchable','Borrower city from the owner location sheet. App position 15.','Stored; blank initial value; display name: "เมือง / City". Source blanks preserved.'],
    ['Borrowers',83,'Working Location','Physical / Text','OLTP; OLAP pending','Shown, editable, optional, searchable','Workplace/locality from the owner location sheet. App position 16.','Stored; blank initial value; display name: "สถานที่ทำงาน / Working Location". Uncertainty preserved.'],
  ];
  if(existing.some(r=>newFields.some(n=>r[0]===n[0]&&r[2]===n[2])))throw Error('Already updated; do not append twice');
  // Preserve the pre-existing final inventory row outside the old table by including it in the expansion.
  const tail=cols.getRange('A393:H393').values[0];
  cols.getRange('A393:H393').clear({applyTo:'contents'});
  cols.tables.items[0].rows.add(null,[tail,...newFields]);
  cols.getRange('A394:H398').format.wrapText=true;
  cols.getRange('A394:H398').format.rowHeight=42;
  cols.getRange('G374').values=[['Existing borrower opt-in; also required alongside Collection dashboard eligibility for the proposed partner daily briefing. Existing flag values unchanged.']];
  cols.getRange('G9').values=[['OLTP Text confirmed during location setup; earlier OLAP LongText inventory retained pending reconciliation.']];
  cols.getRange('D9').values=[['Physical / Text (OLTP); LongText (OLAP prior)']];
  cols.getRange('A2').values=[['13 September 2026: five stored partner/location fields added in OLTP '+version+'. No messaging activation. Earlier unrelated inventory retains dated verification scope.']];
  const tables=wb.worksheets.getItem('Tables');
  tables.getRange('D5:E5').values=[[16,29]];
  tables.getRange('G5').values=[['OLTP: 45 columns, including source ordinal/key; City and Working Location added. OLAP loading of new fields pending; prior OLAP VCs retained.']];
  tables.getRange('D12').values=[[8]];
  tables.getRange('G12').values=[['Partner identity, email, language and integration opt-in; OLTP 8 stored columns including ordinal/key. New OLAP field loading pending.']];
  tables.getRange('A2').values=[['13 September 2026: OLTP Borrowers 16 physical +29 VCs; Partners 8 physical +0 VCs. Counts include source ordinal. Other tables and OLAP counts retain prior verification scope.']];
  const slices=JSON.parse(await fs.readFile(`${outputDir}/slice-columns.json`,'utf8'));
  const sc=wb.worksheets.getItem('Slice Columns');
  const scValues=sc.getRange('A5:D440').values;
  const added=[];
  for(const [slice,fields] of Object.entries(slices)) {
    for(const [idx,field] of fields.entries()) {
      const found=scValues.findIndex(r=>r[0]==='OLTP'&&r[1]===slice&&r[3]===field);
      if(found>=0)sc.getRange(`C${found+5}`).values=[[idx+1]];
      else added.push(['OLTP',slice,idx+1,field]);
    }
  }
  sc.tables.items[0].rows.add(null,added);
  const ss=wb.worksheets.getItem('Slices');
  for(const [row,name] of [[5,'Todays Collection Board'],[6,'Visible Borrowers'],[19,'Collection Setup Review']]) {
    ss.getRange(`F${row}`).values=[[slices[name].length]];
    ss.getRange(`H${row}`).values=[['OLTP '+version+'; location columns included after regeneration. Existing row filter and update mode retained.']];
  }
  ss.getRange('G5').values=[['Existing daily collection population. Future agent additionally requires due/overdue and AI Collection Enabled; dashboard filter unchanged.']];
  ss.getRange('G6').values=[['Primary borrower list; City and Working Location exposed in existing form/detail views.']];
  const av=wb.worksheets.getItem('App Variances');
  av.tables.items[0].rows.add(null,newFields.map(r=>['Column',r[0],r[2],'Yes — '+version,'Pending reconciliation','Stored in shared database; OLTP configured. OLAP app not regenerated by this task.']));
  av.getRange('F227').values=[['Enabled borrowers with setup issues; 45 columns at OLTP '+version+'; update only.']];
  const readme=wb.worksheets.getItem('README');
  readme.getRange('B5').values=[['OLTP '+version+'; 13 September 2026. Partner controls, borrower locations and affected slice memberships verified. New OLAP field loading remains pending. Earlier unrelated inventory retains dated scope.']];
  readme.getRange('B6').values=[['Setup rollback OLTP 3.000045; final '+version+'. App restore does not restore database schema/data. Private cell before-image retained outside Git. No OLAP configuration changed.']];
  wb.recalculate();
  const err=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!',options:{useRegex:true,maxResults:20},summary:'Formula error check'});
  console.log(err.ndjson);
  for(const [name,range] of [['Columns','A394:H398'],['Tables','A4:G5']]) {
    const img=await wb.render({sheetName:name,range,scale:1,format:'png'});
    await fs.writeFile(`${outputDir}/after-${name}.png`,new Uint8Array(await img.arrayBuffer()));
  }
  await (await SpreadsheetFile.exportXlsx(wb)).save(`${outputDir}/AppSheet_Data_Dictionary.xlsx`);
  console.log(JSON.stringify({newFields:5,addedSliceMemberships:added.length,version,output:`${outputDir}/AppSheet_Data_Dictionary.xlsx`}));
} else {
  throw new Error('Use inspect or edit');
}
