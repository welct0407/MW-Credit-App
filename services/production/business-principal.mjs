import { BUSINESS_PROJECT } from './business-config.mjs';
/** Authentication is shared default Firebase; current SQL membership authorizes each operation. */
export function createBusinessPrincipalVerifier(verifyIdToken,now=()=>Date.now()) {
  return async authorization=>{
    const invalid={ok:false,status:401,code:'session_invalid'};
    if(typeof authorization!=='string'||authorization.length>16384||!/^Bearer [^\s]+$/.test(authorization))return{ok:false,status:401,code:'sign_in_required'};
    let c;try{c=await verifyIdToken(authorization.slice(7),true);}catch{return invalid;}
    const time=Math.floor(now()/1000),email=typeof c?.email==='string'?c.email.trim().toLowerCase():'';
    if(c?.aud!==BUSINESS_PROJECT||c.iss!==`https://securetoken.google.com/${BUSINESS_PROJECT}`||c.firebase?.tenant!==undefined||c.firebase?.sign_in_provider!=='google.com'||c.email_verified!==true
      ||typeof c.sub!=='string'||!c.sub||c.sub.length>128||/[\s\u0000-\u001f]/.test(c.sub)||!email.includes('@')||email.length>320
      ||!Number.isSafeInteger(c.exp)||c.exp<=time||!Number.isSafeInteger(c.iat)||c.iat<0||c.iat>time||c.iat>=c.exp||!Number.isSafeInteger(c.auth_time)||c.auth_time<0||c.auth_time>c.iat)return invalid;
    return{ok:true,subject:c.sub,email};
  };
}
