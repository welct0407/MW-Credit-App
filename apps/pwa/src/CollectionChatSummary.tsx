import {useEffect,useId} from 'react';
import {Icon} from './Icon';
import {bangkokClock} from './bangkok-clock';
import {displayDate} from './display-date';
import {CHAT_MARK_WINDOW_MS,splitNameForMark} from './chat-seen';

/** R146: one group chat summary as the collection detail carries it (groupChat). */
export type GroupChatSpeaker={role:'borrower'|'partner'|'referrer'|'business'|'other';borrowerId?:string};
export type GroupChat={headline:{th:string;en:string};points:{speaker:GroupChatSpeaker;th:string;en:string}[];lastSpeaker:GroupChatSpeaker;lastMessageAt:string;generatedAt:string;messageCount:number;shared:boolean};

const COLLAPSED_POINTS=2;
/** A list row's name with the chat mark glued to its last word (UX-CHAT-06): the icon never wraps onto a line of its own,
 * so the row keeps its height when the mark clears. A very long last word keeps only its last characters with the icon,
 * cut on grapheme boundaries (splitNameForMark). */
export function NameWithChatMark({name}:{name:string}){
 const [head,tail]=splitNameForMark(name);
 return <>{head}<span className="collection-chat-name-end">{tail}<Icon name="chat" className="collection-chat-mark"/></span></>;
}
/** Bangkok date (YYYY-MM-DD) and exact wall-clock time (HH:MM) of an instant; null when it is not a time. */
function bangkokMoment(value:string){
 const time=Date.parse(value);if(!Number.isFinite(time))return null;
 const local=new Date(time+7*36e5),pad=(n:number)=>String(n).padStart(2,'0');
 return {time,date:local.toISOString().slice(0,10),clock:pad(local.getUTCHours())+':'+pad(local.getUTCMinutes())};
}
/** R146 group chat summary card (collection detail): read-only, plain text, no links. Presentational: the parent owns the
 * data, the expanded state (kept per borrower while the page stays open) and what "shown" records. Hidden without a
 * summary. `now` decides today (time) against another day (date) and the 3-day stale state. */
export function CollectionChatSummary({groupChat,borrowerId,thai,now,expanded,onToggle,onShown}:{groupChat:GroupChat|null|undefined;borrowerId:string;thai:boolean;now:number;expanded:boolean;onToggle:()=>void;onShown?:(lastMessageAt:string)=>void}){
 const t=(en:string,th:string)=>thai?th:en,id=useId(),pointsId=id+'-points',titleId=id+'-title';
 const shownAt=groupChat?.lastMessageAt;
 // The card rendering this version is what clears the list mark (not the row tap).
 // biome-ignore lint/correctness/useExhaustiveDependencies: records once per rendered version; onShown is recreated every render
 useEffect(()=>{if(shownAt)onShown?.(shownAt)},[shownAt,borrowerId]);
 if(!groupChat)return null;
 // If one language is missing the other is shown; never a blank card.
 const pick=(value:{th:string;en:string}|undefined)=>{const th=value?.th?.trim()?value.th:'',en=value?.en?.trim()?value.en:'';return thai?th||en:en||th};
 const speaker=(value:GroupChatSpeaker|undefined)=>value?.role==='borrower'?(value.borrowerId===borrowerId?t('Borrower','ผู้กู้'):t('Other borrower','ผู้กู้อื่น')):value?.role==='partner'?t('Partner','หุ้นส่วน'):value?.role==='referrer'?t('Referrer','ผู้แนะนำ'):value?.role==='business'?'MW Credit':t('Other','อื่น ๆ');
 const today=bangkokClock(new Date(now)).date,when=(value:string)=>{const moment=bangkokMoment(value);return moment?moment.date===today?moment.clock:displayDate(moment.date,thai):'—'};
 const last=bangkokMoment(groupChat.lastMessageAt),stale=!last||now-last.time>CHAT_MARK_WINDOW_MS;
 const points=Array.isArray(groupChat.points)?groupChat.points.slice(0,4).filter(point=>pick(point)):[],visible=expanded?points:points.slice(0,COLLAPSED_POINTS),headline=pick(groupChat.headline);
 return <section className={'collection-chat-summary'+(stale?' stale':'')} aria-labelledby={titleId}>
  <div className="collection-chat-heading"><h3 id={titleId}>{t('Group chat summary','สรุปแชทกลุ่ม')}</h3>{groupChat.shared&&<span className="expense-payee-tag">{t('Shared group','กลุ่มร่วม')}</span>}</div>
  <p className="collection-chat-meta">{stale?t('Last conversation ','คุยล่าสุด ')+(last?displayDate(last.date,thai):'—'):t('Updated ','อัปเดต ')+when(groupChat.generatedAt)+t(' · last 3 days',' · 3 วันล่าสุด')}</p>
  {headline&&<p className="collection-chat-headline">{headline}</p>}
  {points.length>0&&<ul className="collection-chat-points" id={pointsId}>{visible.map((point,index)=><li key={String(index)}><span className="visually-hidden">{speaker(point.speaker)}: </span><span className="expense-payee-tag" aria-hidden="true">{speaker(point.speaker)}</span><span className="collection-chat-text">{pick(point)}</span></li>)}</ul>}
  {/* UX-CHAT-01/02: the last-message line and the expander share one row; a stale card has no last-message line (the
      "Last conversation" line carries the date), so its expander keeps the row to itself. */}
  {((last&&!stale)||points.length>COLLAPSED_POINTS)&&<div className="collection-chat-foot">
   {last&&!stale&&<p className="collection-chat-meta">{t('Last message: ','ข้อความล่าสุด: ')+speaker(groupChat.lastSpeaker)+' · '+when(groupChat.lastMessageAt)}</p>}
   {points.length>COLLAPSED_POINTS&&<button type="button" className="record-field-link collection-chat-toggle" aria-expanded={expanded} aria-controls={pointsId} onClick={onToggle}>{expanded?t('Show less','แสดงน้อยลง'):t('Show more','แสดงเพิ่ม')}</button>}
  </div>}
 </section>;
}
