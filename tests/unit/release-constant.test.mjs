import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// R072 About shows the code's release constant. PROD is built from the frozen commit, so release.ts names the
// tracker's sole Open release, or the release just before it while that one is Frozen (being promoted, not Released).
function trackedRelease(tracker){
 const open=tracker.match(/^\|\s*New product work\s*\|\s*\*\*(R\d{3}) — Open\*\*\s*\|[ \t]*\r?$/m)?.[1];
 const section=(heading)=>tracker.split(/^## /m).find(part=>part.startsWith(heading+'\n')||part.startsWith(heading+'\r\n'))??'';
 const frozen=[...section('Releases requiring action').matchAll(/^\|\s*(R\d{3})\s*\|\s*Frozen\b/gm)].map(match=>match[1]);
 const released=new Set([...section('Released releases').matchAll(/^\|\s*(R\d{3})\s*\|/gm)].map(match=>match[1]));
 const predecessor=open&&'R'+String(Number(open.slice(1))-1).padStart(3,'0');
 return {open,allowed:[open,...(predecessor&&frozen.includes(predecessor)&&!released.has(predecessor)?[predecessor]:[])].filter(Boolean)};
}
test('release.ts names the Open release, or its Frozen predecessor while that is promoted',()=>{
 const source=readFileSync(new URL('../../apps/pwa/src/release.ts',import.meta.url),'utf8'),tracker=readFileSync(new URL('../../project/Documents/Release_Tracker.md',import.meta.url),'utf8');
 const code=source.match(/export const releaseNumber='(R\d{3})';/)?.[1],{open,allowed}=trackedRelease(tracker);
 assert.ok(code,'release.ts exports releaseNumber');assert.ok(open,'tracker has one Open release row');assert.ok(allowed.includes(code),`release.ts ${code} is neither the Open release nor its Frozen predecessor (${allowed.join(', ')})`);
});
test('the rule accepts only the Open release and a Frozen, unreleased predecessor',()=>{
 const tracker=(open,requiring,released)=>`# Release tracker\n\n## Current development release\n\n| Item | Current value |\n| --- | --- |\n| New product work | **${open} — Open** |\n\n## Releases requiring action\n\n| Release | Status | Remaining action / owning record |\n| --- | --- | --- |\n${requiring.map(([r,s])=>`| ${r} | ${s} | x |`).join('\n')}\n\n## Released releases\n\n| Release | Scope | Released | Record | Tag |\n| --- | --- | --- | --- | --- |\n${released.map(r=>`| ${r} | x | x | x | \`${r}\` |`).join('\n')}\n`;
 assert.deepEqual(trackedRelease(tracker('R073',[['R072','Frozen 18 October 2026 (Bangkok); PROD Hosting promotion in progress'],['R056','Frozen; V91 deployed']],['R071'])).allowed,['R073','R072']);
 // After R072 is Released (row moved), only R073 remains valid.
 assert.deepEqual(trackedRelease(tracker('R073',[['R056','Frozen; V91 deployed']],['R072','R071'])).allowed,['R073']);
 // An older Frozen release, a non-Frozen predecessor or one already listed as Released is not accepted.
 assert.deepEqual(trackedRelease(tracker('R073',[['R072','Owner-accepted; follow-up']],['R071'])).allowed,['R073']);
 assert.deepEqual(trackedRelease(tracker('R073',[['R072','Frozen 18 October 2026']],['R072'])).allowed,['R073']);
 assert.deepEqual(trackedRelease(tracker('R057',[['R056','Frozen; V91 deployed']],[])).allowed,['R057','R056']);
 assert.equal(trackedRelease('# Release tracker\n').open,undefined);
});
