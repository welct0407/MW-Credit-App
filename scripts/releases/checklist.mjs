// Copy the one master checklist; generation never executes or approves a release.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export const repository=fileURLToPath(new URL('../../',import.meta.url));
export const masterPath=path.join(repository,'scripts/releases/templates/promotion-checklist.md');
const inside=(parent,file)=>{const rel=path.relative(parent,file);return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);};
export async function createChecklist(release,output,affected=[]){
 if(!/^R\d{3,}$/.test(release))throw Error('Use a reserved Rnnn; this tool does not reserve a release.');
 const target=path.resolve(output),outputs=path.join(repository,'outputs');
 if(!inside(outputs,target)||!target.endsWith('.md'))throw Error('Output must be a new .md file under outputs/.');
 const unique=new Set();
 for(const doc of affected){
  if(!doc.startsWith('Documents/')||doc.includes('\\')||doc.split('/').includes('..')||doc.startsWith('Documents/archive/')||doc==='Documents/Promotion_Documentation_Checklist.md')throw Error('Use an affected active/reference Documents path, not archive or retired register: '+doc);
  if(unique.has(doc))throw Error('Duplicate affected document: '+doc); unique.add(doc);
  if(!(await fs.stat(path.join(repository,doc))).isFile())throw Error('Not a document file: '+doc);
 }
 let body=(await fs.readFile(masterPath,'utf8')).replaceAll('{{RELEASE}}',release);
 body=body.replace(/\]\(([^)]+)\)/g,(m,url)=>{
  if(/^[a-z][a-z0-9+.-]*:|^#/i.test(url))return m;
  const [p,fragment]=url.split('#'),resolved=path.resolve(path.dirname(masterPath),decodeURIComponent(p));
  return ']('+path.relative(path.dirname(target),resolved).replaceAll('\\','/').replaceAll(' ','%20')+(fragment?'#'+fragment:'')+')';
 });
 const core=new Set(['Documents/Release_Tracker.md','Documents/Environment_Inventory.md','Documents/Development_Changes.md']);
 const additional=[...unique].filter(d=>!core.has(d));
 if(additional.length){
  const rows=additional.map(d=>`| [${path.basename(d)}](${path.relative(path.dirname(target),path.join(repository,d)).replaceAll('\\','/').replaceAll(' ','%20')}) | Pending | |`).join('\n');
  body=body.replace(/\n\n## Close/,'\n'+rows+'\n\n## Close');
  body=body.replace('Documentation impact: Pending — list affected paths or None with a scope-based reason; add their closure rows below.','Documentation impact: '+additional.join(', ')+'. Confirm no other document is affected from release scope.');
 }
 await fs.mkdir(path.dirname(target),{recursive:true});
 const actualParent=await fs.realpath(path.dirname(target)),actualOutputs=await fs.realpath(outputs);
 if(actualParent!==actualOutputs&&!inside(actualOutputs,actualParent))throw Error('Output parent resolves outside outputs/.');
 await fs.writeFile(target,body,{flag:'wx'});return target;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [release,output,...docs]=process.argv.slice(2);
 createChecklist(release,output,docs).then(p=>console.log(p)).catch(e=>{console.error(e.message);process.exitCode=1;});
}
