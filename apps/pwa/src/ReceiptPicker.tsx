import {Icon} from './Icon';
import {prepareReceiptImage} from './receipt-image';
import React,{useEffect,useRef,useState} from 'react';

/** Presentation only: each form retains its own receipt command and upload state. */
export function ReceiptPicker({thai,attached,image,preview,disabled=false,removeDisabled=disabled,busy=false,onPick,onRemove,onPreparing}:{thai:boolean;attached:boolean;image?:Blob|null;preview?:string|null;disabled?:boolean;removeDisabled?:boolean;busy?:boolean;onPick:(file:File)=>void;onRemove:()=>void;onPreparing?:(preparing:boolean)=>void}){
 const t=(en:string,th:string)=>thai?th:en,input=useRef<HTMLInputElement|null>(null),restoreFocus=useRef(false),pickSequence=useRef(0);
 // Downscaling runs before the form sees the file; a newer pick or a remove discards a stale result.
 const [preparing,setPreparing]=useState(false);
 const finishPreparing=()=>{pickSequence.current++;setPreparing(false);onPreparing?.(false)};
 const [local,setLocal]=useState<{image:Blob;url:string}|null>(null);
 useEffect(()=>{if(!image){setLocal(null);return;}const url=URL.createObjectURL(image);setLocal({image,url});return()=>URL.revokeObjectURL(url)},[image]);
 useEffect(()=>{if(!attached&&restoreFocus.current){restoreFocus.current=false;input.current?.focus({preventScroll:true})}},[attached]);
 const source=preparing?null:image?(local?.image===image?local.url:null):preview;
 return <div className="receipt-control">{attached||preparing?<div className="payment-receipt-slot" aria-busy={busy||preparing}>{source?<img className="payment-receipt-preview" src={source} alt={t('Selected receipt','หลักฐานที่เลือก')}/>:<p className="receipt-preview-placeholder">{busy||preparing?t('Preparing receipt…','กำลังเตรียมหลักฐาน…'):t('Receipt attached','แนบหลักฐานแล้ว')}</p>}<button type="button" className="payment-receipt-remove" disabled={removeDisabled&&!preparing} aria-label={t('Remove receipt','นำหลักฐานออก')} onClick={()=>{restoreFocus.current=true;if(preparing){finishPreparing();return;}onRemove()}}><Icon name="remove-receipt"/></button></div>:<label className="receipt-camera-picker"><span>{t('Receipt (optional PNG/JPEG)','หลักฐาน (PNG/JPEG ไม่บังคับ)')}</span><Icon name="camera"/><input ref={input} type="file" multiple={false} accept="image/png,image/jpeg" disabled={disabled} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;const sequence=++pickSequence.current;setPreparing(true);onPreparing?.(true);void prepareReceiptImage(file).then(prepared=>{if(sequence!==pickSequence.current)return;setPreparing(false);onPreparing?.(false);onPick(prepared)})}}/></label>}</div>;
}
