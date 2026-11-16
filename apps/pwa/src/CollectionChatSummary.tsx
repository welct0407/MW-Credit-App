import {useEffect,useId,useRef,useState} from 'react';
import {Icon} from './Icon';
import {displayDate} from './display-date';
import {CHAT_MARK_WINDOW_MS,splitNameForMark} from './chat-seen';
import {CHAT_REFRESH_POLL_MS,mergeRefresh,refreshObservable,refreshPending,refreshPhase,refreshRemaining,refreshTexts,requestChatRefresh,type ChatRefreshAccess,type GroupChatRefresh} from './chat-refresh';

/** R146: one group chat summary as the collection detail carries it (groupChat). R158: without the group links (the
 * Collection page header opens the group from the collection item's chatUrl/chatInviteUrl). */
export type GroupChatSpeaker={role:'borrower'|'partner'|'referrer'|'business'|'other';borrowerId?:string};
export type GroupChat={headline:{th:string;en:string};points:{speaker:GroupChatSpeaker;th:string;en:string}[];lastSpeaker:GroupChatSpeaker;lastMessageAt:string;generatedAt:string;messageCount:number;shared:boolean};

/** A list row's name with the chat mark glued to its last word (UX-CHAT-06): the icon never wraps onto a line of its own,
 * so the row keeps its height when the mark clears. A very long last word keeps only its last characters with the icon,
 * cut on grapheme boundaries (splitNameForMark). */
export function NameWithChatMark({name}:{name:string}){
 const [head,tail]=splitNameForMark(name);
 return <>{head}<span className="collection-chat-name-end">{tail}<Icon name="chat" className="collection-chat-mark"/></span></>;
}
/** R150: the date (YYYY-MM-DD) and exact wall-clock time (HH:MM, 24-hour) of an instant in the browser's own time zone
 * (the card shows chat times where the reader is, not Bangkok business time); null when it is not a time. */
function localMoment(value:string|number){
 const time=typeof value==='number'?value:Date.parse(value);if(!Number.isFinite(time))return null;
 const local=new Date(time),pad=(n:number,width=2)=>String(n).padStart(width,'0');
 return {time,date:pad(local.getFullYear(),4)+'-'+pad(local.getMonth()+1)+'-'+pad(local.getDate()),clock:pad(local.getHours())+':'+pad(local.getMinutes())};
}
/** R150: the colour class of a speaker's role (live-style.css: one custom property per role). The label always
 * accompanies it, so the role is never told by colour alone. */
const roleClass=(value:GroupChatSpeaker|undefined,borrowerId:string)=>'chat-role chat-role-'+(value?.role==='borrower'?(value.borrowerId===borrowerId?'borrower':'other-borrower'):value?.role==='partner'||value?.role==='referrer'||value?.role==='business'?value.role:'other');
/** R146 group chat summary card (collection detail): read-only, plain text; the summary text never becomes a link.
 * Presentational: the parent owns the data and what "shown" records. Hidden without a summary. R150: everything is always
 * shown (headline, up to four points, the last-message line; no expander). `now` decides today (time) against another
 * day (date), judged in the browser's time zone, and the 3-day stale state.
 * R153 (owner, 13 November 2026): the points come oldest first (prompt v4), so on a current card with two or more points
 * the last one, the latest topic, is bold with an accent bar on its left (not weight alone, which Thai shows weakly) and
 * a hidden "Latest:" for screen readers (not on a stale card or a lone
 * point). R158 (owner, 14 November 2026): the "Open chat" link moved out of the card to the Collection page header
 * (CollectionRecords), shown with or without a summary. */
/** R165: what the card needs for its Refresh button. access: the command service (null: no button); server: the detail's
 * groupChatRefresh; online: useOnline() and not offline-only work; poll: refresh the open detail (a delta check); send: the
 * request (the synthetic preview answers locally). */
export type ChatRefreshProps={access:ChatRefreshAccess|null;server:GroupChatRefresh|null|undefined;online:boolean;poll:()=>void;send?:typeof requestChatRefresh};
/** R165 (owner, 16 November 2026; Echo's UX 01-16, visual option A): a 44x44 icon-only Refresh button at the right of the
 * heading row, on current and stale cards alike. A tap asks the command service; while the request is pending (no
 * completedAt, within 6 minutes) the button shows the spinner and stays focusable (aria-disabled, taps ignored), the meta
 * line says it is refreshing and the old summary stays readable; the open detail is refreshed every 15 seconds. The
 * outcome of the request this page view tapped or saw open is shown until the page is left: stored, the normal Updated
 * line; unchanged, "No new messages · checked HH:MM"; failed or no_group, "Couldn't refresh ..." with a retry title;
 * cleared, the card goes. Offline the button is disabled; a pending request keeps its state and is checked again when the
 * device is back online. Focus never moves; one polite live region announces the start and the final outcome. */
export function CollectionChatSummary({groupChat,borrowerId,thai,now,onShown,refresh}:{groupChat:GroupChat|null|undefined;borrowerId:string;thai:boolean;now:number;onShown?:(lastMessageAt:string)=>void;refresh?:ChatRefreshProps}){
 const t=(en:string,th:string)=>thai?th:en,titleId=useId()+'-title';
 const shownAt=groupChat?.lastMessageAt;
 // The card rendering this version is what clears the list mark (not the row tap).
 // biome-ignore lint/correctness/useExhaustiveDependencies: records once per rendered version; onShown is recreated every render
 useEffect(()=>{if(shownAt)onShown?.(shownAt)},[shownAt,borrowerId]);
 // R165: the page view's own memory of the refresh (the card is keyed by borrower, so leaving the borrower forgets it).
 // seen: the request this view tapped or saw open, and the device time it did (the 6-minute wait runs from it, so a
 // device clock that differs from the server's neither stretches nor skips the wait).
 const [local,setLocal]=useState<GroupChatRefresh|null>(null),[seen,setSeen]=useState<{requestedAt:string;at:number}|null>(null);
 const [tapFailed,setTapFailed]=useState(false),[sending,setSending]=useState(false),[tick,setTick]=useState(()=>Date.now());
 const mounted=useRef(true),poll=useRef(refresh?.poll);poll.current=refresh?.poll;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 // The refresh runs on the device clock (the card's `now` may be a fixed preview time); tick re-renders it on schedule.
 const at=Math.max(tick,Date.now()),current=mergeRefresh(refresh?.server,local),requestedAt=current?.requestedAt??null;
 const watched=seen?.requestedAt??null,seenAt=seen&&requestedAt!==null&&Date.parse(seen.requestedAt)===Date.parse(requestedAt)?seen.at:null;
 const pending=refreshPending(current,at,seenAt),open=current?.completedAt===null;
 // A request seen open in this view (tapped here or on another device) is the one whose outcome this view shows.
 // biome-ignore lint/correctness/useExhaustiveDependencies: runs per open request; current is read for its age only
 useEffect(()=>{if(open&&requestedAt&&refreshObservable(current,Date.now()))setSeen(value=>value&&Date.parse(value.requestedAt)===Date.parse(requestedAt)?value:{requestedAt,at:Date.now()})},[open,requestedAt]);
 // While pending: re-check the open detail every 15 seconds (online and visible only), once more on coming back online,
 // and wake at the 6-minute cutoff to show the timeout.
 // biome-ignore lint/correctness/useExhaustiveDependencies: restarts per pending request (requestedAt); current is read for its cutoff only
 useEffect(()=>{
  if(!pending)return;
  const check=()=>{setTick(Date.now());if(navigator.onLine&&document.visibilityState!=='hidden')poll.current?.()};
  const interval=setInterval(check,CHAT_REFRESH_POLL_MS),cutoff=setTimeout(()=>setTick(Date.now()),refreshRemaining(current,Date.now(),seenAt)+50);
  window.addEventListener('online',check);
  return()=>{clearInterval(interval);clearTimeout(cutoff);window.removeEventListener('online',check)};
 },[pending,requestedAt,seenAt]);
 const busy=pending||sending,online=!!refresh?.online;
 async function tap(){
  // UX 03/14: a pending request ignores taps (the button keeps focus); offline the button is disabled.
  if(!refresh?.access||busy||!online)return;
  setSending(true);setTapFailed(false);
  const result=await (refresh.send??requestChatRefresh)(refresh.access,borrowerId);
  if(!mounted.current)return;
  setSending(false);setTick(Date.now());
  // The tap's own device time anchors its wait (a recent answer is already complete).
  if(result.ok){setLocal(result.state);setSeen({requestedAt:result.state.requestedAt,at:Date.now()});if(result.kind!=='recent')poll.current?.()}else setTapFailed(true);
 }
 const phase=sending?'pending':refreshPhase(current,watched,at,tapFailed,seenAt);
 const completed=current?.completedAt?localMoment(current.completedAt)?.clock??'':'';
 const texts=refreshTexts(phase,thai,online,completed);
 // UX 10: a cleared summary takes the card away.
 if(!groupChat||phase==='cleared')return null;
 // If one language is missing the other is shown; never a blank card.
 const pick=(value:{th:string;en:string}|undefined)=>{const th=value?.th?.trim()?value.th:'',en=value?.en?.trim()?value.en:'';return thai?th||en:en||th};
 const speaker=(value:GroupChatSpeaker|undefined)=>value?.role==='borrower'?(value.borrowerId===borrowerId?t('Borrower','ผู้กู้'):t('Other borrower','ผู้กู้อื่น')):value?.role==='partner'?t('Partner','หุ้นส่วน'):value?.role==='referrer'?t('Referrer','ผู้แนะนำ'):value?.role==='business'?'MW Credit':t('Other','อื่น ๆ');
 const today=localMoment(now)?.date,when=(value:string)=>{const moment=localMoment(value);return moment?moment.date===today?moment.clock:displayDate(moment.date,thai):'—'};
 const last=localMoment(groupChat.lastMessageAt),stale=!last||now-last.time>CHAT_MARK_WINDOW_MS;
 const points=Array.isArray(groupChat.points)?groupChat.points.slice(0,4).filter(point=>pick(point)):[],headline=pick(groupChat.headline);
 const latest=!stale&&points.length>=2?points.length-1:-1;
 return <section className={'collection-chat-summary'+(stale?' stale':'')} aria-labelledby={titleId}>
  {/* R165 UX 03/04: the title and tag wrap inside their own box; the 44px button keeps the right of the row. */}
  <div className="collection-chat-heading"><div className="collection-chat-title"><h3 id={titleId}>{t('Group chat summary','สรุปแชทกลุ่ม')}</h3>{groupChat.shared&&<span className="expense-payee-tag">{t('Shared group','กลุ่มร่วม')}</span>}</div>
   {refresh?.access&&<button type="button" className="secondary-button icon-action collection-chat-refresh" aria-label={texts.label} title={texts.title} aria-disabled={busy?'true':undefined} disabled={!busy&&!online} onClick={()=>void tap()}>{busy?<span className="collection-spinner" aria-hidden="true"></span>:<Icon name="refresh"/>}</button>}</div>
  {/* UX 16: one polite region; it is filled at the start and with the final outcome only. */}
  {refresh?.access&&<p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{texts.announce}</p>}
  {/* UX 06/08/10/12/13: a refresh state takes the meta line's place; the summary below stays as it is (UX 07, 11). */}
  {texts.meta?<p className="collection-chat-meta collection-chat-refresh-status">{texts.meta}</p>:<p className="collection-chat-meta">{stale?t('Last conversation ','คุยล่าสุด ')+(last?displayDate(last.date,thai):'—'):t('Updated ','อัปเดต ')+when(groupChat.generatedAt)+t(' · last 3 days',' · 3 วันล่าสุด')}</p>}
  {headline&&<p className="collection-chat-headline">{headline}</p>}
  {points.length>0&&<ul className="collection-chat-points">{points.map((point,index)=><li key={String(index)} className={index===latest?'collection-chat-latest-point':undefined}><span className="visually-hidden">{speaker(point.speaker)}: </span><span className={'expense-payee-tag '+roleClass(point.speaker,borrowerId)} aria-hidden="true">{speaker(point.speaker)}</span><span className="collection-chat-text">{index===latest?<strong className="collection-chat-latest"><span className="visually-hidden">{t('Latest: ','ล่าสุด: ')}</span>{pick(point)}</strong>:pick(point)}</span></li>)}</ul>}
  {/* UX-CHAT-02: a stale card has no last-message line (the "Last conversation" line carries the date). */}
  {last&&!stale&&<p className="collection-chat-meta collection-chat-last">{t('Last message: ','ข้อความล่าสุด: ')}<span className={'collection-chat-last-role '+roleClass(groupChat.lastSpeaker,borrowerId)}>{speaker(groupChat.lastSpeaker)}</span>{' · '+when(groupChat.lastMessageAt)}</p>}
 </section>;
}
