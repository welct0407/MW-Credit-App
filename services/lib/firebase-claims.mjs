import {sessionCheckFailure} from '../api/session-check.mjs';
/**
 * Strict Firebase ID-token check shared by every browser verifier (APP-AUTH-02).
 * verifyIdToken must be Firebase Admin's cryptographic verifier, never decoded browser claims.
 * Returns {ok:true,subject,email,claims} (email trimmed and lower-cased, '' when absent) or a failure.
 * @param {{verifyIdToken:(token:string,checkRevoked:boolean)=>Promise<any>,projectId:string,now?:()=>number}} options
 */
export function verifyFirebaseClaims({verifyIdToken,projectId,now=()=>Date.now()}) {
  const issuer=`https://securetoken.google.com/${projectId}`;
  return async authorization=>{
    if(typeof authorization!=='string'||authorization.length>16384||!/^Bearer [^\s]+$/.test(authorization))return {ok:false,status:401,code:'sign_in_required'};
    let c;try{c=await verifyIdToken(authorization.slice(7),true);}catch(error){return sessionCheckFailure(error);}
    const time=Math.floor(now()/1000);
    if(!c||c.aud!==projectId||c.iss!==issuer||c.firebase?.tenant!==undefined||c.firebase?.sign_in_provider!=='google.com'||c.email_verified!==true
      ||typeof c.sub!=='string'||!c.sub||c.sub.length>128||/[\s\u0000-\u001f\u007f]/u.test(c.sub)
      ||!Number.isSafeInteger(c.exp)||c.exp<=time||!Number.isSafeInteger(c.iat)||c.iat<0||c.iat>time||c.iat>=c.exp
      ||!Number.isSafeInteger(c.auth_time)||c.auth_time<0||c.auth_time>c.iat)return {ok:false,status:401,code:'session_invalid'};
    return {ok:true,subject:c.sub,email:typeof c.email==='string'?c.email.trim().toLowerCase():'',claims:c};
  };
}
