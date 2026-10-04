import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { AzureCliCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { configuration } from '../src/configuration.js';
import { AzureArm } from '../src/arm.js';
import { AzureBlobPort, BlobLedger, validateLedger } from '../src/ledger.js';
import { ControllerError } from '../src/errors.js';
import { AzureActivityReader, reconcileRecoveredDeallocation, verifyHistoricalDeallocation, type RecoveryProof } from './recovery-evidence.js';

try {
  const args = process.argv.slice(2);
  const option = (name: string): string | undefined => { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; };
  const apply = args.includes('--apply');
  if (apply === args.includes('--verify-only')) throw new Error('Choose one mode explicitly');
  const file = option('--proof'), expectedHash = option('--proof-sha256'), generation = Number(option('--expected-generation'));
  if (!file || !expectedHash || !/^[0-9a-f]{64}$/.test(expectedHash) || !Number.isSafeInteger(generation) || generation < 1) throw new Error('Pinned proof and generation required');
  const bytes = await readFile(file);
  if (bytes.length > 32768 || createHash('sha256').update(bytes).digest('hex') !== expectedHash) throw new Error('Proof mismatch');
  const proof = JSON.parse(bytes.toString('utf8')) as RecoveryProof;
  const config = configuration(), credential = new AzureCliCredential();
  const blob = new BlobServiceClient(`https://${config.storageAccount}.blob.core.windows.net`, credential, { retryOptions: { maxTries: 1, tryTimeoutInMs: 10000 } }).getContainerClient(config.ledgerContainer).getBlockBlobClient(config.ledgerBlob);
  const port = new AzureBlobPort(blob);
  const arm = new AzureArm(config, credential), activity = new AzureActivityReader(config, credential);
  if (apply) {
    if (!args.includes('--approved') || !args.includes('--workers-fenced')) throw new Error('Scoped approval and actual worker fencing required');
    await new BlobLedger(config, port).transaction(async session => {
      await reconcileRecoveredDeallocation(session, config, arm, activity, proof, generation, true);
      await session.save();
    });
    process.stdout.write('Historical deallocate reconciled; admission remains disabled. Inspect the preserved receipt before approved resumption.\n');
  } else {
    const data = validateLedger(JSON.parse((await port.read()).text), config);
    if (data.generation !== generation || data.activeRequestId !== proof.requestId) throw new Error('Active receipt changed');
    await verifyHistoricalDeallocation(config, arm, activity, data.records[proof.requestId]!, proof, data.audit);
    process.stdout.write('Read-only evidence verification passed. No ledger lease/write, deployment, setting change or power action performed.\n');
  }
} catch (error) {
  process.stderr.write(`Historical recovery failed: ${error instanceof ControllerError ? error.code : 'verification_or_configuration_error'}. Preserve the receipt and do not replay the action.\n`);
  process.exitCode = 1;
}
