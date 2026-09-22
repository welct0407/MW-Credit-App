import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
import fs from 'node:fs/promises';
import {root,privateDir,read} from './ReportingApi.mjs';
try{
 const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(root+'/Documents/AppSheet_Data_Dictionary.xlsx'));
 const s=wb.worksheets.getItem('Metabase Models');
 const expected=Object.values(read('models.json')).reduce((n,m)=>n+1+m.columns.length,1);
 const models=read('models.json'),last=models['income-daily']?.name??'Collection Status Summary';
 if(s.getRange('A1').values[0][0]!=='Model'||s.getRange(`A${expected}`).values[0][0]!==last)throw Error('Dictionary readback failed');
 const image=await wb.render({sheetName:'Metabase Models',range:'A1:F12',scale:1,format:'png'});
 await fs.writeFile(privateDir+'/dictionary-final.png',new Uint8Array(await image.arrayBuffer()));
 if(models['income-daily']){const added=await wb.render({sheetName:'Metabase Models',range:'A200:F220',scale:1,format:'png'});await fs.writeFile(privateDir+'/dictionary-income.png',new Uint8Array(await added.arrayBuffer()));}
 console.log('Saved dictionary reimport, model coverage and render passed.');
}catch(error){console.error(String(error.message));process.exitCode=1;}
