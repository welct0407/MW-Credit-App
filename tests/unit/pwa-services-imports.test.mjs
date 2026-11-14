// R156 (Forge): the PWA build reaches a few modules under services/ (shared offline-dataset code, the synthetic read
// adapter). A change to one of them is a PWA change, so each must be named by the pwa component's paths
// (scripts/promotion/components.json, release versions) and by the CI e2e classifier (scripts/ci/stages.json and the grep
// in .github/workflows/ci.yml). This walks the import graph from apps/pwa/src (relative imports, type-only included),
// follows the services/ files' own relative imports, and checks every services/ file reached. Pure and fast: text only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {dirname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const posix=path=>relative(root,path).split(sep).join('/');
/** Every relative specifier of a module: static and dynamic imports, re-exports, `import type`. */
export function specifiers(text){
 const found=new Set();
 for(const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\1/g))found.add(match[2]);
 return [...found];
}
/** The file a relative specifier names, as TypeScript and Vite resolve it here; a .mjs with a .d.mts beside it brings both. */
function resolveModule(from,specifier){
 const base=resolve(dirname(from),specifier),files=[];
 for(const candidate of [base,base+'.ts',base+'.tsx',base+'.mjs',base+'.js',join(base,'index.ts'),join(base,'index.tsx')]){
  if(existsSync(candidate)&&statSync(candidate).isFile()){files.push(candidate);break}
 }
 if(!files.length&&base.endsWith('.js')&&existsSync(base.slice(0,-3)+'.ts'))files.push(base.slice(0,-3)+'.ts');
 const declaration=(files[0]??base).replace(/\.mjs$/,'.d.mts');
 if(declaration!==(files[0]??base)&&existsSync(declaration))files.push(declaration);
 return files;
}
function walk(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(join(directory,entry.name)):/\.(tsx?|mjs|js)$/.test(entry.name)?[join(directory,entry.name)]:[])}
/** services/ files reached from apps/pwa/src. */
export function reachedServices(){
 const seen=new Set(),queue=walk(join(root,'apps/pwa/src')),services=new Set();
 while(queue.length){
  const file=queue.pop();if(seen.has(file))continue;seen.add(file);
  const path=posix(file);if(path.startsWith('services/'))services.add(path);
  if(file.endsWith('.d.mts'))continue;
  for(const specifier of specifiers(readFileSync(file,'utf8')))for(const target of resolveModule(file,specifier)){
   const targetPath=posix(target);
   // Inside the repository only; node_modules are not relative imports.
   if(!targetPath.startsWith('..')&&(targetPath.startsWith('apps/pwa/')||targetPath.startsWith('services/')))queue.push(target);
  }
 }
 return [...services].sort();
}
/** components.json paths: a file, a directory (prefix) or a glob (* within a segment, ** across segments). */
const pathMatches=(pattern,path)=>pattern.includes('*')?new RegExp('^'+pattern.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*\*/g,'\u0000').replace(/\*/g,'[^/]*').replace(/\u0000/g,'.*')+'$').test(path):path===pattern||path.startsWith(pattern.replace(/\/$/,'')+'/');

test('every services/ module the PWA reaches is a pwa path, a CI e2e input and in the ci.yml e2e grep',()=>{
 const reached=reachedServices();
 assert.ok(reached.length>=2,'the walk reaches the PWA\'s services/ modules: '+reached.join(', '));
 assert.ok(reached.includes('services/lib/offline-dataset-digest.mjs'),'the shared dataset digest (dataset-patch.ts)');
 const components=JSON.parse(readFileSync(join(root,'scripts/promotion/components.json'),'utf8'));
 const pwa=components.components.find(component=>component.id==='pwa');assert.ok(pwa?.paths?.length,'the pwa component and its paths');
 const stages=JSON.parse(readFileSync(join(root,'scripts/ci/stages.json'),'utf8')),e2e=new RegExp(stages.ci.e2e.include);
 const workflow=readFileSync(join(root,'.github/workflows/ci.yml'),'utf8'),grep=[...workflow.matchAll(/grep -Eq '([^']+)' app\.txt; then e2e=true/g)].map(match=>match[1]);
 assert.equal(grep.length,1,'one e2e grep in ci.yml');const workflowPattern=new RegExp(grep[0]);
 const missing=reached.flatMap(path=>[
  ...(pwa.paths.some(pattern=>pathMatches(pattern,path))?[]:[path+' not in components.json pwa paths']),
  ...(e2e.test(path)?[]:[path+' not matched by stages.json ci.e2e.include']),
  ...(workflowPattern.test(path)?[]:[path+' not matched by the ci.yml e2e grep'])]);
 assert.deepEqual(missing,[]);
});

test('the walk reads every import form and follows services/ modules',()=>{
 assert.deepEqual(specifiers(`import a from './a';import type {B} from "../b.ts";export {c} from './c.mjs';const d=await import('./d');import './e.css';import x from 'react';`).sort(),['../b.ts','./a','./c.mjs','./d','./e.css']);
 // A type-only import of a services/ module and its declaration file are both reached.
 const reached=reachedServices();
 for(const path of reached)assert.match(path,/^services\/[\w/.-]+\.(mjs|d\.mts|ts)$/,path);
});
