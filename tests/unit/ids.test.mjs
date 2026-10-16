import test from 'node:test';import assert from 'node:assert/strict';
import {UUID_V4,UUID_V4_ANY_CASE,UUID_ANY,isUuidV4,isUuidAny} from '../../services/lib/ids.mjs';
// APP-ARCH-03: one identifier definition replaces the per-module regular expressions.
test('version-4 identifiers versus any database identifier',()=>{
 const v4='abcdef11-1111-4111-a111-111111111111',v1='abcdef11-1111-1111-8111-111111111111';
 assert.ok(isUuidV4(v4));assert.equal(isUuidV4(v1),false);assert.equal(isUuidV4(v4.toUpperCase()),false);assert.ok(UUID_V4_ANY_CASE.test(v4.toUpperCase()));
 assert.ok(isUuidAny(v1));assert.ok(UUID_ANY.test(v4));assert.equal(isUuidAny(v1.toUpperCase()),false);
 for(const bad of [null,1,'',v4+'0',' '+v4,'11111111-1111-4111-c111-111111111111'])assert.equal(isUuidV4(bad),false,String(bad));
 assert.equal(UUID_V4.source.startsWith('^')&&UUID_V4.source.endsWith('$'),true);
});
