import {type KeyboardEvent,type ReactNode,useEffect,useId,useRef,useState} from 'react';
// R140 (owner, 11 November 2026): a borrower type-ahead for the expense form. Results follow the typed text (250 ms debounce,
// stale answers ignored), shown as "Thai - English" with a Referrer tag, referrers first, eight rows until Show more. With
// onFreeText the first row is always "Use “…” as name". Offline it offers only that row and says search needs the network.
// Combobox semantics: arrow keys move, Enter chooses (never submits the form), Escape or a tap outside closes.
export type BorrowerOption={id:string;label?:string|null;description?:string|null;isReferrer?:boolean};
/** "Thai - English": the name and the English description, without the separator when one is missing. */
export const borrowerOptionLabel=(row:BorrowerOption,unnamed:string)=>[row.label,row.description].filter(value=>typeof value==='string'&&value.trim()).map(value=>(value as string).trim()).join(' - ')||unnamed;
/** Referrers first, then by the shown label. */
export const sortBorrowerOptions=(rows:BorrowerOption[],unnamed:string)=>[...rows].sort((a,b)=>Number(!!b.isReferrer)-Number(!!a.isReferrer)||borrowerOptionLabel(a,unnamed).localeCompare(borrowerOptionLabel(b,unnamed)));
export function BorrowerTypeahead({label,thai,disabled,search,onChoose,onFreeText,onOpenChange,online=()=>typeof navigator==='undefined'||navigator.onLine}:{label:string;thai:boolean;disabled?:boolean;onOpenChange?:(open:boolean)=>void;
 search:(query:string,signal:AbortSignal)=>Promise<BorrowerOption[]>;onChoose:(row:BorrowerOption,shown:string)=>void;onFreeText?:(text:string)=>void;online?:()=>boolean}){
 const t=(en:string,th:string)=>thai?th:en,unnamed=t('Unnamed borrower','ไม่ระบุชื่อผู้กู้'),id=useId(),root=useRef<HTMLDivElement|null>(null);
 const [query,setQuery]=useState(''),[results,setResults]=useState<BorrowerOption[]>([]),[open,setOpen]=useState(false),[active,setActive]=useState(-1),[showAll,setShowAll]=useState(false),[busy,setBusy]=useState(false),[offline,setOffline]=useState(false);
 const text=query.trim();
 // biome-ignore lint/correctness/useExhaustiveDependencies: the debounced search follows the typed text only; search and online are recreated every render
 useEffect(()=>{setResults([]);setShowAll(false);setActive(-1);if(!text){setBusy(false);return;}
  if(!online()){setOffline(true);setBusy(false);return;}setOffline(false);
  const controller=new AbortController();setBusy(true);
  const timer=setTimeout(()=>{search(text,controller.signal).then(rows=>{if(!controller.signal.aborted)setResults(Array.isArray(rows)?rows:[])}).catch(()=>{if(!controller.signal.aborted)setResults([])}).finally(()=>{if(!controller.signal.aborted)setBusy(false)})},250);
  return()=>{clearTimeout(timer);controller.abort()};
 },[text]);
 useEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{if(root.current&&!root.current.contains(event.target as Node))setOpen(false)};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[open]);
 const sorted=sortBorrowerOptions(results,unnamed),shown=showAll?sorted:sorted.slice(0,8),more=!showAll&&sorted.length>8;
 type Row={key:string;text:ReactNode;choose:()=>void;className?:string};
 const rows:Row[]=[];
 if(text&&onFreeText)rows.push({key:'free',text:t('Use “'+text+'” as name','ใช้ชื่อ “'+text+'”'),choose:()=>{onFreeText(text);reset()},className:'expense-payee-typed'});
 for(const row of shown){const shownLabel=borrowerOptionLabel(row,unnamed),name=typeof row.label==='string'&&row.label.trim()?row.label.trim():null,english=typeof row.description==='string'&&row.description.trim()?row.description.trim():null;
  // EXP-NEW-23: two lines at most: the name, then the English name smaller; each ends with an ellipsis. The text still reads "Thai - English".
  rows.push({key:'b-'+row.id,text:<><span className="borrower-typeahead-names"><span className="borrower-typeahead-name">{name??english??unnamed}</span>{name&&english&&<><span className="borrower-typeahead-separator"> - </span><span className="borrower-typeahead-description">{english}</span></>}</span>{row.isReferrer&&<small className="expense-payee-tag">{t('Referrer','ผู้แนะนำ')}</small>}</>,choose:()=>{onChoose(row,shownLabel);reset()}});}
 if(more)rows.push({key:'more',text:t('Show more','แสดงเพิ่ม'),choose:()=>{setShowAll(true);setOpen(true)},className:'expense-payee-more'});
 const expanded=open&&!!text&&(rows.length>0||offline||busy);
 // EXP-NEW-17: an opening list brings the field to the top of the visible area (scroll-margin-top clears the header) so its
 // options sit above the keyboard; the form hides its sticky action bar while a list is open.
 // biome-ignore lint/correctness/useExhaustiveDependencies: follows the open state only; onOpenChange is recreated by the parent
 useEffect(()=>{onOpenChange?.(expanded);if(expanded)root.current?.scrollIntoView({block:'start',behavior:'auto'})},[expanded]);
 // biome-ignore lint/correctness/useExhaustiveDependencies: closes the parent's state on unmount only
 useEffect(()=>()=>onOpenChange?.(false),[]);
 function reset(){setQuery('');setResults([]);setOpen(false);setActive(-1);setShowAll(false)}
 function key(event:KeyboardEvent<HTMLInputElement>){
  if(event.key==='Enter'){event.preventDefault();if(expanded&&active>=0&&rows[active])rows[active].choose();return;}
  if(event.key==='Escape'){if(open){event.preventDefault();setOpen(false);setActive(-1)}return;}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){if(!rows.length)return;event.preventDefault();setOpen(true);setActive(index=>event.key==='ArrowDown'?(index+1)%rows.length:(index<=0?rows.length-1:index-1));}
 }
 const optionId=(index:number)=>id+'-option-'+index;
 return <div className="borrower-typeahead" ref={root}>
  <label><span className="field-title">{label}</span><input role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={id+'-list'} aria-activedescendant={expanded&&active>=0?optionId(active):undefined}
   value={query} disabled={disabled} onChange={event=>{setQuery(event.target.value);setOpen(true)}} onFocus={()=>{if(text)setOpen(true)}} onKeyDown={key}/></label>
  {expanded&&<div className="expense-payee-results" role="listbox" id={id+'-list'} aria-label={label}>
   {rows.map((row,index)=><div key={row.key} id={optionId(index)} role="option" tabIndex={-1} aria-selected={index===active} className={'borrower-typeahead-option '+(row.className??'')+(index===active?' active':'')}
    onPointerDown={event=>event.preventDefault()} onClick={()=>row.choose()} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();row.choose()}}}>{row.text}</div>)}
  </div>}
  {expanded&&offline&&<p className="field-help borrower-typeahead-hint">{t('Search needs the network','ค้นหาต้องเชื่อมต่ออินเทอร์เน็ต')}</p>}
  {expanded&&!offline&&busy&&!results.length&&<p className="field-help borrower-typeahead-hint" role="status">{t('Searching…','กำลังค้นหา…')}</p>}
 </div>;
}
