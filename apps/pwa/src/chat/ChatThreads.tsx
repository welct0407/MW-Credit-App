import type React from 'react';
import {useEffect,useRef,useState} from 'react';
import {Icon} from '../Icon';
import {displayDateWithYear} from '../display-date';
import {threadTitle,relativeTime,bangkokDate} from './chat-text';
import type {ChatModel,ChatThread} from './chat-client';

// R090 thread list (design §6.2): "New chat" first, then threads newest first with title, model and relative time.
// A ⋯ button per thread offers Rename and Archive (Unarchive in the archived list).
export function ChatThreads({threads,currentId,models,archived,busy,error,hasMore,thai,onOpen,onNew,onToggleArchived,onRename,onStatus,onMore,onRetry,onClose,closeRef}:{
 threads:ChatThread[];currentId:string|null;models:ChatModel[];archived:boolean;busy:boolean;error:boolean;hasMore:boolean;thai:boolean;
 onOpen:(thread:ChatThread)=>void;onNew:()=>void;onToggleArchived:()=>void;onRename:(thread:ChatThread,title:string)=>Promise<boolean>;onStatus:(thread:ChatThread,status:'active'|'archived')=>void;onMore:()=>void;onRetry:()=>void;onClose:()=>void;closeRef?:React.RefObject<HTMLButtonElement|null>;
}){
 const t=(en:string,th:string)=>thai?th:en;
 const [menu,setMenu]=useState<string|null>(null),[renaming,setRenaming]=useState<string|null>(null),[draft,setDraft]=useState(''),[saving,setSaving]=useState(false);
 const renameInput=useRef<HTMLInputElement|null>(null);
 useEffect(()=>{if(renaming)renameInput.current?.focus()},[renaming]);
 // Escape closes an open menu or rename first (capture, before the sheet's own Escape).
 useEffect(()=>{if(!menu&&!renaming)return;const onEscape=(event:KeyboardEvent)=>{if(event.key!=='Escape')return;event.preventDefault();event.stopPropagation();setMenu(null);setRenaming(null)};document.addEventListener('keydown',onEscape,true);return()=>document.removeEventListener('keydown',onEscape,true)},[menu,renaming]);
 useEffect(()=>{if(!menu)return;const close=(event:MouseEvent)=>{if(!(event.target instanceof Element)||!event.target.closest('.chat-thread-menu,.chat-thread-more'))setMenu(null)};document.addEventListener('click',close);return()=>document.removeEventListener('click',close)},[menu]);
 const modelLabel=(id:string)=>models.find(model=>model.id===id)?.label??id;
 const when=(thread:ChatThread)=>{const at=thread.lastMessageAt??thread.createdAt;if(!at)return '';return relativeTime(at,thai)??displayDateWithYear(bangkokDate(at),thai)};
 const trimmed=draft.trim(),validTitle=trimmed.length>0&&[...trimmed].length<=120&&!/[\u0000-\u001f]/u.test(trimmed);
 return <section className="chat-threads" aria-label={t('Threads','รายการแชท')}>
  <div className="chat-threads-head">
   <h2>{archived?t('Archived threads','แชทที่เก็บถาวร'):t('Threads','รายการแชท')}</h2>
   <button type="button" className="secondary-button chat-archived-toggle" aria-pressed={archived} onClick={onToggleArchived}>{t('Archived','ดูที่เก็บถาวร')}</button>
   <button ref={closeRef} type="button" className="icon-action chat-threads-close" aria-label={t('Close threads','ปิดรายการแชท')} title={t('Close threads','ปิดรายการแชท')} onClick={onClose}><Icon name="close"/></button>
  </div>
  {!archived&&<button type="button" className="secondary-button chat-new chat-new-in-list" onClick={onNew}><Icon name="add"/><span>{t('New chat','แชทใหม่')}</span></button>}
  {error&&<p className="chat-threads-error" role="alert">{t('Threads unavailable.','โหลดรายการแชทไม่ได้')} <button type="button" className="text-action" onClick={onRetry}>{t('Try again','ลองอีกครั้ง')}</button></p>}
  <ul className="chat-thread-list">{threads.map(thread=><li key={thread.id} className={'chat-thread'+(thread.id===currentId?' current':'')}>
   {renaming===thread.id?<form className="chat-thread-rename" onSubmit={async event=>{event.preventDefault();if(!validTitle||saving)return;setSaving(true);const ok=await onRename(thread,trimmed);setSaving(false);if(ok)setRenaming(null)}}>
    <label className="visually-hidden" htmlFor={'chat-rename-'+thread.id}>{t('Thread name','ชื่อแชท')}</label>
    <input id={'chat-rename-'+thread.id} ref={renameInput} value={draft} maxLength={240} onChange={event=>setDraft(event.target.value)}/>
    <button type="submit" className="secondary-button" disabled={!validTitle||saving}>{t('Save','บันทึก')}</button>
    <button type="button" className="secondary-button" onClick={()=>setRenaming(null)}>{t('Cancel','ยกเลิก')}</button>
   </form>:<>
    <button type="button" className="chat-thread-open" aria-current={thread.id===currentId?'true':undefined} onClick={()=>onOpen(thread)}>
     <span className="chat-thread-title">{threadTitle(thread.title,thai)}</span>
     <span className="chat-thread-meta"><span className="chat-model-badge">{modelLabel(thread.model)}</span><span>{when(thread)}</span></span>
    </button>
    <button type="button" className="icon-action chat-thread-more" aria-label={t('More for ','ตัวเลือกเพิ่มเติมของ ')+threadTitle(thread.title,thai)} aria-expanded={menu===thread.id} onClick={()=>setMenu(value=>value===thread.id?null:thread.id)}><Icon name="more"/></button>
    {menu===thread.id&&<div className="chat-thread-menu">
     <button type="button" onClick={()=>{setMenu(null);setDraft(threadTitle(thread.title,thai));setRenaming(thread.id)}}>{t('Rename','เปลี่ยนชื่อ')}</button>
     <button type="button" onClick={()=>{setMenu(null);onStatus(thread,archived?'active':'archived')}}>{archived?t('Unarchive','เลิกเก็บถาวร'):t('Archive','เก็บถาวร')}</button>
    </div>}
   </>}
  </li>)}</ul>
  {!threads.length&&!busy&&!error&&<p className="chat-threads-empty">{archived?t('No archived threads.','ไม่มีแชทที่เก็บถาวร'):t('No threads yet.','ยังไม่มีแชท')}</p>}
  {busy&&<p className="chat-threads-loading" role="status">{t('Loading…','กำลังโหลด…')}</p>}
  {hasMore&&!busy&&<button type="button" className="secondary-button chat-threads-more" onClick={onMore}>{t('Load more threads','โหลดแชทเพิ่ม')}</button>}
 </section>;
}
