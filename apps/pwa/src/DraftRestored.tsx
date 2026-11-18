/** R172 UX-DRAFT-01 (Echo): "Restored unsaved draft · Clear draft", first on the expense form, now shared by every form that
 * restores a saved draft (New loan, charge, management record, account openings). Clear draft deletes the draft and closes
 * the form, so the next open starts from the defaults; a failure keeps the form open with the message. */
export function DraftRestored({thai,busy,discard,onBack,onError}:{thai:boolean;busy?:boolean;discard:()=>Promise<void>;onBack:()=>void;onError:(message:string)=>void}){
 const t=(en:string,th:string)=>thai?th:en;
 return <p className="expense-draft-restored">{t('Restored unsaved draft','กู้คืนร่างที่ยังไม่บันทึก')} · <button type="button" className="text-action" disabled={busy} onClick={()=>void discard().then(onBack).catch(()=>onError(t('Draft could not be cleared.','ล้างร่างไม่ได้')))}>{t('Clear draft','ล้างร่าง')}</button></p>;
}
