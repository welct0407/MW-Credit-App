import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionMessage } from '../src/message_template.mjs';

test('current and overdue amounts remain distinct', () => {
  const message = collectionMessage({borrowerName:'Lisa',todayRemaining:600,overdueRemaining:300}, 'PAYMENT BLOCK');
  assert.match(message, /วันนี้มียอดที่ต้องส่ง 600 บาท/);
  assert.match(message, /ยอดค้างเดิมอีก 300 บาท/);
  assert.match(message, /16\.00 น\./);
  assert.match(message, /PAYMENT BLOCK/);
  assert.doesNotMatch(message, /ทดสอบระบบ/);
});
