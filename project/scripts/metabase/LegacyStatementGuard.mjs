import fs from 'node:fs';
if(fs.existsSync(new URL('../../outputs/r016-20260922/statement-cleanup-state.json',import.meta.url)))
 throw Error('This historical installer is retired after canonical cash-page cleanup. Use StatementCleanup.mjs and preserve unaffected pages; do not recreate archived questions/models.');
