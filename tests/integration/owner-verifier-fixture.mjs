// Test-only owner-pinned verifier for the disposable loopback command rehearsals. The deployed DEV
// owner pin was retired with the DEV-only servers (ALL-ARCH-01); claims use the shared strict check.
import {verifyFirebaseClaims} from '../../services/lib/firebase-claims.mjs';
import {PROJECT_ID,OWNER_EMAIL} from '../../services/lib/identity.mjs';
export function createCommandPrincipalVerifier({verifyIdToken,ownerUid,now}){
 if(typeof verifyIdToken!=='function'||typeof ownerUid!=='string'||!ownerUid.trim()||ownerUid!==ownerUid.trim()||ownerUid.length>128)throw Error('Pinned command identity required');
 const verify=verifyFirebaseClaims({verifyIdToken,projectId:PROJECT_ID,...(now?{now}:{})});
 return async authorization=>{const result=await verify(authorization);if(!result.ok)return result;if(result.subject!==ownerUid||result.email!==OWNER_EMAIL)return {ok:false,status:403,code:'access_denied'};return {ok:true,subject:result.subject,email:result.email};};
}
