import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseRegister, documentationRows, renderDocumentationChecklist } from './documentation.mjs';

test('register covers every actual Documents file exactly once', async () => {
  const rows = await documentationRows();
  assert.equal(rows.filter(r => r.rule === 'Uncatalogued' || r.note).length, 0);
  assert.equal(new Set(rows.map(r => r.file)).size, rows.length);
  assert.deepEqual(rows.filter(r => r.rule === 'Always').map(r => r.file).sort(), ['Development_Changes.md', 'Environment_Inventory.md', 'Release_Tracker.md']);
});
test('new files and missing registered documents remain visible and Pending', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'document-checklist-'));
  const register = path.join(dir, 'Promotion_Documentation_Checklist.md');
  const extra = path.join(dir, 'New_Reference.md');
  try {
    await fs.writeFile(register, '| DOC-001 | [Missing.md](Missing.md) | Always | Missing example |\n| DOC-002 | [Register](Promotion_Documentation_Checklist.md) | Conditional | Registry |');
    await fs.writeFile(extra, 'New document');
    const rows = await documentationRows(dir);
    assert.match(rows.find(r => r.file === 'Missing.md').note, /Missing registered/);
    assert.equal(rows.find(r => r.file === 'New_Reference.md').rule, 'Uncatalogued');
    const output = await renderDocumentationChecklist(dir);
    assert.equal((output.match(/\| Pending \|/g) ?? []).length, 3);
  } finally { await fs.unlink(register); await fs.unlink(extra); await fs.rmdir(dir); }
});
test('duplicate IDs/paths and malformed register rows cannot silently remove coverage', () => {
  const row = '| DOC-001 | [A](A.md) | Always | Details |';
  assert.throws(() => parseRegister(row + '\n' + row), /Duplicate/);
  assert.throws(() => parseRegister(row + '\n| DOC-002 | [A](a.md) | Conditional | Details |'), /Duplicate/);
  assert.throws(() => parseRegister('| DOC-001 | bad | Always | Details |'), /Malformed/);
});
