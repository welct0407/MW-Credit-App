export type DraftFailure='limit'|'authorization'|'storage';
export function draftFailure(error:unknown):DraftFailure{const message=error instanceof Error?error.message:'';return message==='Offline draft limit reached'?'limit':message==='Offline owner lease expired'||message==='Offline owner scope revoked'?'authorization':'storage';}
/** Server-supplied defaults alone are not an unsent user draft. */
export function loanDraftEnabled(edited:boolean,busy:boolean,unknown:boolean,pending:boolean){return edited&&!busy&&!unknown&&!pending;}
