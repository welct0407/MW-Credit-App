// R145: the committed release tracker keeps the Open row that scripts/build-live-dev.mjs openRelease() reads (the DEV
// build label and scripts/promotion/component-versions.mjs depend on it). The regex is not loosened: a malformed row fails.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openRelease} from '../../scripts/build-live-dev.mjs';

const tracker=readFileSync(new URL('../../project/Documents/Release_Tracker.md',import.meta.url),'utf8');

test('the committed release tracker names exactly one Open release Rnnn',()=>{
 assert.match(openRelease(tracker),/^R\d{3}$/);
 assert.equal((tracker.match(/^\|\s*New product work\s*\|/gm)??[]).length,1);
});

test('openRelease refuses a decorated or missing Open row',()=>{
 const row=value=>`| Item | Current value |\n| --- | --- |\n| New product work | ${value} |\n`;
 assert.equal(openRelease(row('**R145 — Open**')),'R145');
 for(const value of ['**R145 — Open** (no scope yet)','**R145 - Open**','R145 — Open','**R45 — Open**','**R145 — Released**'])
  assert.throws(()=>openRelease(row(value)),/no Open release row/,value);
});
