import React,{useEffect,useRef,useState} from 'react';
import {ManagementWorkspace} from './ManagementWorkspace';
import type {CommandAccess} from './SelectedCharges';
export function ManagementCash({access,thai}:{access:CommandAccess;thai:boolean}){
 const accountsHeading=useRef<HTMLHeadingElement>(null),[holder,setHolder]=useState<{id:string;label:string}|null>(null),t=(en:string,th:string)=>thai?th:en;
 useEffect(()=>{if(holder&&matchMedia('(max-width:1050px)').matches){const frame=requestAnimationFrame(()=>{accountsHeading.current?.focus({preventScroll:true});accountsHeading.current?.scrollIntoView({block:'start',behavior:'auto'})});return()=>cancelAnimationFrame(frame)}},[holder]);
 return <section className="management-cash"><header className="root-record-heading"><h2>{t('Cash Accounts','บัญชีเงินสด')}</h2></header><div className="cash-accounts-layout"><section aria-label={t('Cash Holders','ผู้ถือเงิน')}><ManagementWorkspace access={access} thai={thai} section="cash-holders" selectedHolderId={holder?.id} onChooseHolder={(id,label)=>setHolder({id,label})}/></section><section aria-label={t('Holder accounts','บัญชีของผู้ถือเงิน')}>{holder?<><h3 ref={accountsHeading} tabIndex={-1} className="cash-selected-holder-heading">{holder.label}</h3><ManagementWorkspace key={holder.id} access={access} thai={thai} section="cash-accounts" holderId={holder.id}/></>:<p>{t('Select a cash holder to view accounts.','เลือกผู้ถือเงินเพื่อดูบัญชี')}</p>}</section></div></section>;
}
