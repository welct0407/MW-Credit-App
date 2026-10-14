import React,{useEffect,useRef,useState} from 'react';
import type {CommandAccess} from './SelectedCharges';
import {beginRequest} from './request-activity';
import {useContextRefresh} from './context-refresh';
function ReceiptThumbnail({access,row,source,thai}:{access:CommandAccess;row:any;source:'manual'|'agent';thai:boolean}){
 const [url,setUrl]=useState<string|null>(null),[unavailable,setUnavailable]=useState(false);
 useEffect(()=>{let active=true,created:string|null=null;setUrl(null);setUnavailable(false);if(!row.manualReceiptPresent&&!row.agentReceiptPresent)return;const done=beginRequest(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);void(async()=>{try{const response=await fetch(access.origin+'/api/payment-records/'+encodeURIComponent(row.id)+'/receipt?source='+source,{headers:{Authorization:'Bearer '+await access.token()},signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error'});if(response.status===401||response.status===403)access.authFailure(response.status);if(!response.ok)throw Error();const blob=await response.blob();if(active){created=URL.createObjectURL(blob);setUrl(created)}}catch{if(active)setUnavailable(true)}finally{clearTimeout(timer);done()}})();return()=>{active=false;controller.abort();if(created)URL.revokeObjectURL(created)}},[row.id,row.receiptAt,row.manualReceiptPresent,row.agentReceiptPresent,source]);
 return <span className="collection-receipt-image">{url?<img src={url} alt={thai?'หลักฐานรับชำระ':'Receipt evidence'}/>:unavailable?(thai?'หลักฐานใช้ไม่ได้':'Receipt unavailable'):null}</span>;
}
export function CollectionReceipts({access,borrowerId,businessDate,chargeIds,thai,onOpen}:{access:CommandAccess;borrowerId:string;businessDate:string;chargeIds:string[];thai:boolean;onOpen:(id:string)=>void}){
 const t=(en:string,th:string)=>thai?th:en,[items,setItems]=useState<any[]>([]),[next,setNext]=useState<string|null>(null),[error,setError]=useState(false),[busy,setBusy]=useState(false),generation=useRef(0),retryCursor=useRef<string|undefined>(undefined),active=useRef<AbortController|null>(null),seen=useRef(new Set<string>()),scope=JSON.stringify([borrowerId,businessDate,chargeIds]);
 async function load(cursor?:string){
  if(cursor&&active.current)return;
  active.current?.abort();retryCursor.current=cursor;const current=++generation.current;
  if(!chargeIds.length){setItems([]);setNext(null);return;}
  const done=beginRequest(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);active.current=controller;setBusy(true);setError(false);
  if(!cursor)seen.current.clear();
  try{
   const params=new URLSearchParams({businessDate,chargeIds:JSON.stringify(chargeIds),limit:'25'});if(cursor)params.set('cursor',cursor);
   const collected:any[]=[];const visited=new Set<string>();let value:any;
   do{
    const response=await fetch(access.origin+'/api/borrowers/'+encodeURIComponent(borrowerId)+'/collection-receipts?'+params,{headers:{Authorization:'Bearer '+await access.token()},signal:controller.signal,cache:'no-store',credentials:'omit',redirect:'error'});
    if(response.status===401||response.status===403)access.authFailure(response.status);if(!response.ok)throw Error();value=await response.json();
    collected.push(...value.items.filter((row:any)=>row.manualReceiptPresent||row.agentReceiptPresent));
    if(value.nextCursor){if(seen.current.has(value.nextCursor)||visited.has(value.nextCursor)||value.nextCursor===cursor)throw Error();visited.add(value.nextCursor);params.set('cursor',value.nextCursor);}
   }while(!collected.length&&value.nextCursor);
   if(current!==generation.current)return;
   for(const token of visited)seen.current.add(token);
   setItems(previous=>Array.from(new Map([...(cursor?previous:[]),...collected].map(row=>[row.id,row])).values()));setNext(value.nextCursor??null);
  }catch{if(current===generation.current)setError(true)}finally{clearTimeout(timer);done();if(current===generation.current){active.current=null;setBusy(false)}}
 }
 useEffect(()=>{setItems([]);setNext(null);void load();return()=>{generation.current++;active.current?.abort();active.current=null}},[scope]);
 useContextRefresh(chargeIds.length>0,t('Refresh collection receipts','โหลดหลักฐานงานติดตามใหม่'),()=>void load());
 if(!error&&!items.length)return null;
 return <section aria-label={t('Collection receipts','หลักฐานรับชำระงานติดตาม')}><h3>{t('Receipts','หลักฐานรับชำระ')}</h3>
 <div className="collection-receipt-gallery" onScroll={event=>{const node=event.currentTarget;if(next&&!busy&&!error&&node.scrollWidth-node.clientWidth-node.scrollLeft<80)void load(next)}}>
 {items.flatMap(row=>(['manual','agent'] as const).filter(source=>source==='manual'?row.manualReceiptPresent:row.agentReceiptPresent).map(source=><button type="button" className="collection-receipt-card" key={row.id+':'+source} aria-label={source==='manual'?t('Open uploaded receipt','เปิดหลักฐานที่อัปโหลด'):t('Open agent receipt','เปิดหลักฐานจากระบบ')} onClick={()=>onOpen(row.id)}><ReceiptThumbnail access={access} row={row} source={source} thai={thai}/></button>))}
 </div>
 {error?<p role="alert">{t('Receipts unavailable.','ไม่สามารถโหลดหลักฐาน')}<button type="button" onClick={()=>void load(retryCursor.current)}>{t('Retry receipts','ลองโหลดหลักฐานอีกครั้ง')}</button></p>:next&&<button type="button" disabled={busy} onClick={()=>void load(next)}>{t('Load more receipts','โหลดหลักฐานเพิ่มเติม')}</button>}
 </section>;
}
