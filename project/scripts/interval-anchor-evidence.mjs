import fs from 'node:fs/promises';
const privateRoot='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/interval-anchor-20260915';
export function parseAx(text){
 const result=[]; let section=null,row=null,cell=null,cellDepth=0;
 for(const line of text.split('\n')){
  const m=line.match(/^(\s*)\d+ (.*)$/); if(!m)continue;
  const depth=m[1].length,body=m[2];
  if(body.startsWith('heading ')){section=null;row=null;cell=null;}
  if(body==='table'){section={rows:[]};result.push(section);row=null;cell=null;}
  else if(section&&body==='row'){row=[];section.rows.push(row);cell=null;}
  else if(row&&body==='cell'){cell=[];row.push(cell);cellDepth=depth;}
  else if(cell&&depth>cellDepth&&body.startsWith('text '))cell.push(body.slice(5));
 }
 return result.map(s=>({rows:s.rows.map(r=>r.map(c=>c.join('\n')))})).filter(s=>s.rows.length);
}
if(process.argv[2]){
 const name=process.argv[2]; const tables=parseAx(await fs.readFile(`${privateRoot}/${name}-ax.txt`,'utf8'));
 await fs.writeFile(`${privateRoot}/${name}.json`,JSON.stringify(tables,null,2));
 const cols=tables.filter(s=>s.rows.some(r=>r[0]==='Column name'));
 const actions=tables.filter(s=>s.rows.some(r=>r[0]==='Action name'));
 console.log(JSON.stringify({name,tables:tables.length,columns:cols.length,actions:actions.length,version:tables.flatMap(s=>s.rows).find(r=>r[0]==='Version')?.[1]}));
}
