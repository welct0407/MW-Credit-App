import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearchQuery, searchQueryHash } from '../../services/api/search-query.mjs';
import { encodeCursor, decodeCursor, createBorrowerReadStore } from '../../services/api/borrower-read-store.mjs';
import { encodeCollectionCursor, decodeCollectionCursor } from '../../services/api/collection-read-contract.mjs';
const old = value => Buffer.from(JSON.stringify(value)).toString('base64url');
test('search normalization preserves literal punctuation, Thai, case and Unicode code points', () => {
  assert.equal(normalizeSearchQuery('  สมชาย %_\\\'  '), 'สมชาย %_\\\'');
  assert.equal(normalizeSearchQuery('😀'.repeat(100)), '😀'.repeat(100));
  assert.notEqual(searchQueryHash('A'), searchQueryHash('a'));
  for (const value of [null, 4, [], '\tname', 'name\n', '\u007f', 'a'.repeat(101), ' '.repeat(513), '😀'.repeat(101)]) assert.throws(() => normalizeSearchQuery(value));
});
test('borrower cursor binds canonical query and accepts old cursor only unfiltered', () => {
  const row = { rank: 0, createdDate: '2026-10-08', id: 'b1' };
  const cursor = encodeCursor(row, ' Somchai ');
  assert.equal(decodeCursor(cursor, 'Somchai').v, 3);
  assert.throws(() => decodeCursor(cursor, 'somchai'));
  assert.throws(() => decodeCursor(cursor, ''));
  const legacy = old({ v: 2, ...row });
  assert.equal(decodeCursor(legacy).id, 'b1');
  assert.throws(() => decodeCursor(legacy, 'Somchai'));
});
test('collection root binds query without changing child cursor contract', () => {
  const row = { kind: 'collection', businessDate: '2026-10-08', rank: 1, id: 'b1' };
  const cursor = encodeCollectionCursor(row, '%_');
  assert.equal(decodeCollectionCursor(cursor, 'collection', undefined, '%_').v, 2);
  assert.throws(() => decodeCollectionCursor(cursor, 'collection', undefined, 'other'));
  const legacy = old({ v: 1, ...row });
  assert.equal(decodeCollectionCursor(legacy, 'collection').id, 'b1');
  assert.throws(() => decodeCollectionCursor(legacy, 'collection', undefined, 'x'));
  const child = encodeCollectionCursor({ kind: 'collection-charges', businessDate: '2026-10-08', parentId: 'b1', chargeDate: '2026-10-08', id: 'c1' });
  assert.equal(decodeCollectionCursor(child, 'collection-charges', 'b1').v, 1);
});
test('query mismatch and invalid search reject before opening a database connection', async () => {
  const store = createBorrowerReadStore({ config: {}, pool: { connect() { throw new Error('Must not connect'); } } });
  const cursor = encodeCursor({ rank: 0, createdDate: null, id: 'b1' }, 'one');
  assert.equal((await store.listBorrowers('owner', { cursor, q: 'two' })).status, 400);
  assert.equal((await store.listCollection('owner', { q: '\n' })).status, 400);
});
test('legacy borrower cursors require an explicit valid rank', () => {
  for (const rank of [undefined, null, -1, 3, '0', 0.5]) {
    assert.throws(() => decodeCursor(old({ v: 2, rank, createdDate: null, id: 'b1' })));
  }
});
