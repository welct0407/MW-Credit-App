import test from 'node:test';
import assert from 'node:assert/strict';
import { planApplicationRoleRecovery } from '../../scripts/database/application-role-tooling.mjs';

const object = { kind: 'TABLE', oid: '4242', target: 'public.synthetic_recovery_fixture', column: null, owner: 'postgres' };
const right = privilege => ({ ...object, privilege, grantable: false });
const member = name => ({ role: 'mw_app_dev', member: name, admin: false, inherit: true, set: false });
function snapshot(rights = [], memberships = []) {
  return { version: 1, database: 'payment_rehearsal', creators: ['postgres'], objects: [{ ...object }], rights, memberships, defaultAcls: [] };
}
function fixtures() {
  return { before: snapshot([right('SELECT')]), after: snapshot([right('SELECT'), right('INSERT')]), current: snapshot([right('SELECT'), right('INSERT')]) };
}

test('recovery rejects malformed privilege/kind/grantable in before, after and current before SQL planning', () => {
  for (const position of ['before', 'after', 'current']) {
    for (const mutation of [
      { privilege: 'SELECT ON TABLE public.synthetic_recovery_fixture TO PUBLIC; SELECT' },
      { privilege: 'NOT_A_PRIVILEGE' }, { kind: 'UNKNOWN' },
      { grantable: 'false' }, { grantable: 0 }, { grantable: null },
      { kind: 'SEQUENCE', privilege: 'DELETE' },
      { kind: 'FUNCTION', privilege: 'INSERT' },
      { kind: 'COLUMN', privilege: 'TRUNCATE' },
    ]) {
      const values = fixtures();
      values[position].rights = [{ ...right('SELECT'), ...mutation }];
      assert.throws(() => planApplicationRoleRecovery(values));
    }
  }
  // Specifically exercise a malformed before-only privilege; previous planning
  // would have constructed a restoring GRANT. No SQL executor exists here.
  const values = { before: snapshot([{ ...right('SELECT'), privilege: 'SELECT; malicious' }]), after: snapshot(), current: snapshot() };
  assert.throws(() => planApplicationRoleRecovery(values));
});

test('recovery rejects foreign membership role/nonboolean flags in every snapshot before SQL planning', () => {
  for (const position of ['before', 'after', 'current']) {
    for (const mutation of [
      { role: 'postgres' }, { role: 'mw_app_dev_journal_owner' },
      { member: '' }, { member: 1 },
      { admin: 'false' }, { inherit: 1 }, { set: null },
    ]) {
      const values = fixtures();
      values[position].memberships = [{ ...member('synthetic_recovery_login'), ...mutation }];
      assert.throws(() => planApplicationRoleRecovery(values));
    }
  }
});

test('strict recovery input validation preserves valid introduced-delta and unrelated-grant semantics', () => {
  const before = snapshot([right('SELECT')], [member('existing_fixture_login')]);
  const after = snapshot([right('SELECT'), right('INSERT'), right('UPDATE'), right('DELETE')], [...before.memberships, member('introduced_fixture_login')]);
  const current = snapshot([...after.rights, right('REFERENCES')], [...after.memberships, member('later_unrelated_fixture_login')]);
  const result = planApplicationRoleRecovery({ before, after, current });
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.statements.sort(), [
    'REVOKE INSERT ON TABLE public.synthetic_recovery_fixture FROM mw_app_dev',
    'REVOKE UPDATE ON TABLE public.synthetic_recovery_fixture FROM mw_app_dev',
    'REVOKE DELETE ON TABLE public.synthetic_recovery_fixture FROM mw_app_dev',
    'REVOKE mw_app_dev FROM "introduced_fixture_login"',
  ].sort());
  assert.ok(!result.statements.some(sql => sql.includes('REFERENCES') || sql.includes('existing_fixture_login') || sql.includes('later_unrelated_fixture_login')));
});

