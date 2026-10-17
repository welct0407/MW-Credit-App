/** Sign-out is blocked while unsynced saved requests exist (pending). The button always reads "Sign out";
 * the reason names only the requests that actually waited (visible), so a sub-second first send never
 * shows "not synced yet" (APP-OFFLINE-02 / APP-UX-SETTINGS-05). */
export function signOutGuard(pending:number,thai:boolean,visible:number=pending):{disabled:boolean;label:string;note?:string}{
 const blocked=pending>0,named=blocked&&visible>0;
 const label=thai?'ออกจากระบบ':'Sign out';
 if(!named)return {disabled:blocked,label};
 return {disabled:true,label,note:thai?'ยังมีรายการที่บันทึกไว้ '+visible+' รายการที่ยังไม่ซิงค์ กรุณาซิงค์ก่อนออกจากระบบ':visible+' saved '+(visible===1?'change':'changes')+' not synced yet. Sync before signing out.'};
}
/** Accessible name of the visible "Sync now" action beside a blocked sign-out; distinct from the saved-changes screen's own "Sync now". */
export function syncNowLabel(visible:number,thai:boolean){return thai?'ซิงค์ตอนนี้ '+visible+' รายการที่บันทึก':'Sync now, '+visible+' saved '+(visible===1?'change':'changes')}
