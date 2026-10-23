import type React from 'react';
import {useLayoutEffect,useRef} from 'react';
import {Icon} from '../Icon';
import {MAX_TEXT,COUNTER_FROM} from './chat-text';

// R090 composer (design §6.2): 1 to 4,000 characters with a counter past 3,500. On a wide screen with a fine
// pointer Enter sends and Shift+Enter inserts a line break; elsewhere Enter is a line break and the button sends.
const length=(text:string)=>[...text].length;
export const sendable=(text:string)=>text.trim().length>0&&length(text)<=MAX_TEXT&&!/[\u0000-\u0008\u000b-\u001f]/u.test(text);
export function ChatComposer({value,onChange,onSend,disabled,note,thai,inputRef}:{value:string;onChange:(value:string)=>void;onSend:()=>void;disabled:boolean;note?:string|null;thai:boolean;inputRef?:React.RefObject<HTMLTextAreaElement|null>}){
 const t=(en:string,th:string)=>thai?th:en,own=useRef<HTMLTextAreaElement|null>(null),area=inputRef??own,count=length(value);
 // Grow with the text up to about six lines, then scroll inside the box.
 // biome-ignore lint/correctness/useExhaustiveDependencies: the height follows the value.
 useLayoutEffect(()=>{const node=area.current;if(!node)return;node.style.height='auto';node.style.height=Math.min(node.scrollHeight,160)+'px'},[value]);
 const ready=!disabled&&sendable(value);
 return <form className="chat-composer" aria-label={t('Message composer','ช่องพิมพ์ข้อความ')} onSubmit={event=>{event.preventDefault();if(ready)onSend()}}>
  {note&&<p className="chat-composer-note" role="status">{note}</p>}
  <div className="chat-composer-row">
   <label className="visually-hidden" htmlFor="chat-composer-input">{t('Message','ข้อความ')}</label>
   <textarea id="chat-composer-input" ref={area} rows={1} value={value} disabled={disabled} maxLength={MAX_TEXT*2} placeholder={t('Ask about loans, payments, cash…','ถามเรื่องสินเชื่อ ยอดชำระ…')} aria-describedby={count>COUNTER_FROM?'chat-composer-count':undefined}
    onChange={event=>onChange(event.target.value)}
    onKeyDown={event=>{if(event.key!=='Enter'||event.shiftKey||event.nativeEvent.isComposing)return;if(!matchMedia('(min-width:1051px) and (pointer:fine)').matches)return;event.preventDefault();if(ready)onSend()}}/>
   <button type="submit" className="chat-send" disabled={!ready} aria-label={t('Send','ส่ง')} title={t('Send','ส่ง')}><Icon name="send"/></button>
  </div>
  {count>COUNTER_FROM&&<p id="chat-composer-count" className={'chat-composer-count'+(count>MAX_TEXT?' over':'')}>{count.toLocaleString('en-US')} / {MAX_TEXT.toLocaleString('en-US')}</p>}
 </form>;
}
