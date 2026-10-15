/** Firebase Admin verifyIdToken failures that definitely mean the presented token/user is invalid. */
export const definiteTokenErrorCodes=Object.freeze(['auth/id-token-expired','auth/id-token-revoked','auth/argument-error','auth/user-disabled','auth/user-not-found','auth/invalid-id-token']);
/**
 * firebase-admin reports every structural failure AND a public-key fetch failure as auth/argument-error
 * (token-verifier.js mapJwtErrorToAuthError falls through with the raw transport message). Only the
 * library's own token-validation messages are definite; a key-fetch/transport message is an outage.
 */
export const definiteArgumentErrorMessage=/^(?:Firebase ID token |First argument to verifyIdToken\(\)|Decoding (?:Firebase ID token|token) failed|verifyIdToken\(\) expects |The provided token must be a string)/;
/** Anything else (network, credential, internal, key fetch, non-Error throws) is a check outage, never a sign-out. */
export function sessionCheckFailure(error){
 const code=error?.code;
 const definite=code==='auth/argument-error'?definiteArgumentErrorMessage.test(String(error?.message??'')):definiteTokenErrorCodes.includes(code);
 return definite?{ok:false,status:401,code:'session_invalid'}:{ok:false,status:503,code:'session_check_unavailable'};
}
