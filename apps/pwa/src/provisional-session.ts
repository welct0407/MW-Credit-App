// R132: an installed app reopened after idle shows its saved workspace at once. Firebase reports the persisted user only after
// a token refresh and an account lookup over the network; until then the app runs on a provisional session built from the
// persisted identity alone (uid and email, never a token). Every network read and write waits until Firebase confirms the
// same account; a different account or none rejects the provisional session and the existing sign-out or switch path runs.

/** The part of a Firebase User the live app uses: its identity and a fresh ID token. */
export type SessionUser={readonly uid:string;readonly email:string|null;getIdToken(forceRefresh?:boolean):Promise<string>};
export type SessionIdentity={uid:string;email:string|null};
export type ProvisionalUser=SessionUser&{
 readonly confirmed:boolean;
 /** Resolves once Firebase confirms this account; rejects when it reports another account or none. */
 readonly ready:Promise<void>;
 /** Settles the session with the confirmed User of the same uid; returns false once already settled or for another uid. */
 confirm(user:SessionUser):boolean;
 reject(error:Error):void;
};

const provisional=new WeakSet<object>();

/**
 * Reads the uid and email of the user Firebase persisted with browserLocalPersistence for the default app, or null on any doubt.
 * The key is Firebase Auth 12.19's `_persistenceKeyName('authUser', apiKey, '[DEFAULT]')` (`firebase:authUser:<apiKey>:[DEFAULT]`);
 * a Firebase upgrade that changes it only turns this fast path off (null), never the sign-in itself. The stored token
 * manager is never read or returned.
 */
export function persistedSessionIdentity(apiKey:string,storage?:Pick<Storage,'getItem'>):SessionIdentity|null{
 try{
  if(typeof apiKey!=='string'||!apiKey)return null;
  const raw=(storage??globalThis.localStorage)?.getItem('firebase:authUser:'+apiKey+':[DEFAULT]');
  if(typeof raw!=='string'||raw.length>65536)return null;
  const value:unknown=JSON.parse(raw);
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const record=value as Record<string,unknown>,uid=record.uid,email=record.email;
  if(typeof uid!=='string'||uid.length<1||uid.length>128||record.apiKey!==apiKey||record.appName!=='[DEFAULT]')return null;
  if(email!==undefined&&email!==null&&typeof email!=='string')return null;
  return {uid,email:typeof email==='string'&&email?email:null};
 }catch{return null}
}

/** A User-shaped stand-in for the persisted identity; getIdToken waits for confirmation and then delegates to the real User. */
export function provisionalUser(identity:SessionIdentity):ProvisionalUser{
 let real:SessionUser|null=null,settled=false,resolve!:()=>void,fail!:(error:Error)=>void;
 const ready=new Promise<void>((done,reject)=>{resolve=done;fail=reject});
 // A rejection is handled by whoever waits on it; an unobserved one is not an error.
 ready.catch(()=>{});
 const reject=(error:Error)=>{if(settled)return;settled=true;fail(error)};
 const user:ProvisionalUser={
  uid:identity.uid,
  get email(){return real?real.email:identity.email},
  get confirmed(){return real!==null},
  ready,
  async getIdToken(forceRefresh?:boolean){await ready;return (real as SessionUser).getIdToken(forceRefresh)},
  confirm(next){if(settled)return false;if(!next||next.uid!==identity.uid){reject(Error('Session unavailable'));return false}settled=true;real=next;resolve();return true},
  reject,
 };
 provisional.add(user);
 return Object.freeze(user);
}

/** The provisional session `user` still waits on, or null for a confirmed, real or absent user. */
export function unconfirmedSession(user:SessionUser|null|undefined):ProvisionalUser|null{
 return user&&provisional.has(user)&&!(user as ProvisionalUser).confirmed?user as ProvisionalUser:null;
}
