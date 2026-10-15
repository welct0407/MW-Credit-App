// Temporary database source location for retained legacy helpers.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export const databaseRoot = resolve(process.env.MW_CREDIT_APP_ROOT || fileURLToPath(new URL('../../MW-Credit-App/', import.meta.url)));
