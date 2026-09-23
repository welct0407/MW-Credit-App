// Replace only the Artifact Tool-authored Metabase Models worksheet.
// Keep the thirteen AppSheet operational worksheet XML parts byte-identical.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import xml from 'xml-js';
import {root,privateDir,write} from './ReportingApi.mjs';

const target=path.join(root,'Documents/AppSheet_Data_Dictionary.xlsx');
const backup=path.join(privateDir,'cash-pool-line-before/AppSheet_Data_Dictionary.xlsx');
const donor=path.join(privateDir,'metabase-dictionary-sheet.xlsx');
assert.ok(fs.existsSync(backup)&&fs.existsSync(donor));
assert.deepEqual(fs.readFileSync(target),fs.readFileSync(backup),'Dictionary changed since scoped backup');
const base=await JSZip.loadAsync(fs.readFileSync(backup));
const authored=await JSZip.loadAsync(fs.readFileSync(donor));
const normalize=s=>s.replaceAll('<x:','<').replaceAll('</x:','</').replaceAll('xmlns:x=','xmlns=');
const parse=s=>xml.xml2js(s,{compact:true});
const stringify=o=>xml.js2xml(o,{compact:true,spaces:0});
const read=async(z,n)=>await z.file(n).async('string');
const sections=[['fonts','font'],['fills','fill'],['borders','border'],['cellStyleXfs','xf'],['cellXfs','xf']];
const arr=v=>v===undefined?[]:Array.isArray(v)?v:[v];
const styles=parse(await read(base,'xl/styles.xml'));
const newStyles=parse(normalize(await read(authored,'xl/styles.xml')));
const offsets={};
for(const [name,item] of sections){
 const old=styles.styleSheet[name],fresh=newStyles.styleSheet[name];
 const existing=arr(old[item]),incoming=structuredClone(arr(fresh[item]));
 offsets[name]=existing.length;
 if(name==='cellStyleXfs'||name==='cellXfs')for(const xf of incoming){
  for(const [attr,source] of [['fontId','fonts'],['fillId','fills'],['borderId','borders']])if(xf._attributes?.[attr]!==undefined)xf._attributes[attr]=String(Number(xf._attributes[attr])+offsets[source]);
  if(name==='cellXfs'&&xf._attributes?.xfId!==undefined)xf._attributes.xfId=String(Number(xf._attributes.xfId)+offsets.cellStyleXfs);
  assert.ok(Number(xf._attributes?.numFmtId??0)<164);
 }
 old[item]=[...existing,...incoming];old._attributes.count=String(old[item].length);
}
const strings=parse(normalize(await read(base,'xl/sharedStrings.xml')));
const newStrings=parse(normalize(await read(authored,'xl/sharedStrings.xml')));
const priorStrings=arr(strings.sst.si),addedStrings=arr(newStrings.sst.si);
assert.equal(priorStrings.length+addedStrings.length,0,'Unexpected shared strings; extend merge before writing');
const workbook=parse(await read(base,'xl/workbook.xml'));
const reporting=arr(workbook.workbook.sheets.sheet).find(s=>s._attributes.name==='Metabase Models');
assert.equal(reporting?._attributes.sheetId,'14');
const rels=parse(await read(base,'xl/_rels/workbook.xml.rels'));
assert.ok(arr(rels.Relationships.Relationship).some(r=>r._attributes.Id===reporting._attributes['r:id']&&r._attributes.Target==='worksheets/sheet14.xml'));
const sheet=parse(normalize(await read(authored,'xl/worksheets/sheet1.xml')));
const rows=arr(sheet.worksheet.sheetData.row);
for(const row of rows)for(const cell of arr(row.c)){
 const a=cell._attributes??{};
 if(a.s!==undefined)a.s=String(Number(a.s)+offsets.cellXfs);
 assert.notEqual(a.t,'s','Unexpected shared string reference');
}
assert.equal(rows.length,309);
const replaced=['xl/styles.xml','xl/worksheets/sheet14.xml'];
base.file(replaced[0],stringify(styles));base.file(replaced[1],stringify(sheet));
fs.writeFileSync(target,await base.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
const saved=await JSZip.loadAsync(fs.readFileSync(target));
for(let n=1;n<=13;n++)assert.deepEqual(await saved.file(`xl/worksheets/sheet${n}.xml`).async('nodebuffer'),await (await JSZip.loadAsync(fs.readFileSync(backup))).file(`xl/worksheets/sheet${n}.xml`).async('nodebuffer'));
write('principal-cash-pool-dictionary-verification.json',{saved_at:new Date().toISOString(),sheet:'Metabase Models',rows:rows.length,fields:288,operational_sheets_preserved:13,replaced_parts:replaced});
console.log(JSON.stringify({rows:rows.length,operationalSheetsPreserved:13}));
