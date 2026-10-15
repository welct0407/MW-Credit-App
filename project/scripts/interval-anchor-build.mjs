import fs from 'node:fs/promises';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/interval-anchor-20260915';
const out='outputs/interval-anchor-20260915';
await fs.mkdir(out,{recursive:true});
const source={};
for(const app of ['oltp','olap'])source[app]=(JSON.parse(await fs.readFile(`${priv}/${app}-before.json`))).map(s=>Object.fromEntries(s.rows));
const summary=Object.fromEntries(Object.entries(source).map(([app,ss])=>[app,ss.filter(s=>s['Table name']&&s['Visible?']==='ALWAYS').map(s=>({table:s['Table name'],source:s['Data Source'],permissions:s['Are updates allowed?']}))]));
await fs.writeFile(out+'/consumers-before.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary));
const one=source.oltp.find(s=>s['Action name']=== "Generate Today's Charge");
const all=source.oltp.find(s=>s['Action name']=== "Generate All Today's Charges");
const anchor='IF(ISBLANK([Interest Schedule Anchor Date]), [Loan Date], [Interest Schedule Anchor Date])';
// Only replace the daily-interest branch. Fixed-date and installment clauses retain their text.
function replaceDaily(s){
 const from=s.indexOf('[Loan Type] = "ดอกเบี้ยรายวัน"');
 const end=s.indexOf('[Loan Type] = "กำหนดวันชำระ"',from);
 if(from<0||end<0)throw Error('Expected daily-interest branch missing');
 const branch=s.slice(from,end).replaceAll('[Loan Date]',anchor);
 return s.slice(0,from)+branch+s.slice(end);
}
const props=JSON.parse(all['With these properties']);
const expressions={
 column:'Interest Schedule Anchor Date',type:'Date',initialValue:'',
 showIf:'[Loan Type] = "ดอกเบี้ยรายวัน"',
 validIf:'OR(ISBLANK([_THIS]), AND(ISNOTBLANK([Loan Date]), [_THIS] >= [Loan Date]))',
 displayName:'"วันที่เริ่มรอบดอกเบี้ย / Interest Schedule Anchor Date"',
 description:'"เว้นว่างเพื่อใช้วันที่กู้ รอบถัดไป = วันที่เริ่มรอบ + ช่วงชำระ เช่น 14 ก.ย. + 3 วัน = 17 ก.ย. ไม่เปลี่ยนดอกเบี้ยสะสม / Blank uses Loan Date. Next scheduled charge = anchor + interval. Interest accrual is unchanged."',
 individualCondition:replaceDaily(one['Only if this condition is true']).replace(/^=/,''),
 bulkRows:replaceDaily(props.ReferencedRows).replace(/^=/,''),
 bulkCondition:replaceDaily(all['Only if this condition is true']).replace(/^=/,'')
};
expressions.scheduledFilter=expressions.individualCondition;
await fs.writeFile(out+'/expressions.json',JSON.stringify(expressions,null,2));
console.log('Prepared daily-interest-only expressions');
