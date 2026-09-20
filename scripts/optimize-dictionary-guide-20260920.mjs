// One-time documentation cleanup. No model rows or live configuration change.
import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const file='Documents/AppSheet_Data_Dictionary.xlsx',out='outputs/documentation-optimization-20260920';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const before=Object.fromEntries(wb.worksheets.items.map(s=>[s.name,s.getUsedRange().values]));
if(before.Guide.some(r=>r[0]==='Evidence precedence'))throw Error('Guide already updated; do not replay.');
const preview=async(name,range)=>{const p=await wb.render({sheetName:'Guide',range,scale:1,format:'png'});await fs.writeFile(`${out}/${name}.png`,new Uint8Array(await p.arrayBuffer()));};
await preview('dictionary-guide-before','A1:C9');
const rows=[
 ['Reference','Scope','Verification / use'],
 ['Exact configuration','Production inventory, Column Rules, relationships, slices and DB sheets','Exact values and dated verification evidence. Model Overview explains behavior; Environment Inventory holds current versions and identities.'],
 ['Evidence precedence','Latest applicable verified property wins','Older baseline sheets and dated overlays are not a current whole-app recapture. Resolve conflicting evidence only for affected properties.'],
 ['Production supplements','R008 Production; closed R009 evidence','Retained because they contain unique exact properties, not merely release narrative. Consult only affected objects; no routine historical review.'],
 ['Open development','Dev Differences; App Settings','Keep open changes distinct from production. Development_Changes.md is the concise current backlog; completed rows remain dated evidence.'],
 ['R010 DEV overlay','Dev Differences rows 2790-2811','Payment form validation and bilingual messages. PROD remains R009; see outputs/r010-20260919/REPORT.md and its filled promotion checklist.'],
 ['Maintenance','Affected exact rows plus the release log','Update the overview only if its architecture, relationships, ownership or behavioral explanation changes. No forced prose edit for formula-only changes.'],
 ['Promotion closure','One filled Markdown promotion checklist','Three mandatory current-state records plus actually affected documents. Close only promoted DEV differences and preserve later work.'],
 ['History and recovery','Documents/archive/2026-09-20','Pre-cleanup workbook and original reconciliation workbook preserved byte-for-byte. Prior guide narratives are there; archives are outside routine SDLC.'],
 ['Limitations','Dated release tests and manifests','Do not treat old pending checks as current blockers or claim a fresh live audit. Account openings, delivery and runtime limits follow the latest applicable release evidence.']
];
const guide=wb.worksheets.getItem('Guide');
guide.getRange('A1:C25').values=Array.from({length:25},(_,i)=>rows[i]??[null,null,null]);
guide.getRange('A2:C10').format.wrapText=true;
guide.getRange('A2:C10').format.rowHeight=72;
wb.recalculate();
await preview('dictionary-guide-after','A1:C10');
const staged=`${out}/.tmp/dictionary.xlsx`;
await fs.mkdir(`${out}/.tmp`,{recursive:true});
await(await SpreadsheetFile.exportXlsx(wb)).save(staged);
const check=await SpreadsheetFile.importXlsx(await FileBlob.load(staged));
const norm=a=>a.map(r=>r.map(v=>v??''));
for(const sheet of check.worksheets.items){
 if(sheet.name==='Guide')continue;
 if(JSON.stringify(norm(before[sheet.name]))!==JSON.stringify(norm(sheet.getUsedRange().values)))throw Error('Unexpected model change: '+sheet.name);
}
if(JSON.stringify(check.worksheets.getItem('Guide').getRange('A1:C10').values)!==JSON.stringify(rows))throw Error('Guide readback mismatch');
await fs.copyFile(staged,file);
await fs.writeFile(`${out}/dictionary-verification.json`,JSON.stringify({guideRows:rows.length,unchangedSheets:Object.keys(before).filter(n=>n!=='Guide'),r010RowsPreserved:'2790-2811',noLiveAudit:true},null,2)+'\n');
console.log('Guide shortened; all other sheet values and R010 preserved.');
