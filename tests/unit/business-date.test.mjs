import test from 'node:test';import assert from 'node:assert/strict';
import {BUSINESS_TZ,BUSINESS_DAY_SQL,BUSINESS_TODAY_QUERY,businessToday,businessDateTime} from '../../services/lib/business-date.mjs';
// ALL-STD-01: one Bangkok business calendar for services.
test('business date follows Bangkok across the UTC midnight boundary',()=>{
 assert.equal(BUSINESS_TZ,'Asia/Bangkok');
 assert.equal(businessToday(new Date('2026-10-15T16:59:59Z')),'2026-10-15');
 assert.equal(businessToday(new Date('2026-10-15T17:00:00Z')),'2026-10-16');
 assert.equal(businessToday(new Date('2026-10-16T00:30:00Z')),'2026-10-16');
 assert.equal(businessToday(new Date('2026-12-31T17:00:00Z')),'2027-01-01');
 assert.equal(businessDateTime(new Date('2026-10-15T17:00:00Z')),'2026-10-16 00:00:00');
});
test('SQL business day text is byte-identical to the previous inline statements',()=>{
 assert.equal(BUSINESS_DAY_SQL,"(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date");
 assert.equal(BUSINESS_TODAY_QUERY,"SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day");
});
