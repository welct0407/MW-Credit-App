import test from 'node:test';import assert from 'node:assert/strict';import {readdir,readFile} from 'node:fs/promises';import {join} from 'node:path';
// APP-SEC-03 / ALL-STD-02: the project id and owner sign-in are named once, in services/lib/identity.mjs.
async function files(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())out.push(...await files(p));else if(/\.m?js$/.test(e.name))out.push(p);}return out;}
test('services name the project and owner only through lib/identity.mjs',async()=>{
 const hits=[];
 for(const file of await files('services')){if(file===join('services','lib','identity.mjs'))continue;const text=await readFile(file,'utf8');for(const literal of ['clever-oasis-508610-n7','welct0407@'])if(text.includes(literal))hits.push(file+': '+literal);}
 assert.deepEqual(hits,[]);
});
