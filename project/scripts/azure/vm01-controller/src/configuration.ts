import type { Configuration } from './types.js';
export const TARGET_RESOURCE_ID = '/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/RG-MWCREDIT/providers/Microsoft.Compute/virtualMachines/VM-01';
export const TARGET_TENANT_ID = '9e29c895-606a-420b-acc2-1c24375df4d9';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function configuration(env: NodeJS.ProcessEnv = process.env): Configuration {
  const required = (name: string): string => { const value = env[name]; if (!value) throw new Error(`Missing public configuration: ${name}`); return value; };
  const guid = (name: string): string => { const value = required(name); if (!UUID.test(value)) throw new Error(`Invalid identifier: ${name}`); return value.toLowerCase(); };
  const tenantId = guid('VM01_TENANT_ID');
  if (tenantId !== TARGET_TENANT_ID) throw new Error('Unexpected Azure tenant');
  const resourceId = required('VM01_RESOURCE_ID');
  if (resourceId !== TARGET_RESOURCE_ID) throw new Error('Unexpected VM resource');
  const origin = required('VM01_ORIGIN');
  if (new URL(origin).origin !== origin || !origin.startsWith('https://')) throw new Error('Invalid HTTPS origin');
  const browserUserIds = required('VM01_BROWSER_USER_IDS').split(',').map(x => x.trim().toLowerCase());
  if (!browserUserIds.length || browserUserIds.some(x => !UUID.test(x))) throw new Error('Invalid browser user identifiers');
  const cloudClientId = env.VM01_CLOUD_CLIENT_ID?.toLowerCase() || undefined;
  const cloudPrincipalId = env.VM01_CLOUD_PRINCIPAL_ID?.toLowerCase() || undefined;
  if (Boolean(cloudClientId) !== Boolean(cloudPrincipalId) || (cloudClientId && !UUID.test(cloudClientId)) || (cloudPrincipalId && !UUID.test(cloudPrincipalId))) throw new Error('Invalid cloud caller identifiers');
  const storageAccount = required('VM01_STORAGE_ACCOUNT');
  if (!/^[a-z0-9]{3,24}$/.test(storageAccount)) throw new Error('Invalid dedicated storage account');
  const ledgerContainer = 'vm01-controller';
  const ledgerBlob = 'ledger.json';
  if (env.VM01_ENABLE_MUTATIONS && !['true', 'false'].includes(env.VM01_ENABLE_MUTATIONS)) throw new Error('Invalid mutation switch');
  if (env.VM01_ENABLE_OPERATION_POLLING && !['true', 'false'].includes(env.VM01_ENABLE_OPERATION_POLLING)) throw new Error('Invalid operation polling switch');
  return { tenantId, resourceId, origin, browserUserIds, cloudClientId, cloudPrincipalId,
    apiClientId: guid('VM01_API_CLIENT_ID'), browserClientId: guid('VM01_BROWSER_CLIENT_ID'), expectedVmId: guid('VM01_EXPECTED_VM_ID'),
    storageAccount, ledgerContainer, ledgerBlob, mutationsEnabled: env.VM01_ENABLE_MUTATIONS === 'true', operationPollingEnabled: env.VM01_ENABLE_OPERATION_POLLING === 'true', apiVersion: '2025-04-01' };
}
