import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LOOKALIKES,compare,display,hintKey,joined,learn,lines,payerKey,readable,script,validPayerLines} from '../../services/receipts/payer-name.mjs';
// R095: one vector file for this module and integration-agent payer_name.py (parity). Synthetic names only.
const cases=JSON.parse(readFileSync(new URL('../fixtures/payer-name-cases.json',import.meta.url),'utf8'));

test('display keeps the printed name and refuses over 200 bytes',()=>{
 for(const c of cases.display)assert.equal(display(c.input),c.expected,JSON.stringify(c.input));
});

test('payer key, script and readability follow the shared vectors',()=>{
 for(const c of cases.keys){
  const key=payerKey(c.input);
  assert.equal(key,c.key,c.input);assert.equal(script(key),c.script,c.input);assert.equal(readable(c.input),c.readable,c.input);
 }
});

test('compare follows the shared vectors in both directions',()=>{
 for(const c of cases.compare){
  assert.equal(compare(c.stored,c.slip),c.result,JSON.stringify(c));
  assert.equal(compare(c.slip,c.stored),c.result,'symmetric '+JSON.stringify(c));
 }
});

test('lookalike table, learn and nickname hints follow the shared vectors',()=>{
 assert.deepEqual(LOOKALIKES.map(pair=>[...pair]),cases.lookalikes);
 for(const c of cases.learn)assert.deepEqual(learn(c.lines,c.slip),c.after,JSON.stringify(c));
 for(const c of cases.hints)assert.equal(hintKey(c.text),c.key,c.text);
 assert.deepEqual(lines(' นาย สมชาย ใจดี \n\n  น.ส. สมฤดี   เ\n'),['นาย สมชาย ใจดี','น.ส. สมฤดี เ']);assert.equal(joined(['a b','c d']),'a b\nc d');
});

test('command payerLines: null, or {before,after} with after 1 to 5 display-form lines, at most 1000 bytes, differing from before',()=>{
 for(const good of [null,{before:null,after:'นาย สมชาย ใจดี'},{before:'นาย สมชาย ใจดี',after:'นาย สมชาย ใจดี\nน.ส. สมฤดี เ'},{before:' odd\u0007 stored ',after:'MR. SOMCHAI J***'}])assert.equal(validPayerLines(good),true,JSON.stringify(good));
 for(const bad of [undefined,'x',{after:'x y z'},{before:null},{before:null,after:''},{before:null,after:' padded'},{before:'a',after:'a'},{before:null,after:'a\n\nb'},{before:null,after:Array(6).fill('ก กกก').join('\n')},{before:null,after:'A'.repeat(201)},{before:null,after:'e\u0301mile'},{before:null,after:'a\u0007b'},{before:7,after:'abc'},{before:null,after:'abc',extra:1}])assert.equal(validPayerLines(bad),false,JSON.stringify(bad));
});
