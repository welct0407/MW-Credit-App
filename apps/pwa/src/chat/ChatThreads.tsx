import type React from 'react';
import {useEffect,useId,useRef,useState,useSyncExternalStore} from 'react';
import {Icon} from '../Icon';
import {displayDateWithYear} from '../display-date';
import {threadTitle,relativeTime,bangkokDate,deleteFailureText} from './chat-text';
import type {ChatModel,ChatThread} from './chat-client';

// R090 thread list (design §6.2): "New chat" first, then threads newest first with title, model and relative time.
// A ⋯ button per thread offers Rename and Archive (Unarchive in the archived list).
// R182 (CHAT-DEL-01 to 05): the menu ends with a separated, red "Delete…" in both lists. On a touch device (coarse
// pointer) the row is also a native horizontal scroll-snap strip with an 88px red Delete after its content: swiping left
// reveals it, one row at a time; a tap on an open row's content only closes it, and scrolling the list, opening ⋯ or
// closing the sheet closes it too. That button is not in the tab order or the accessibility tree (the ⋯ menu is the
// accessible route). Delete always asks first (the saved-discard dialog, Cancel focused); nothing swipes to delete.
const coarseQuery='(pointer:coarse)';
const subscribeCoarse=(listener:()=>void)=>{const query=matchMedia(coarseQuery);query.addEventListener('change',listener);return()=>query.removeEventListener('change',listener)};
const readCoarse=()=>matchMedia(coarseQuery).matches;
/** onDelete resolves null when the thread is gone (deleted, or already missing), else the refusal code for the dialog. */
export function ChatThreads({threads,currentId,models,archived,busy,error,hasMore,thai,sheetOpen,onOpen,onNew,onToggleArchived,onRename,onStatus,onDelete,deleteBlocked,deletePending,onMore,onRetry,onClose,closeRef}:{
 threads:ChatThread[];currentId:string|null;models:ChatModel[];archived:boolean;busy:boolean;error:boolean;hasMore:boolean;thai:boolean;sheetOpen?:boolean;
 onOpen:(thread:ChatThread)=>void;onNew:()=>void;onToggleArchived:()=>void;onRename:(thread:ChatThread,title:string)=>Promise<boolean>;onStatus:(thread:ChatThread,status:'active'|'archived')=>void;
 onDelete:(thread:ChatThread)=>Promise<string|null>;deleteBlocked?:(thread:ChatThread)=>boolean;deletePending?:(thread:ChatThread)=>boolean;onMore:()=>void;onRetry:()=>void;onClose:()=>void;closeRef?:React.RefObject<HTMLButtonElement|null>;
}){
 const t=(en:string,th:string)=>thai?th:en;
 const [menu,setMenu]=useState<string|null>(null),[renaming,setRenaming]=useState<string|null>(null),[draft,setDraft]=useState(''),[saving,setSaving]=useState(false);
 const renameInput=useRef<HTMLInputElement|null>(null);
 const swipe=useSyncExternalStore(subscribeCoarse,readCoarse,()=>false);
 const root=useRef<HTMLElement|null>(null),dialog=useRef<HTMLDialogElement|null>(null),cancelDelete=useRef<HTMLButtonElement|null>(null);
 const [confirming,setConfirming]=useState<ChatThread|null>(null),[deleting,setDeleting]=useState(false),[deleteError,setDeleteError]=useState<string|null>(null);
 const dialogTitle=useId(),dialogBody=useId();
 const pressedOpen=useRef(false);
 /** Closes every swiped-open row (but `keep`). */
 const resetStrips=(keep?:Element|null)=>{for(const strip of Array.from(root.current?.querySelectorAll<HTMLElement>('.chat-thread-strip')??[]))if(strip!==keep&&strip.scrollLeft>0)strip.scrollLeft=0};
 // biome-ignore lint/correctness/useExhaustiveDependencies: closing or opening the sheet, switching lists and a rename reset the open row; resetStrips reads the DOM only
 useEffect(()=>{resetStrips()},[sheetOpen,archived,renaming]);
 // A vertical scroll of the list (any scroller around the rows, or the page) closes the open row; a strip's own scroll does not.
 // biome-ignore lint/correctness/useExhaustiveDependencies: bound while the rows are strips; resetStrips reads the DOM only
 useEffect(()=>{if(!swipe)return;const onScroll=(event:Event)=>{if(event.target instanceof Element&&event.target.closest('.chat-thread-strip'))return;resetStrips()};document.addEventListener('scroll',onScroll,true);return()=>document.removeEventListener('scroll',onScroll,true)},[swipe]);
 useEffect(()=>{if(!confirming)return;const node=dialog.current;if(node&&!node.open)node.showModal();cancelDelete.current?.focus()},[confirming]);
 const askDelete=(thread:ChatThread)=>{setMenu(null);resetStrips();setDeleteError(null);setConfirming(thread)};
 const closeDelete=()=>{if(deleting)return;dialog.current?.close();setConfirming(null);setDeleteError(null)};
 // Escape closes the delete confirmation, an open menu or a rename first (capture, before the sheet's own Escape).
 // biome-ignore lint/correctness/useExhaustiveDependencies: bound while one of the three is open; closeDelete reads the current state through the same render
 useEffect(()=>{if(!menu&&!renaming&&!confirming)return;const onEscape=(event:KeyboardEvent)=>{if(event.key!=='Escape')return;event.preventDefault();event.stopPropagation();if(confirming){closeDelete();return}setMenu(null);setRenaming(null)};document.addEventListener('keydown',onEscape,true);return()=>document.removeEventListener('keydown',onEscape,true)},[menu,renaming,confirming,deleting]);
 async function confirmDelete(){
  const target=confirming;if(!target||deleting)return;
  if(deleteBlocked?.(target)){setDeleteError('turn_in_progress');return}
  const index=threads.findIndex(row=>row.id===target.id),neighbour=threads[index+1]?.id??threads[index-1]?.id??null;
  setDeleting(true);setDeleteError(null);
  const code=await onDelete(target);
  setDeleting(false);
  if(code){setDeleteError(code);return}
  dialog.current?.close();setConfirming(null);
  // Focus moves to the next row, else the previous one, else "New chat" (when the list is still on screen).
  requestAnimationFrame(()=>{const list=root.current;if(!list)return;const row=neighbour?list.querySelector<HTMLElement>('[data-thread-id="'+neighbour+'"] .chat-thread-open'):null;(row??list.querySelector<HTMLElement>('.chat-new-in-list'))?.focus()});
 }
 useEffect(()=>{if(renaming)renameInput.current?.focus()},[renaming]);

 useEffect(()=>{if(!menu)return;const close=(event:MouseEvent)=>{if(!(event.target instanceof Element)||!event.target.closest('.chat-thread-menu,.chat-thread-more'))setMenu(null)};document.addEventListener('click',close);return()=>document.removeEventListener('click',close)},[menu]);
 const modelLabel=(id:string)=>models.find(model=>model.id===id)?.label??id;
 const when=(thread:ChatThread)=>{const at=thread.lastMessageAt??thread.createdAt;if(!at)return '';return relativeTime(at,thai)??displayDateWithYear(bangkokDate(at),thai)};
 const trimmed=draft.trim(),validTitle=trimmed.length>0&&[...trimmed].length<=120&&!/[\u0000-\u001f]/u.test(trimmed);
 const rowControls=(thread:ChatThread)=><>
  <button type="button" className="chat-thread-open" aria-current={thread.id===currentId?'true':undefined} onClick={()=>onOpen(thread)}>
   <span className="chat-thread-title">{threadTitle(thread.title,thai)}</span>
   <span className="chat-thread-meta"><span className="chat-model-badge">{modelLabel(thread.model)}</span><span>{when(thread)}</span></span>
  </button>
  <button type="button" className="icon-action chat-thread-more" aria-label={t('More for ','ตัวเลือกเพิ่มเติมของ ')+threadTitle(thread.title,thai)} aria-expanded={menu===thread.id} onClick={()=>{resetStrips();setMenu(value=>value===thread.id?null:thread.id)}}><Icon name="more"/></button>
 </>;
 return <section ref={root} className="chat-threads" aria-label={t('Threads','รายการแชท')}>
  <div className="chat-threads-head">
   <h2>{archived?t('Archived threads','แชทที่เก็บถาวร'):t('Threads','รายการแชท')}</h2>
   <button type="button" className="secondary-button chat-archived-toggle" aria-pressed={archived} onClick={onToggleArchived}>{t('Archived','ดูที่เก็บถาวร')}</button>
   <button ref={closeRef} type="button" className="secondary-button icon-action chat-threads-close" aria-label={t('Close threads','ปิดรายการแชท')} title={t('Close threads','ปิดรายการแชท')} onClick={onClose}><Icon name="close"/></button>
  </div>
  {!archived&&<button type="button" className="secondary-button chat-new chat-new-in-list" onClick={onNew}><Icon name="add"/><span>{t('New chat','แชทใหม่')}</span></button>}
  {error&&<p className="chat-threads-error" role="alert">{t('Threads unavailable.','โหลดรายการแชทไม่ได้')} <button type="button" className="text-action" onClick={onRetry}>{t('Try again','ลองอีกครั้ง')}</button></p>}
  <ul className="chat-thread-list">{threads.map(thread=><li key={thread.id} data-thread-id={thread.id} className={'chat-thread'+(thread.id===currentId?' current':'')+(swipe&&renaming!==thread.id?' swipe':'')}>
   {renaming===thread.id?<form className="chat-thread-rename" onSubmit={async event=>{event.preventDefault();if(!validTitle||saving)return;setSaving(true);const ok=await onRename(thread,trimmed);setSaving(false);if(ok)setRenaming(null)}}>
    <label className="visually-hidden" htmlFor={'chat-rename-'+thread.id}>{t('Thread name','ชื่อแชท')}</label>
    <input id={'chat-rename-'+thread.id} ref={renameInput} value={draft} maxLength={240} onChange={event=>setDraft(event.target.value)}/>
    <button type="submit" className="secondary-button" disabled={!validTitle||saving}>{t('Save','บันทึก')}</button>
    <button type="button" className="secondary-button" onClick={()=>setRenaming(null)}>{t('Cancel','ยกเลิก')}</button>
   </form>:<>
    {swipe?<div className="chat-thread-strip" onScroll={event=>{if(event.currentTarget.scrollLeft>0){setMenu(null);resetStrips(event.currentTarget)}}}>
     {/* A tap on an open row's content only closes it (capture: before the row's own buttons). */}
     {/* Whether the row was open is read when the press starts: focusing the pressed button scrolls the strip back before the click. */}
     <div className="chat-thread-body" onPointerDownCapture={event=>{pressedOpen.current=(event.currentTarget.parentElement?.scrollLeft??0)>4}} onClickCapture={event=>{const strip=event.currentTarget.parentElement,open=pressedOpen.current||(strip?.scrollLeft??0)>4;pressedOpen.current=false;if(strip&&open){event.preventDefault();event.stopPropagation();strip.scrollTo({left:0,behavior:'smooth'})}}}>{rowControls(thread)}</div>
     <button type="button" className="chat-thread-delete" tabIndex={-1} aria-hidden="true" onClick={()=>askDelete(thread)}><Icon name="delete"/>{t('Delete','ลบ')}</button>
    </div>:rowControls(thread)}
    {menu===thread.id&&<div className="chat-thread-menu">
     <button type="button" onClick={()=>{setMenu(null);setDraft(threadTitle(thread.title,thai));setRenaming(thread.id)}}>{t('Rename','เปลี่ยนชื่อ')}</button>
     <button type="button" onClick={()=>{setMenu(null);onStatus(thread,archived?'active':'archived')}}>{archived?t('Unarchive','เลิกเก็บถาวร'):t('Archive','เก็บถาวร')}</button>
     <button type="button" className="chat-thread-menu-delete" onClick={()=>askDelete(thread)}>{t('Delete…','ลบ…')}</button>
    </div>}
   </>}
  </li>)}</ul>
  {!threads.length&&!busy&&!error&&<p className="chat-threads-empty">{archived?t('No archived threads.','ไม่มีแชทที่เก็บถาวร'):t('No threads yet.','ยังไม่มีแชท')}</p>}
  {busy&&<p className="chat-threads-loading" role="status">{t('Loading…','กำลังโหลด…')}</p>}
  {hasMore&&!busy&&<button type="button" className="secondary-button chat-threads-more" onClick={onMore}>{t('Load more threads','โหลดแชทเพิ่ม')}</button>}
  {confirming&&<dialog ref={dialog} className="saved-discard-dialog chat-delete-dialog" aria-labelledby={dialogTitle} aria-describedby={dialogBody} onCancel={event=>{event.preventDefault();closeDelete()}}>
   <h3 id={dialogTitle}>{t('Delete this chat?','ลบแชทนี้หรือไม่')}</h3>
   <p id={dialogBody}>{t(`“${threadTitle(confirming.title,thai)}” will be removed from your chats. This cannot be undone.`,`“${threadTitle(confirming.title,thai)}” จะถูกลบออกจากรายการแชท และกู้คืนไม่ได้`)}{deletePending?.(confirming)&&' '+t('Changes waiting for your confirmation in this chat will be cancelled.','รายการที่รอการยืนยันในแชทนี้จะถูกยกเลิก')}</p>
   {(deleteError||deleteBlocked?.(confirming))&&<p className="chat-delete-error" role="alert">{deleteFailureText(deleteError??'turn_in_progress',thai)}</p>}
   <div className="saved-discard-actions"><button ref={cancelDelete} type="button" className="secondary-button" disabled={deleting} onClick={closeDelete}>{t('Cancel','ยกเลิก')}</button><button type="button" className="destructive-action" disabled={deleting||!!deleteBlocked?.(confirming)} aria-busy={deleting||undefined} onClick={()=>void confirmDelete()}>{t('Delete chat','ลบแชท')}</button></div>
  </dialog>}
 </section>;
}
