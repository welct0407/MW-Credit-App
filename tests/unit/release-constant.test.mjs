import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// R072 About shows the code's release constant; it must name the tracker's sole Open release.
test('release.ts names the Open release in the release tracker',()=>{
 const source=readFileSync(new URL('../../apps/pwa/src/release.ts',import.meta.url),'utf8'),tracker=readFileSync(new URL('../../project/Documents/Release_Tracker.md',import.meta.url),'utf8');
 const code=source.match(/export const releaseNumber='(R\d{3})';/)?.[1],open=tracker.match(/^\|\s*New product work\s*\|\s*\*\*(R\d{3}) — Open\*\*\s*\|[ \t]*\r?$/m)?.[1];
 assert.ok(code,'release.ts exports releaseNumber');assert.ok(open,'tracker has one Open release row');assert.equal(code,open);
});
