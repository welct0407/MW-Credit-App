/** Firebase Admin accounts:lookup, with cancellation covering token and lookup IO. */
export function createNotificationIdentityLookup(project, request=globalThis.fetch) {
  return async (subject,{signal}={}) => {
    const tokenResponse=await request('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'},signal,redirect:'error'});
    if(!tokenResponse.ok)throw Error('identity_unavailable');
    const token=await tokenResponse.json();
    if(typeof token.access_token!=='string'||!token.access_token)throw Error('identity_unavailable');
    const response=await request(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:lookup`,{method:'POST',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},body:JSON.stringify({localId:[subject]}),signal,redirect:'error'});
    if(!response.ok)throw Error('identity_unavailable');
    const data=await response.json();
    if(!data.users?.length){const error=Error('user_not_found');error.code='auth/user-not-found';throw error;}
    if(data.users.length!==1||data.users[0].localId!==subject)throw Error('identity_unavailable');
    const user=data.users[0];
    return {disabled:user.disabled===true,emailVerified:user.emailVerified===true,email:user.email,providerData:user.providerUserInfo};
  };
}
