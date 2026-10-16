// Fails when a tracked *.png / *.xlsx (any case) sits outside tests/, apps/ or the
// explicit allowlist (scripts/binary-evidence-allowlist.txt: one path per line,
// a trailing "/" allows a folder prefix; "#" starts a comment).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const run = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const allow = readFileSync(new URL('./binary-evidence-allowlist.txt', import.meta.url), 'utf8')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const tracked = run('ls-files', '-z').split('\0').filter((f) => /\.(png|xlsx)$/i.test(f));
const offenders = tracked.filter((f) => !f.startsWith('tests/') && !f.startsWith('apps/')
  && !allow.some((a) => (a.endsWith('/') ? f.startsWith(a) : f === a)));
if (offenders.length) {
  console.error(`Tracked PNG/XLSX files outside tests/, apps/ and the allowlist (${offenders.length}):`);
  for (const f of offenders) console.error(`  ${f}`);
  console.error('Keep captures in test-results/ (ignored) or add a reviewed schema-only file to scripts/binary-evidence-allowlist.txt.');
  process.exit(1);
}
console.log(`binary evidence check passed (${tracked.length} tracked PNG/XLSX files, all allowed)`);
