import test from 'node:test';import assert from 'node:assert/strict';
import {log,logRecord} from '../../services/lib/log.mjs';
// ALL-STD-04: one JSON log line shape {…fields, severity, event} for the server entry points.
test('log writes one JSON line with severity and event; completion records keep their fields',()=>{
 const lines=[];log('INFO','worker_started',{requestId:'r-1',role:'jobs'},line=>lines.push(line));
 assert.deepEqual(JSON.parse(lines[0]),{requestId:'r-1',role:'jobs',severity:'INFO',event:'worker_started'});
 logRecord({event:'command_request',requestId:'r-2',status:503,code:'command_unavailable'},line=>lines.push(line));
 assert.deepEqual(JSON.parse(lines[1]),{event:'command_request',requestId:'r-2',status:503,code:'command_unavailable',severity:'WARNING'});
 logRecord({event:'read_request',status:200},line=>lines.push(line));assert.equal(JSON.parse(lines[2]).severity,'INFO');
 assert.doesNotThrow(()=>log('INFO','x',{},()=>{throw Error('sink down')}));
});
