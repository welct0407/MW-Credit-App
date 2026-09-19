import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
import {routes} from './r009-recipient-expressions.mjs';
const input='Documents/AppSheet_Data_Dictionary.xlsx',out='outputs/r009-20260919/dictionary';
await fs.mkdir(out,{recursive:true});
const w=await SpreadsheetFile.importXlsx(await FileBlob.load(input));
const norm=rows=>rows.map(r=>r.map(v=>v??null));
const before=w.worksheets.items.map(s=>({name:s.name,values:norm(s.getUsedRange().values),formulas:norm(s.getUsedRange().formulas)}));
const sheet=w.worksheets.getItem('Dev Differences'),start=sheet.getUsedRange().values.length+1;
assert(!JSON.stringify(sheet.getUsedRange().values).includes('R009 identity'), 'R009 rows already present');
const rows=[
 ['SQL DEV R009','Partners.Login Email','R009 identity schema','Absent in PROD V24','V25: nullable text; unique index on lower(btrim("Login Email")) when nonnull; nonblank CHECK. Initial backfill from existing Email, before DEV delivery override.'],
 ['OLTP DEV R009','Partners.Login Email','R009 identity column','Absent','Email; physical; key/label false; shown; no initial/app formula; nullable. Table READ_ONLY; sensitive data true.'],
 ['OLAP DEV R009','Partners.Login Email','R009 identity column','Absent','Email; physical; key/label false; shown; editable; no initial/app formula; nullable; sensitive data true. Existing Partner-management permissions retained.'],
 ['Both DEV R009','Partners.Email','Delivery meaning','Distinct existing delivery emails; creator exclusion compares delivery email','Both DEV Partners.Email values = welct0407@mw-credit.com. Login Email values remain distinct. Email type and existing schema name unchanged.'],
 ['Both DEV R009','Transaction actor','R009 identity resolution','Created By / Closed By emails retained','Resolve recorded actor via Login Email to Row ID; exclude Row ID before collecting Email. Blank/unmapped actor returns no recipients. Duplicate delivery addresses deduplicated.'],
 ...routes.map(r=>['OLTP DEV R009',r.task,'ToList (shared target after promotion)','See historical refresh/R009 recipient maps; PROD unchanged',r.expression]),
 ['Both DEV R009','Partners','Generated dependency','No Login Email column','Regeneration adds Compose Email (Login Email) system action; notification channels/events remain unchanged. Existing Partner table permissions and financial VCs retained.'],
 ['R009','Evidence','Saved versions','PROD OLTP 3.000228 / OLAP 1.100178 / SQL V24','DEV OLTP 1.000014 / OLAP 1.000015 / SQL V25; identity-routing.json and IDENTITY_TESTS.md. Pending promotion.']
];
for(let i=0;i<rows.length;i++)sheet.getRange(`A${start+i}:E${start+i}`).copyFrom(sheet.getRange(`A${start-1}:E${start-1}`),'all');
sheet.getRange(`A${start}:E${start+rows.length-1}`).values=rows;
sheet.getRange(`A${start}:E${start+rows.length-1}`).format.wrapText=true;
sheet.getRange(`A${start}:E${start+rows.length-1}`).format.rowHeight=90;
sheet.getRange(`A${start}:E${start+4}`).format.rowHeight=54;
sheet.getRange(`A${start}:E${start+rows.length-1}`).format.verticalAlignment='center';
w.recalculate();
const png=await w.render({sheetName:'Dev Differences',range:`A${start}:E${start+3}`,scale:1,format:'png'});
await fs.writeFile(`${out}/preview.png`,new Uint8Array(await png.arrayBuffer()));
const output=`${out}/AppSheet_Data_Dictionary.xlsx`;
await (await SpreadsheetFile.exportXlsx(w)).save(output);
const reopened=await SpreadsheetFile.importXlsx(await FileBlob.load(output));
for(const s of before){const actual=reopened.worksheets.getItem(s.name);assert.deepEqual(norm(actual.getUsedRange().values).slice(0,s.values.length),s.values,s.name+' original values changed');assert.deepEqual(norm(actual.getUsedRange().formulas).slice(0,s.formulas.length),s.formulas,s.name+' original formulas changed');}
assert.deepEqual(reopened.worksheets.getItem('Dev Differences').getRange(`A${start}:E${start+rows.length-1}`).values,rows);
await fs.writeFile(`${out}/verification.json`,JSON.stringify({appendedRange:`Dev Differences!A${start}:E${start+rows.length-1}`,originalSheetsValuesAndFormulasPreserved:true,rowsAdded:rows.length},null,2));
console.log(JSON.stringify({output,rowsAdded:rows.length,originalSheetsPreserved:true}));
