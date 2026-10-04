import { AzureCliCredential } from '@azure/identity';
import { configuration } from '../src/configuration.js';
import { AzureArm } from '../src/arm.js';
import { validateObservation } from '../src/state-machine.js';
try {
  if (process.argv.slice(2).some(x => x !== '--azure-read')) throw new Error('Unsupported preflight argument');
  const config = configuration();
  const output: Record<string, unknown> = { configuration: 'valid', tenantId: config.tenantId, resourceId: config.resourceId, expectedVmId: config.expectedVmId,
    mutationsEnabled: config.mutationsEnabled, operationPollingEnabled: config.operationPollingEnabled, cloudCallerConfigured: Boolean(config.cloudClientId) };
  if (process.argv.includes('--azure-read')) { const observation = await new AzureArm(config, new AzureCliCredential()).observe(); validateObservation(observation, config, Date.now()); output.observation = observation; }
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
} catch { process.stderr.write('Preflight failed. Check public configuration and, for --azure-read, the separately authorized Azure CLI session.\n'); process.exitCode = 1; }
