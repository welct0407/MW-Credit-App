import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
import fs from 'node:fs/promises';
import {root,privateDir} from './ReportingApi.mjs';
try{
 const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(root+'/Documents/AppSheet_Data_Dictionary.xlsx'));
 const s=wb.worksheets.getItem('Metabase Models');
 if(s.getRange('A1').values[0][0]!=='Model'||s.getRange('A75').values[0][0]!=='Daily Performance')throw Error('Dictionary readback failed');
 const image=await wb.render({sheetName:'Metabase Models',range:'A1:F12',scale:1,format:'png'});
 await fs.writeFile(privateDir+'/dictionary-final.png',new Uint8Array(await image.arrayBuffer()));
 console.log('Saved dictionary reimport, model coverage and render passed.');
}catch(error){console.error(String(error.message));process.exitCode=1;}
