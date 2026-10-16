import test from 'node:test';import assert from 'node:assert/strict';import {readFile,access} from 'node:fs/promises';
// ALL-ARCH-05, APP-ARCH-05, APP-SEC-04 / ALL-ARCH-06: runtime image and checks match what is deployed.
const manifest=JSON.parse(await readFile(new URL('../../package.json',import.meta.url),'utf8'));
test('foundation-era start scripts and DEV API files are gone; the image has no default command',async()=>{
 for(const name of ['start','start:read-dev'])assert.equal(manifest.scripts[name],undefined,name);
 for(const file of ['services/api/server.mjs','services/api/guards.mjs','services/api/dev-read-server.mjs','services/payment-command/dev-server.mjs','scripts/verify-dev.mjs','.github/workflows/deploy-dev.yml'])
  await assert.rejects(access(new URL('../../'+file,import.meta.url)),file);
 assert.doesNotMatch(await readFile(new URL('../../Dockerfile',import.meta.url),'utf8'),/^\s*CMD\b/m);
});
test('check builds the synthetic and live DEV bundles, type-checks services, then runs unit tests',()=>{
 assert.match(manifest.scripts.check,/vite build --mode live-dev/);assert.match(manifest.scripts.check,/npm test/);
 assert.equal(manifest.scripts.typecheck,'tsc --noEmit && tsc -p tsconfig.services.json && tsc -p tsconfig.e2e.json');
 assert.match(manifest.scripts.build,/^npm run typecheck && /);
});
test('browser-only packages are build-time dependencies; runtime keeps web-push for the notify worker',()=>{
 for(const name of ['react','react-dom','firebase']){assert.equal(manifest.dependencies[name],undefined,name);assert.ok(manifest.devDependencies[name],name);}
 assert.ok(manifest.dependencies['web-push']);assert.ok(manifest.devDependencies['@types/node']);
 assert.equal(manifest.dependencies['@google-cloud/secret-manager'],undefined);
});
