// Backup-only controller. Fixed children; no migration, feature toggle or arbitrary command.
export function backupAuthorityCommands({environment,approvalReference,backupProof,sourceCommit,state,node,python,pwsh}){
 if(!['development','production'].includes(environment)||!approvalReference?.trim()||!backupProof||!state||!/^[a-f0-9]{40}$/.test(sourceCommit??''))throw Error('Exact backup authorization and source pin required');
 const prod=environment==='production';
 const cli=prod?'scripts/database/r053-production-operator-cli.mjs':'scripts/database/r053-operator-cli.mjs';
 // The retained verified V87 backup authorizes only temporary authority for the
 // fresh V89 backup. Subsequent migration uses the fresh V89 proof instead.
 const common=['--state',state,'--apply',...(prod?['--baseline-version','87','--approval-reference',approvalReference,'--backup-proof',backupProof,'--source-commit',sourceCommit]:[])];
 return {prepare:[node,cli,'prepare-agent',...common],restore:[node,cli,'restore',...common],backup:prod?[python,'scripts/database/Backup-ProductionPromotion.py','--approval-reference',approvalReference,'--expected-version','89']:[pwsh,'-NoProfile','-File','scripts/database/Backup-DevActivation.ps1']};
}
export async function runBackupWithAuthority(commands,{execute,stateExists}){
 try{await execute(commands.prepare);await execute(commands.backup);}
 finally{if(await stateExists())await execute(commands.restore);}
}
