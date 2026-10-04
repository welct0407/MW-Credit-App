import { CloudClientError, createCloudClient, parseStatusArguments } from './cloud-client.js';
try {
  const requestId = parseStatusArguments(process.argv.slice(2));
  const result = await createCloudClient().status(requestId);
  process.stdout.write(JSON.stringify(result) + '\n');
} catch (error) {
  const safe = error instanceof CloudClientError ? error : new CloudClientError('status_response_invalid');
  process.stderr.write(JSON.stringify({ error: safe.code, ...(safe.httpStatus === undefined ? {} : { httpStatus: safe.httpStatus }) }) + '\n');
  process.exitCode = 1;
}
