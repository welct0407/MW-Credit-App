import { AzureCliCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { configuration } from '../src/configuration.js';
import { AzureBlobPort, BlobLedger } from '../src/ledger.js';
import { bootstrapLedger } from '../src/state-machine.js';
import { AzureArm } from '../src/arm.js';
import { reconcileOperation, updateAdmission } from '../src/administration.js';
try {
  const mode = process.argv[2]; const args = process.argv.slice(3);
  const option = (name: string): string | undefined => { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; };
  const approved = args.includes('--approved'); const evidence = option('--evidence');
  if (!approved || !evidence || !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/.test(evidence)) throw new Error('Explicit scoped approval and evidence reference required');
  if (!['bootstrap', 'admission', 'reconcile'].includes(mode ?? '')) throw new Error('Invalid administration mode');
  const config = configuration(); const credential = new AzureCliCredential();
  const container = new BlobServiceClient(`https://${config.storageAccount}.blob.core.windows.net`, credential, { retryOptions: { maxTries: 1, tryTimeoutInMs: 10000 } }).getContainerClient(config.ledgerContainer);
  const blob = container.getBlockBlobClient(config.ledgerBlob);
  if (mode === 'bootstrap') {
    await container.createIfNotExists(); const data = bootstrapLedger(config); const text = JSON.stringify(data);
    await blob.upload(text, Buffer.byteLength(text), { conditions: { ifNoneMatch: '*' }, blobHTTPHeaders: { blobContentType: 'application/json' } });
    process.stdout.write('Ledger bootstrapped with admission disabled.\n');
  } else {
    const generation = Number(option('--expected-generation'));
    if (!Number.isSafeInteger(generation) || generation < 1) throw new Error('Expected generation required');
    await new BlobLedger(config, new AzureBlobPort(blob)).transaction(async session => {
      if (session.data.generation !== generation) throw new Error('Stale generation');
      if (mode === 'admission') {
        const enabled = option('--enable'); if (!['true', 'false'].includes(enabled ?? '')) throw new Error('Explicit admission value required');
        updateAdmission(session, generation, enabled === 'true'); await session.save();
      } else {
        // This flag records the operator's fencing evidence; it is not an automatic worker-fencing mechanism.
        if (!args.includes('--workers-fenced') || session.data.admissionEnabled) throw new Error('Admission must be disabled and workers fenced');
        const id = option('--request-id'); const result = option('--result');
        if (!id || session.data.activeRequestId !== id || !['succeeded', 'failed', 'canceled', 'not-dispatched'].includes(result ?? '')) throw new Error('Exact active operation and terminal evidence required');
        await reconcileOperation(session, config, new AzureArm(config, credential), { generation, workersFenced: true, requestId: id, result: result as 'succeeded' | 'failed' | 'canceled' | 'not-dispatched', evidence }); await session.save();
      }
    });
    process.stdout.write('Approved ledger update completed; inspect status before resuming control.\n');
  }
} catch { process.stderr.write('Ledger administration failed. Preserve unknown-operation evidence; review approval, worker fencing, target, generation and operator permissions.\n'); process.exitCode = 1; }
