/** Sign-out is blocked while unsynced saved requests exist; the label says what to do first. */
export function signOutGuard(pending:number,thai:boolean):{disabled:boolean;label:string}{
 const blocked=pending>0;
 return {disabled:blocked,label:blocked?(thai?'ซิงค์ '+pending+' รายการที่ค้างอยู่ก่อน':'Sync '+pending+' pending first'):(thai?'ออกจากระบบ':'Sign out')};
}
