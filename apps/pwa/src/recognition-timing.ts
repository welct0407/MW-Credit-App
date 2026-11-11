import {useEffect,useState} from 'react';

/**
 * R077: how long the receiving form waits for slip recognition before it says "Slip not read" (RR-UX-02).
 * Chain: agent recognizer 42 s < command route upstream 45 s (services/receipts/recognizer-client.mjs) < this 60 s.
 * The recognition request uses its own fetch and timer, never call()'s 15 s abort.
 */
export const RECOGNITION_DEADLINE_MS=60000;
/** R142 (R142-UX-06): an upload still running after this long says the connection may be slow. */
export const UPLOAD_SLOW_MS=8000;
/** R142 (R142-UX-06): slip reading still running after this long says it is still reading (the deadline above still ends it). */
export const READING_SLOW_MS=10000;

/**
 * R142-UX-05: the one status line above the receipt preview. Each stage replaces the text: Preparing → Uploading → Reading →
 * the form's result message. "offline" is a receipt kept on the device to be sent later, unread. Preparing is shown by the
 * receipt picker's own slot ("Preparing receipt…", R078), so on the status line it only clears the previous text.
 */
export type ReceiptStage='preparing'|'uploading'|'reading'|'offline'|null;
export const receiptStage=(state:{preparing?:boolean;uploading?:boolean;reading?:boolean;offline?:boolean}):ReceiptStage=>
 state.preparing?'preparing':state.uploading?'uploading':state.reading?'reading':state.offline?'offline':null;
export const slowAfter=(stage:ReceiptStage):number|null=>stage==='uploading'?UPLOAD_SLOW_MS:stage==='reading'?READING_SLOW_MS:null;

/** R142-UX-06 copy: "receipt/หลักฐาน" before reading, "slip/สลิป" while reading; '' while preparing; null without a stage. */
export function receiptStageText(stage:ReceiptStage,slow:boolean,thai:boolean):string|null{
 const t=(en:string,th:string)=>thai?th:en;
 if(stage==='preparing')return '';
 if(stage==='uploading')return slow?t('Still uploading — the connection may be slow.','ยังอัปโหลดอยู่ — การเชื่อมต่ออาจช้า'):t('Uploading receipt…','กำลังอัปโหลดหลักฐาน…');
 if(stage==='reading')return slow?t('Still reading slip…','ยังอ่านสลิปอยู่…'):t('Reading slip…','กำลังอ่านสลิป…');
 if(stage==='offline')return t("Receipt saved on this device. It will be sent when you're online; the slip won't be read.",'บันทึกหลักฐานไว้ในอุปกรณ์แล้ว จะส่งเมื่อเชื่อมต่อ และจะไม่อ่านสลิป');
 return null;
}

/** Calls onSlow once when the stage has lasted its threshold; returns the cancel function (none for a stage without one). */
export function watchSlow(stage:ReceiptStage,onSlow:()=>void,timers:{set:typeof setTimeout;clear:typeof clearTimeout}={set:setTimeout,clear:clearTimeout}):()=>void{
 const ms=slowAfter(stage);
 if(ms==null)return ()=>{};
 const timer=timers.set(onSlow,ms);
 return ()=>timers.clear(timer);
}

/**
 * True once the current stage (with its key, e.g. the receipt id) has lasted its threshold. The slow flag belongs to the
 * stage that went slow, so a new stage never shows the previous stage's "Still …" text, not even for one render, and it
 * is cleared when that stage ends, so a later occurrence of the same stage (the next upload) starts not slow.
 */
export function useSlowStage(stage:ReceiptStage,key:string|null=null):boolean{
 const id=stage?stage+':'+(key??''):null,[slowId,setSlowId]=useState<string|null>(null);
 useEffect(()=>{if(!id)return;const cancel=watchSlow(stage,()=>setSlowId(id));return ()=>{cancel();setSlowId(old=>old===id?null:old)}},[id,stage]);
 return !!id&&slowId===id;
}
