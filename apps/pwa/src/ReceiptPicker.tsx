import React,{useEffect,useRef,useState} from 'react';

/** Presentation only: each form retains its own receipt command and upload state. */
export function ReceiptPicker({thai,attached,image,preview,disabled=false,removeDisabled=disabled,busy=false,onPick,onRemove}:{thai:boolean;attached:boolean;image?:Blob|null;preview?:string|null;disabled?:boolean;removeDisabled?:boolean;busy?:boolean;onPick:(file:File)=>void;onRemove:()=>void}){
 const t=(en:string,th:string)=>thai?th:en,input=useRef<HTMLInputElement|null>(null),restoreFocus=useRef(false);
 const [local,setLocal]=useState<{image:Blob;url:string}|null>(null);
 useEffect(()=>{if(!image){setLocal(null);return;}const url=URL.createObjectURL(image);setLocal({image,url});return()=>URL.revokeObjectURL(url)},[image]);
 useEffect(()=>{if(!attached&&restoreFocus.current){restoreFocus.current=false;input.current?.focus({preventScroll:true})}},[attached]);
 const source=image?(local?.image===image?local.url:null):preview;
 return <div className="receipt-control">{attached?<div className="payment-receipt-slot" aria-busy={busy}>{source?<img className="payment-receipt-preview" src={source} alt={t('Selected receipt','หลักฐานที่เลือก')}/>:<p className="receipt-preview-placeholder">{busy?t('Preparing receipt…','กำลังเตรียมหลักฐาน…'):t('Receipt attached','แนบหลักฐานแล้ว')}</p>}<button type="button" className="payment-receipt-remove" disabled={removeDisabled} aria-label={t('Remove receipt','นำหลักฐานออก')} onClick={()=>{restoreFocus.current=true;onRemove()}}><span aria-hidden="true">×</span></button></div>:<label className="receipt-camera-picker"><span>{t('Receipt (optional PNG/JPEG)','หลักฐาน (PNG/JPEG ไม่บังคับ)')}</span><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h4l2-3h4l2 3h4v15H4z"/><circle cx="12" cy="13" r="4"/></svg><input ref={input} type="file" multiple={false} accept="image/png,image/jpeg" disabled={disabled} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)onPick(file)}}/></label>}</div>;
}
