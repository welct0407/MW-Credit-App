import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {provisionR053Roles,prepareR053Maintenance,configureR053Capture} from '../../scripts/database/r053-operator-tooling.mjs';
const trap={query(){throw Error('Unexpected SQL access');}};
test('R053 operator refuses PROD before querying and requires explicit capture boolean',async()=>{
 for(const fn of [provisionR053Roles,prepareR053Maintenance])await assert.rejects(fn(trap,{database:'loan_manager_prod',creators:['postgres'],executionMode:'cloudsql-dev'}),/DEV operator/);
 await assert.rejects(configureR053Capture(trap,{database:'loan_manager_dev'},{}),/capture boolean/);
});
test('R053 CLI rejects target overrides and ambient routes before credentials',()=>{
 for(const args of [['roles','--environment','production'],['roles','--apply','--apply'],['restore']]){const r=spawnSync(process.execPath,['scripts/database/r053-operator-cli.mjs',...args],{encoding:'utf8'});assert.notEqual(r.status,0);assert.doesNotMatch(r.stderr,/ENOENT|password|authentication failed/);}
 const r=spawnSync(process.execPath,['scripts/database/r053-operator-cli.mjs','roles'],{encoding:'utf8',env:{...process.env,PGHOSTADDR:'127.0.0.9'}});assert.notEqual(r.status,0);assert.match(r.stderr,/Ambient SQL route refused/);
});
