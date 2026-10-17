import test from 'node:test';
import assert from 'node:assert/strict';
import {pausedSections} from '../../apps/pwa/src/paused-sections.ts';

// UX-HOLD-08: the paused banner names the sections whose refresh failed, in the app's language.
test('names the failed sections in order and skips unknown names',()=>{
 assert.equal(pausedSections('cash,records',false),'Cash, Borrowers and loans');
 assert.equal(pausedSections('collection,management,notifications',true),'ติดตามชำระ การจัดการ การแจ้งเตือน');
 assert.equal(pausedSections('receipts,unknown',false),'');
 assert.equal(pausedSections('',false),'');
});
