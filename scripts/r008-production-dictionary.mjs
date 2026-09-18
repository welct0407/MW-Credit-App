import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';

const file='Documents/AppSheet_Data_Dictionary.xlsx';
const out='outputs/r008-20260918/production';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const baseline=Object.fromEntries(wb.worksheets.items.map(s=>[s.name,{values:s.getUsedRange().values,formulas:s.getUsedRange().formulas}]));
const delta=JSON.parse(await fs.readFile('outputs/r008-20260918/r4/release-delta.json','utf8'));
assert.equal(delta.items.length,199);

const safe=v=>typeof v==='string'&&v.startsWith('=')?`Expression text: ${v}`:v??'';
const exact=v=>v?.state==='absent'?'Absent':JSON.stringify(v?.value??null);

const sheetName='R008 Production';
const prior=wb.worksheets.items.find(s=>s.name===sheetName);
if(prior) prior.delete();
const sh=wb.worksheets.add(sheetName);
const rows=[['Target ID','App','Object','Property','Operation','Exact PROD target','Evidence']];
for(const item of delta.items)rows.push([item.id,item.app,item.object,item.property,item.operation,safe(exact(item.prod)),'R008 revision 4; PROD saved readback 2026-09-19']);
const range=sh.getRangeByIndexes(0,0,rows.length,rows[0].length);
range.setNumberFormat('@'); range.values=rows; range.format.font={name:'Arial',size:10}; range.format.wrapText=true; range.format.verticalAlignment='top'; range.format.rowHeight=58;
sh.getRange('A1:G1').format={fill:'#17365D',font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},rowHeight:32,wrapText:true};
for(const [col,width] of [['A',15],['B',10],['C',48],['D',28],['E',12],['F',95],['G',44]])sh.getRange(`${col}1:${col}${rows.length}`).format.columnWidth=width;
sh.showGridLines=false; sh.freezePanes.freezeRows(1); sh.tabColor='#17365D';

const guide=wb.worksheets.getItem('Guide');
const guideRows=baseline.Guide.values.map(r=>[...r]);
const versionRow=guideRows.findIndex(r=>r[0]==='Production versions');
assert(versionRow>=0); guideRows[versionRow]=['Production versions','SQL V24; OLTP 3.000216; OLAP 1.100162','R008 promoted and independently verified 19 Sep 2026. Rollback SQL V22 / OLTP 3.000173 / OLAP 1.100131 plus restore-tested private backup.'];
let r008Guide=guideRows.findIndex(r=>r[0]==='R008 production model');
if(r008Guide<0){r008Guide=guideRows.length; guide.getRangeByIndexes(r008Guide,0,1,3).copyFrom(guide.getRangeByIndexes(r008Guide-1,0,1,3),'all');}
guideRows[r008Guide]=['R008 production model','R008 Production; exact 199 targets plus existing production inventory sheets','PROD V24 / OLTP 3.000216 / OLAP 1.100162. Three live accounts; openings uninitialized. Evidence: outputs/r008-20260918/production/REPORT.md.'];
guide.getRangeByIndexes(0,0,guideRows.length,3).values=guideRows;

const settings=wb.worksheets.getItem('App Settings');
const settingRows=baseline['App Settings'].values.map(r=>[...r]);
for(const [env,version] of [['production-oltp','3.000216'],['production-olap','1.100162']]){
 const i=settingRows.findIndex(r=>r[0]===env&&r[1]==='Version'&&r[2]==='Saved app version'); assert(i>=0);
 settingRows[i]=[env,'Version','Saved app version',version,'R008 production saved editor readback; No issues found; 2026-09-19'];
}
const settingWriteRows=settingRows.map(r=>r.map(v=>typeof v==='string'&&v.startsWith('=')?`'${v}`:v));
settings.getRangeByIndexes(0,0,settingWriteRows.length,5).values=settingWriteRows;

const diffs=wb.worksheets.getItem('Dev Differences');
const diffRows=baseline['Dev Differences'].values.map(r=>[...r]);
const closure=['R008 Released\n2026-09-19','Release closure','PROD target / evidence','PROD SQL V24 / OLTP 3.000216 / OLAP 1.100162 match the 199-target revision-4 package.','Released after owner approval. DEV history retained; synthetic data excluded; PROD openings uninitialized. See production/REPORT.md.'];
const closeRow=diffRows.length; diffs.getRangeByIndexes(closeRow,0,1,5).copyFrom(diffs.getRangeByIndexes(closeRow-1,0,1,5),'all'); diffs.getRangeByIndexes(closeRow,0,1,5).setNumberFormat('@'); diffs.getRangeByIndexes(closeRow,0,1,5).values=[closure]; diffs.getRangeByIndexes(closeRow,0,1,5).format.wrapText=true; diffs.getRangeByIndexes(closeRow,0,1,5).format.rowHeight=110;

wb.recalculate();
const errorScan=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:50}});
const errorMatches=errorScan.ndjson.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line)).filter(x=>x.kind==='match');
if(errorMatches.length)throw Error(`Workbook errors: ${errorScan.ndjson}`);
await fs.writeFile(`${out}/dictionary-error-scan.jsonl`,errorScan.ndjson);
for(const [name,rg] of [[sheetName,'A1:G6'],[sheetName,`A${rows.length-3}:G${rows.length}`],['Guide',`A${versionRow+1}:C${r008Guide+1}`],['Dev Differences',`A${closeRow+1}:E${closeRow+1}`]]){
 const png=await wb.render({sheetName:name,range:rg,scale:1,format:'png'}); await fs.writeFile(`${out}/dictionary-${name.replaceAll(' ','-')}-${rg.replaceAll(':','-')}.png`,new Uint8Array(await png.arrayBuffer()));
}
const output=`${out}/AppSheet_Data_Dictionary.xlsx`; await(await SpreadsheetFile.exportXlsx(wb)).save(output);
const reopened=await SpreadsheetFile.importXlsx(await FileBlob.load(output));
for(const [name,b] of Object.entries(baseline)){
 const a=reopened.worksheets.getItem(name).getUsedRange();
 if(name==='Guide'){assert.deepEqual(a.values,guideRows); continue;}
 if(name==='App Settings'){assert.deepEqual(a.values.map(r=>r.map(v=>typeof v==='string'?v.replace(/^'/,''):v)),settingRows); continue;}
 if(name==='Dev Differences'){assert.deepEqual(a.values.slice(0,b.values.length),b.values); assert.deepEqual(a.values.at(-1),closure); continue;}
 assert.deepEqual(a.values,b.values,`${name} values changed`); assert.deepEqual(a.formulas,b.formulas,`${name} formulas changed`);
}
assert.deepEqual(reopened.worksheets.getItem(sheetName).getUsedRange().values,rows);
await fs.writeFile(`${out}/dictionary-verification.json`,JSON.stringify({release:'R008',productionSheetRows:199,versions:{sql:'V24',oltp:'3.000216',olap:'1.100162'},existingSheetsPreservedExceptDocumentedGuideSettingsAndClosure:true,errorScanLines:errorMatches.length},null,2)+'\n');
await fs.copyFile(output,file);
console.log(JSON.stringify({productionTargets:199,guideRows:guideRows.length,closureRow:closeRow+1,errorScan:errorScan.ndjson.trim()||'clean'}));
