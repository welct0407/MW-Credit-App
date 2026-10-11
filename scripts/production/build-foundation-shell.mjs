import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { validateShellConfig } from '../../apps/production-foundation/config.mjs';
const appRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const html=script=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>MW Credit Production Foundation</title><style>body{font:18px system-ui;max-width:42rem;margin:3rem auto;padding:1rem}button{font:inherit;padding:.7rem;margin:.3rem}</style></head><body><main>${script?'':'<h1>MW Credit — Maintenance</h1><p>Production business access is unavailable.</p>'}</main>${script?'<script type="module" src="./shell.js"></script>':''}</body></html>`;
export async function buildFoundationShell({config:input,outDir}) {
  const config=validateShellConfig(input), directory=resolve(outDir);
  await mkdir(directory,{recursive:true});
  if ((await readdir(directory)).length) throw Error('Shell output directory must be empty');
  if(config.phase!=='maintenance') {
    const {build}=await import('vite');
    await build({configFile:false,root:appRoot,logLevel:'silent',plugins:[{name:'production-shell-config',resolveId:id=>id==='virtual:production-shell-config'?'\0production-shell-config':null,load:id=>id==='\0production-shell-config'?'export default '+JSON.stringify(config):null}],build:{outDir:directory,emptyOutDir:false,lib:{entry:resolve(appRoot,'apps/production-foundation/main.mjs'),formats:['es'],fileName:()=> 'shell.js'},rollupOptions:{output:{inlineDynamicImports:true}}}});
  }
  const configBytes=JSON.stringify(config,null,2)+'\n';
  const marker={schemaVersion:1,kind:'production-foundation-shell',phase:config.phase,cachePolicy:'no-store',worker:null,entry:'index.html',configSha256:createHash('sha256').update(configBytes).digest('hex')};
  await writeFile(resolve(directory,'index.html'),html(config.phase!=='maintenance'));
  await writeFile(resolve(directory,'public-config.json'),configBytes);
  await writeFile(resolve(directory,'foundation-shell.json'),JSON.stringify(marker,null,2)+'\n');
  await writeFile(resolve(directory,'firebase.json'),JSON.stringify({hosting:{public:'.',ignore:['firebase.json'],headers:[{source:'**',headers:[{key:'Cache-Control',value:'no-store'}]}]}},null,2)+'\n');
  return marker;
}
export const buildMaintenanceShell=({outDir})=>buildFoundationShell({outDir,config:{schemaVersion:1,environment:'prod',authIsolation:'none',phase:'maintenance',origin:'https://lm.mw-credit.com',endpoints:null}});
