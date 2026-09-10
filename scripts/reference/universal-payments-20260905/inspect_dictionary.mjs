import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const dir = 'C:/GitHub/AppSheet-Loan-Project/outputs/universal-payments-20260905';
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(dir + '/AppSheet_Data_Dictionary.before.xlsx'));
console.log((await wb.inspect({kind:'workbook,sheet,table',maxChars:8500,tableMaxRows:3,tableMaxCols:8})).ndjson);
for (const name of ['README','Tables','Columns','Relationships']) {
 console.log(JSON.stringify({sheet:name,values:wb.worksheets.getItem(name).getRange('A1:H8').values}));
}
const preview = await wb.render({sheetName:'Columns',range:'A1:H8',scale:1,format:'png'});
await fs.writeFile(dir + '/dictionary-before.png',new Uint8Array(await preview.arrayBuffer()));
