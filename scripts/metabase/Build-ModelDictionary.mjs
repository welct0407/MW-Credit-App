import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile,Workbook} from '@oai/artifact-tool';
import {read,root,privateDir} from './ReportingApi.mjs';
const original=await SpreadsheetFile.importXlsx(await FileBlob.load(root+'/Documents/AppSheet_Data_Dictionary.xlsx'));
await fs.writeFile(privateDir+'/dictionary-before.png',new Uint8Array(await (await original.render({sheetName:'Prod Relationships',range:'A1:F8',scale:1,format:'png'})).arrayBuffer()));
const wb=Workbook.create(),sheet=wb.worksheets.add('Metabase Models');
const models=read('models.json'),rows=[['Model','ID','Field / grain','Type / source','Semantic / relationship','Definition']];
for(const key of ['borrowers','loans','repayments','borrower-performance','portfolio','daily']){
 const m=models[key];rows.push([m.name,m.id,'Model grain','scripts/metabase/models/'+key+'.sql','PROD reporting / collection 8',m.grain]);
 for(const c of m.columns)rows.push([m.name,m.id,c.name,c.base_type+(c.id?' / field '+c.id:''),[c.semantic_type,c.fk_target_field_id?'FK to field '+c.fk_target_field_id:''].filter(Boolean).join('; '),c.description.split('. '+m.grain)[0]]);
}
sheet.getRange(`A1:F${rows.length}`).values=rows;
sheet.showGridLines=false;sheet.freezePanes.freezeRows(1);
sheet.getRange(`A1:F${rows.length}`).format={font:{name:'Arial',size:10},rowHeight:32,verticalAlignment:'center',wrapText:true};
sheet.getRange('A1:F1').format={fill:'#17365D',font:{name:'Arial',size:10,color:'#FFFFFF',bold:true},rowHeight:28};
for(const [c,w] of Object.entries({A:23,B:7,C:33,D:45,E:40,F:90}))sheet.getRange(`${c}1:${c}${rows.length}`).format.columnWidth=w;
let row=2;for(const key of ['borrowers','loans','repayments','borrower-performance','portfolio','daily']){sheet.getRange(`A${row}:F${row}`).format.fill='#E8EFF5';sheet.getRange(`A${row}:F${row}`).format.rowHeight=65;row+=models[key].columns.length+1;}
await fs.writeFile(privateDir+'/dictionary-models.png',new Uint8Array(await (await wb.render({sheetName:'Metabase Models',range:'A1:F12',scale:1,format:'png'})).arrayBuffer()));
await (await SpreadsheetFile.exportXlsx(wb)).save(privateDir+'/metabase-dictionary-sheet.xlsx');
console.log(`Authored ${rows.length-1} model/field dictionary rows. Existing workbook sheets will be preserved byte-for-byte.`);
