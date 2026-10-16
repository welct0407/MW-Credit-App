import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import ts from'typescript';
const file=process.env.DISPLAY_DATE_SOURCE??new URL('../../apps/pwa/src/display-date.ts',import.meta.url);
const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;const{normalizeTimestamp,displayTimestamp}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
// APP-DATE-02: PostgreSQL timestamp text has up to six fractional digits; ECMAScript Date parsing only guarantees three.
test('normalizeTimestamp truncates fractional seconds to milliseconds before the Bangkok offset',()=>{
 assert.equal(typeof normalizeTimestamp,'function');
 assert.equal(normalizeTimestamp('2026-10-15 10:00:00.123456'),'2026-10-15T10:00:00.123+07:00');
 assert.equal(normalizeTimestamp('2026-10-15T10:00:00.9'),'2026-10-15T10:00:00.900+07:00');
 assert.equal(normalizeTimestamp('2026-10-15 10:00:00'),'2026-10-15T10:00:00+07:00');
 assert.equal(normalizeTimestamp('2026-10-15 10:00'),'2026-10-15T10:00+07:00');
 assert.equal(normalizeTimestamp('2026-10-15T03:00:00Z'),'2026-10-15T03:00:00Z');
 globalThis.document={documentElement:{lang:'en'}};
 assert.equal(displayTimestamp('2026-10-15 23:59:59.999999'),'15-Oct 23:59');
 delete globalThis.document;
});
