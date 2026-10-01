import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { configuration } from '../dist/src/configuration.js';
import { config } from './helpers.mjs';
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
test('compiled infrastructure switches initialize the runtime correctly for all boolean combinations', async () => {
  const main = await readFile('infra/main.bicep', 'utf8');
  const template = JSON.parse(await readFile('../../../outputs/r050-vm01-controller/main.arm.json', 'utf8'));
  const candidates = template.resources.filter(resource => resource.type === 'Microsoft.Web/sites/config' && Object.hasOwn(resource.properties ?? {}, 'VM01_ENABLE_MUTATIONS'));
  assert.equal(candidates.length, 1, 'exactly one controller appsettings resource');
  const settings = candidates[0].properties;
  const switches = { VM01_ENABLE_MUTATIONS: 'enableMutations', VM01_ENABLE_OPERATION_POLLING: 'enableOperationPolling' };
  const serialized = {};
  for (const [setting, parameter] of Object.entries(switches)) {
    assert.match(main, new RegExp(`${setting}:\\s*${parameter}\\s*\\?\\s*'true'\\s*:\\s*'false'`));
    // Decode only the compiler's literal ARM conditional, never execute template text.
    const match = /^\[if\(parameters\('([^']+)'\), '([^']+)', '([^']+)'\)\]$/.exec(settings[setting]);
    assert.ok(match, `${setting} must compile to a literal string conditional`);
    assert.equal(match[1], parameter); assert.equal(match[2], 'true'); assert.equal(match[3], 'false');
    serialized[setting] = value => value ? match[2] : match[3];
  }
  for (const mutations of [false, true]) for (const polling of [false, true]) {
    const runtime = configuration({
      VM01_TENANT_ID: config.tenantId, VM01_RESOURCE_ID: config.resourceId, VM01_EXPECTED_VM_ID: config.expectedVmId,
      VM01_ORIGIN: config.origin, VM01_API_CLIENT_ID: config.apiClientId, VM01_BROWSER_CLIENT_ID: config.browserClientId,
      VM01_BROWSER_USER_IDS: config.browserUserIds.join(','), VM01_CLOUD_CLIENT_ID: config.cloudClientId,
      VM01_CLOUD_PRINCIPAL_ID: config.cloudPrincipalId, VM01_STORAGE_ACCOUNT: config.storageAccount,
      VM01_ENABLE_MUTATIONS: serialized.VM01_ENABLE_MUTATIONS(mutations),
      VM01_ENABLE_OPERATION_POLLING: serialized.VM01_ENABLE_OPERATION_POLLING(polling)
    });
    assert.equal(runtime.mutationsEnabled, mutations); assert.equal(runtime.operationPollingEnabled, polling);
  }
});
test('approval manifest and templates agree on discovered target, names and unresolved approvals', async () => {
  const manifest = JSON.parse(await readFile('docs/approval-manifest.json', 'utf8')); const parameters = JSON.parse(await readFile('infra/parameters.example.json', 'utf8')).parameters;
  assert.equal(manifest.repository, 'welct0407/AppSheet-Loan-Project'); assert.equal(manifest.discovery.vmId, parameters.expectedVmId.value); assert.equal(manifest.proposedResources.functionApp, parameters.functionAppName.value); assert.equal(manifest.proposedResources.storageAccount, parameters.storageAccountName.value);
  assert.equal(manifest.runtimePermissions.operationReadGranted, false); assert.equal(manifest.cloudAuthentication.credentialCreationApproved, false); assert.equal(manifest.approvalGroups.livePowerTest.status, 'NOT_APPROVED');
});
