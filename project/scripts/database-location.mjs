// Database source location for retained legacy helpers: the repository root (parent of project/).
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export const databaseRoot = resolve(process.env.MW_CREDIT_APP_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
