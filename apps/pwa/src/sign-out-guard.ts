/** Sign-out is blocked while unsynced saved requests exist (pending); the label names only the
 * requests that actually waited (visible), so a sub-second first send never reads "Sync 1 pending first". */
export function signOutGuard(pending:number,thai:boolean,visible:number=pending):{disabled:boolean;label:string}{
 const blocked=pending>0,named=blocked&&visible>0;
 return {disabled:blocked,label:named?(thai?'ซิงค์ '+visible+' รายการที่ค้างอยู่ก่อน':'Sync '+visible+' pending first'):(thai?'ออกจากระบบ':'Sign out')};
}
