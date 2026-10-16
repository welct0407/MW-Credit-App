import {PROJECT_ID} from '../lib/identity.mjs';
import {verifyFirebaseClaims} from '../lib/firebase-claims.mjs';
/** Authentication is shared default Firebase; current SQL membership authorizes each operation. */
export function createBusinessPrincipalVerifier(verifyIdToken,now=()=>Date.now()) {
  const verify=verifyFirebaseClaims({verifyIdToken,projectId:PROJECT_ID,now});
  return async authorization=>{
    const result=await verify(authorization);
    if(!result.ok)return result;
    if(!result.email.includes('@')||result.email.length>320)return {ok:false,status:401,code:'session_invalid'};
    return {ok:true,subject:result.subject,email:result.email};
  };
}
