import test from 'node:test';
import assert from 'node:assert/strict';
const {borrowerCount,borrowerRange}=await import('../../apps/pwa/src/borrower-count.ts');

test('the Borrowers count line states the page range while the list is paged, in both languages',()=>{
 assert.equal(borrowerRange(1,100,false),'Borrowers 1–100');
 assert.equal(borrowerRange(2,100,false),'Borrowers 101–200');
 assert.equal(borrowerRange(3,7,false),'Borrowers 201–207');
 assert.equal(borrowerRange(2,50,true),'ผู้กู้ 101–150');
 assert.equal(borrowerCount(27,false),'27 borrowers');assert.equal(borrowerCount(1,false),'1 borrower');assert.equal(borrowerCount(27,true),'ผู้กู้ 27 ราย');
});
