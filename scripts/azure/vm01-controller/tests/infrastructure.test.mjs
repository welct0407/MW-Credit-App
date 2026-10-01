import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('source infrastructure defaults are inert and preserve the exact base permission boundary', async () => {
  const parameters = JSON.parse(await readFile('infra/parameters.example.json', 'utf8')).parameters;
  for (const name of ['enableMutations', 'enableOperationPolling', 'attachVmRole']) assert.equal(parameters[name].value, false);
  const role = await readFile('infra/vm-role.bicep', 'utf8');
  const actionBlocks = [...role.matchAll(/\bactions:\s*\[([^\]]*)\]/g)];
  assert.equal(actionBlocks.length, 1, 'exactly one permission action block');
  const actions = [...actionBlocks[0][1].matchAll(/'([^']+)'/g)].map(x => x[1]);
  assert.equal(actionBlocks[0][1].replace(/'[^']+'|\s/g, ''), '', 'every action must be a reviewed literal');
  assert.deepEqual(actions.sort(), ['Microsoft.Compute/virtualMachines/read', 'Microsoft.Compute/virtualMachines/instanceView/read', 'Microsoft.Compute/virtualMachines/start/action', 'Microsoft.Compute/virtualMachines/restart/action', 'Microsoft.Compute/virtualMachines/deallocate/action'].sort());
  for (const field of ['notActions', 'dataActions', 'notDataActions']) assert.match(role, new RegExp(`\\b${field}:\\s*\\[\\s*\\]`));
  assert.match(role, /scope: vm/); assert.equal(role.includes('locations/operations/read'), false);
  const main = await readFile('infra/main.bicep', 'utf8'); assert.match(main, /alwaysReady: \[\]/); assert.match(main, /instanceMemoryMB: 512/); assert.match(main, /resourceGroup\('50f792fa-803e-4280-833d-1fe60fef5293', 'RG-MWCREDIT'\)/);
  assert.equal(/Microsoft\.(Insights|OperationalInsights|Network)\//.test(main), false);
  const proposal = JSON.parse(await readFile('infra/operation-read-proposal.json', 'utf8')); assert.equal(proposal.status, 'PROPOSAL_ONLY_NOT_APPROVED'); assert.equal(proposal.scopeCandidates.length, 2);
});
test('approval manifest and templates agree on discovered target, names and unresolved approvals', async () => {
  const manifest = JSON.parse(await readFile('docs/approval-manifest.json', 'utf8')); const parameters = JSON.parse(await readFile('infra/parameters.example.json', 'utf8')).parameters;
  assert.equal(manifest.repository, 'welct0407/AppSheet-Loan-Project'); assert.equal(manifest.discovery.vmId, parameters.expectedVmId.value); assert.equal(manifest.proposedResources.functionApp, parameters.functionAppName.value); assert.equal(manifest.proposedResources.storageAccount, parameters.storageAccountName.value);
  assert.equal(manifest.runtimePermissions.operationReadGranted, false); assert.equal(manifest.cloudAuthentication.credentialCreationApproved, false); assert.equal(manifest.approvalGroups.livePowerTest.status, 'NOT_APPROVED');
});
