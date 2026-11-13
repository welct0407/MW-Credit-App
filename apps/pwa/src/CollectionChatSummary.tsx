import {useEffect,useId} from 'react';
import {Icon} from './Icon';
import {displayDate} from './display-date';
import {CHAT_MARK_WINDOW_MS,splitNameForMark} from './chat-seen';
import {validIgGroupUrl} from './ig-group-url';

/** R146: one group chat summary as the collection detail carries it (groupChat). R153: url, the borrower's group chat
 * link ("IG Group URL", V148), present only when set and readable. */
export type GroupChatSpeaker={role:'borrower'|'partner'|'referrer'|'business'|'other';borrowerId?:string};
export type GroupChat={headline:{th:string;en:string};points:{speaker:GroupChatSpeaker;th:string;en:string}[];lastSpeaker:GroupChatSpeaker;lastMessageAt:string;generatedAt:string;messageCount:number;shared:boolean;url?:string};

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
 * point). The borrower's group chat link, when the summary carries a valid one, is an "Open chat" link (link colour, underline, chat icon) in the heading
 * (also on a stale card), opened in a new tab; the device hands it to the Instagram app where it takes such links. */
export function CollectionChatSummary({groupChat,borrowerId,thai,now,onShown}:{groupChat:GroupChat|null|undefined;borrowerId:string;thai:boolean;now:number;onShown?:(lastMessageAt:string)=>void}){
 const t=(en:string,th:string)=>thai?th:en,titleId=useId()+'-title';
 const shownAt=groupChat?.lastMessageAt;
 // The card rendering this version is what clears the list mark (not the row tap).
 // biome-ignore lint/correctness/useExhaustiveDependencies: records once per rendered version; onShown is recreated every render
 useEffect(()=>{if(shownAt)onShown?.(shownAt)},[shownAt,borrowerId]);
 if(!groupChat)return null;
 // If one language is missing the other is shown; never a blank card.
 const pick=(value:{th:string;en:string}|undefined)=>{const th=value?.th?.trim()?value.th:'',en=value?.en?.trim()?value.en:'';return thai?th||en:en||th};
 const speaker=(value:GroupChatSpeaker|undefined)=>value?.role==='borrower'?(value.borrowerId===borrowerId?t('Borrower','ผู้กู้'):t('Other borrower','ผู้กู้อื่น')):value?.role==='partner'?t('Partner','หุ้นส่วน'):value?.role==='referrer'?t('Referrer','ผู้แนะนำ'):value?.role==='business'?'MW Credit':t('Other','อื่น ๆ');
 const today=localMoment(now)?.date,when=(value:string)=>{const moment=localMoment(value);return moment?moment.date===today?moment.clock:displayDate(moment.date,thai):'—'};
 const last=localMoment(groupChat.lastMessageAt),stale=!last||now-last.time>CHAT_MARK_WINDOW_MS;
 const points=Array.isArray(groupChat.points)?groupChat.points.slice(0,4).filter(point=>pick(point)):[],headline=pick(groupChat.headline);
 const latest=!stale&&points.length>=2?points.length-1:-1,url=validIgGroupUrl(groupChat.url)?groupChat.url:null;
 return <section className={'collection-chat-summary'+(stale?' stale':'')} aria-labelledby={titleId}>
  <div className="collection-chat-heading"><h3 id={titleId}>{t('Group chat summary','สรุปแชทกลุ่ม')}</h3>{groupChat.shared&&<span className="expense-payee-tag">{t('Shared group','กลุ่มร่วม')}</span>}{url&&<a className="collection-chat-open link-button" href={url} target="_blank" rel="noopener noreferrer"><Icon name="chat" className="collection-chat-open-icon"/>{t('Open chat','เปิดแชท')}</a>}</div>
  <p className="collection-chat-meta">{stale?t('Last conversation ','คุยล่าสุด ')+(last?displayDate(last.date,thai):'—'):t('Updated ','อัปเดต ')+when(groupChat.generatedAt)+t(' · last 3 days',' · 3 วันล่าสุด')}</p>
  {headline&&<p className="collection-chat-headline">{headline}</p>}
  {points.length>0&&<ul className="collection-chat-points">{points.map((point,index)=><li key={String(index)} className={index===latest?'collection-chat-latest-point':undefined}><span className="visually-hidden">{speaker(point.speaker)}: </span><span className={'expense-payee-tag '+roleClass(point.speaker,borrowerId)} aria-hidden="true">{speaker(point.speaker)}</span><span className="collection-chat-text">{index===latest?<strong className="collection-chat-latest"><span className="visually-hidden">{t('Latest: ','ล่าสุด: ')}</span>{pick(point)}</strong>:pick(point)}</span></li>)}</ul>}
  {/* UX-CHAT-02: a stale card has no last-message line (the "Last conversation" line carries the date). */}
  {last&&!stale&&<p className="collection-chat-meta collection-chat-last">{t('Last message: ','ข้อความล่าสุด: ')}<span className={'collection-chat-last-role '+roleClass(groupChat.lastSpeaker,borrowerId)}>{speaker(groupChat.lastSpeaker)}</span>{' · '+when(groupChat.lastMessageAt)}</p>}
 </section>;
}
