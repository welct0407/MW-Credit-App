import {test,expect} from '@playwright/test';
test('P4-10/11 IndexedDB owner partition, durable drafts, limits and expiry',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');
  const issuer='https://securetoken.google.com/clever-oasis-508610-n7';
  let repo=ownerOfflineRepository({issuer,uid:'independent-offline-owner'});
  await repo.purge();repo=ownerOfflineRepository({issuer,uid:'independent-offline-owner'});await repo.authorize();
  for(let i=0;i<21;i++)await repo.saveSnapshot('borrower'+i,{borrower:{id:'borrower'+i},charges:[]});
  const snapshots=await repo.list('snapshot');
  for(let i=0;i<5;i++)await repo.saveDraft('draft'+i,{notes:'ไทย\n🧪'+i,image:new Blob(['synthetic'],{type:'image/png'})});
  let draftLimit=false,rowLimit=false,imageLimit=false,wrongIssuer=false;
  try{await repo.saveDraft('sixth',{notes:'must not evict'})}catch{draftLimit=true}
  try{await repo.saveSnapshot('large',{charges:Array.from({length:101},()=>({}))})}catch{rowLimit=true}
  try{await repo.saveDraft('draft0',{image:new Blob([new Uint8Array(5242881)])})}catch{imageLimit=true}
  try{ownerOfflineRepository({issuer:'other-env',uid:'independent-offline-owner'})}catch{wrongIssuer=true}
  const other=ownerOfflineRepository({issuer,uid:'different-owner'});
  const otherRows=await other.list('draft');
  const now=Date.now;Date.now=()=>now()+25*60*60*1000;
  const expiredAuthorized=await repo.authorized(),expiredSnapshots=await repo.list('snapshot'),retainedDrafts=await repo.list('draft');Date.now=now;
  await repo.savePending('request',{requestId:'request',borrowerId:'borrower0',notes:'immutable'});let pendingConflict=false;try{await repo.savePending('request',{requestId:'request',borrowerId:'borrower0',notes:'changed'})}catch{pendingConflict=true}if(!pendingConflict)throw Error('Changed pending identity accepted');
  return {snapshotCount:snapshots.length,draftLimit,rowLimit,imageLimit,wrongIssuer,otherCount:otherRows.length,expiredAuthorized,expiredSnapshotCount:expiredSnapshots.length,retainedDraftCount:retainedDrafts.length};
 });
 expect(result).toEqual({snapshotCount:20,draftLimit:true,rowLimit:true,imageLimit:true,wrongIssuer:true,otherCount:0,expiredAuthorized:false,expiredSnapshotCount:0,retainedDraftCount:5});
 await page.reload();
 const reload=await page.evaluate(async()=>{const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');const repo=ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'independent-offline-owner'});const draft=await repo.draft<any>('draft0'),pending=await repo.pending<any>('request');const result={notes:draft?.value.notes,image:await draft?.value.image.text(),pending:pending?.value};const stale=ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'independent-offline-owner'});await repo.purge();let refused=0;try{await stale.saveDraft('late',{notes:'late'})}catch{refused++}try{await stale.authorize()}catch{refused++}if(refused!==2)throw Error('Purged namespace repopulated');return result});
 expect(reload).toEqual({notes:'ไทย\n🧪0',image:'synthetic',pending:{requestId:'request',borrowerId:'borrower0',notes:'immutable'}});
});


