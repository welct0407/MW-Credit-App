import test from 'node:test';import assert from 'node:assert/strict';
import {backupAuthorityCommands,runBackupWithAuthority} from '../../scripts/database/backup-r053-authority.mjs';
const input={environment:'production',approvalReference:'reviewed',backupProof:'private-proof',sourceCommit:'a'.repeat(40),state:'private-state',node:'node',python:'python',pwsh:'pwsh'};
test('backup controller fixes PROD89 child and retained87 temporary authority without migration',()=>{
 const c=backupAuthorityCommands(input);assert(c.prepare.includes('prepare-agent'));assert(c.prepare.includes('87'));assert(c.backup.includes('89'));assert(c.restore.includes('restore'));
 assert(!JSON.stringify(c).match(/migrate|capture-enable|roles|bind-/));
 const dev=backupAuthorityCommands({...input,environment:'development'});assert(dev.backup.includes('scripts/database/Backup-DevActivation.ps1'));assert(!dev.prepare.includes('--baseline-version'));
 assert.throws(()=>backupAuthorityCommands({...input,environment:'other'}));
});
test('finally restores after success, backup failure and prepare failure with saved plan',async()=>{
 for(const fail of [null,'backup','prepare']){const calls=[],c={prepare:['prepare'],backup:['backup'],restore:['restore']};const run=runBackupWithAuthority(c,{stateExists:async()=>true,execute:async([name])=>{calls.push(name);if(name===fail)throw Error('synthetic failure');}});if(fail)await assert.rejects(run,/synthetic/);else await run;assert.deepEqual(calls,fail==='prepare'?['prepare','restore']:['prepare','backup','restore']);}
});
test('no state means no guessed restore; restore failure is never reported successful',async()=>{
 const c={prepare:['prepare'],backup:['backup'],restore:['restore']},calls=[];
 await assert.rejects(runBackupWithAuthority(c,{stateExists:()=>false,execute:async([name])=>{calls.push(name);throw Error('preflight');}}));assert.deepEqual(calls,['prepare']);
 await assert.rejects(runBackupWithAuthority(c,{stateExists:()=>true,execute:async([name])=>{if(name==='restore')throw Error('restore failed');}}),/restore failed/);
});
