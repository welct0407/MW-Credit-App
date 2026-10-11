import { validateShellConfig } from './config.mjs';
/** Browser SDK seam; no owner pins, business routes, worker or persistent store. */
export function createShellController(rawConfig, sdk, render, fetchSession = globalThis.fetch) {
  const config = validateShellConfig(rawConfig);
  if (config.phase === 'maintenance') throw Error('Maintenance has no authentication controller');
  const app = sdk.initializeApp(config.firebase, 'production-foundation-shell');
  const auth = sdk.initializeAuth(app, { persistence:sdk.inMemoryPersistence, popupRedirectResolver:sdk.browserPopupRedirectResolver });
  auth.tenantId = null;
  let user = null, revision = 0, checking = false;
  const publish = status => render({status,signedIn:!!user,canCheck:!!user && config.phase === 'foundation' && !checking});
  const validUser = candidate => candidate && candidate.tenantId == null;
  const unsubscribe = sdk.onAuthStateChanged(auth, candidate => {
    revision++;checking=false;
    if (candidate && !validUser(candidate)) { user=null;publish('Identity rejected. Sign in with the shared account.');void sdk.signOut(auth).catch(()=>{});return; }
    user=candidate;
    publish(user ? config.phase === 'enrollment' ? 'Signed in. Operator verification of the existing account is still required.' : 'Signed in. Check foundation access explicitly.' : 'Sign in to production.');
  });
  return {
    async signIn() {
      try {
        auth.tenantId=null;
        if (auth.currentUser && !validUser(auth.currentUser)) await sdk.signOut(auth);
        const result=await sdk.signInWithPopup(auth,new sdk.GoogleAuthProvider());
        if (!validUser(result.user)) { user=null;revision++;await sdk.signOut(auth);publish('Identity rejected.'); }
      } catch { publish('Sign-in unavailable. Try again.'); }
    },
    async signOut() { revision++;user=null;checking=false;publish('Sign in to production.');try {await sdk.signOut(auth);} catch {publish('Sign-out unavailable. Close this page.');} },
    async checkAccess() {
      if (!user || !validUser(user) || config.phase !== 'foundation' || checking) return;
      const current=revision, selected=user;checking=true;publish('Checking foundation access.');
      try {
        const token=await selected.getIdToken(true);
        for (const endpoint of [config.endpoints.reader,config.endpoints.command]) {
          if (current!==revision || user!==selected) return;
          const response=await fetchSession(endpoint,{method:'GET',headers:{Authorization:'Bearer '+token},credentials:'omit',cache:'no-store',redirect:'error'});
          const body=await response.json();
          if (!response.ok || body.ok!==true || body.authenticated!==true || body.mode!=='foundation' || body.businessAccess!==false
            || body.membershipVerified!==false || !Array.isArray(body.capabilities) || body.capabilities.length) throw Error();
        }
        if(current===revision){checking=false;publish('Foundation access verified. Business access is disabled; membership is not verified.');}
      } catch { if(current===revision){checking=false;publish('Foundation access denied or unavailable.');} }
      finally { if(current===revision){checking=false;} }
    },
    dispose() { revision++;user=null;unsubscribe(); }
  };
}
