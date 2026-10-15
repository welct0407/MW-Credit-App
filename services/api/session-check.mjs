/** Firebase Admin verifyIdToken failures that definitely mean the presented token/user is invalid. */
export const definiteTokenErrorCodes=Object.freeze(['auth/id-token-expired','auth/id-token-revoked','auth/argument-error','auth/user-disabled','auth/user-not-found','auth/invalid-id-token']);
/** Anything else (network, credential, internal, non-Error throws) is a check outage, never a sign-out. */
export function sessionCheckFailure(error){
 return definiteTokenErrorCodes.includes(error?.code)?{ok:false,status:401,code:'session_invalid'}:{ok:false,status:503,code:'session_check_unavailable'};
}
