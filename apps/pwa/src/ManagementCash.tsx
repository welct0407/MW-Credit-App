import React,{useState} from 'react';
import {ManagementWorkspace,type ManagementSection} from './ManagementWorkspace';
import type {CommandAccess} from './SelectedCharges';
const pages=[['cash-position','Cash Position','สถานะเงินสด'],['cash-accounts','Cash Accounts','บัญชีเงินสด'],['cash-holders','Cash Holders','ผู้ถือเงิน'],['cash-movements','Cash Movements','รายการเงินสด']] as const;
export function ManagementCash({access,thai}:{access:CommandAccess;thai:boolean}){
 const [page,setPage]=useState<ManagementSection|null>(null),[holder,setHolder]=useState<{id:string;label:string}|null>(null),t=(en:string,th:string)=>thai?th:en;
 return <section className="management-cash"><header className="related-loans-heading">{page&&<button className="icon-action" aria-label={t('Back to Cash','กลับเมนูเงินสด')} onClick={()=>{setPage(null);setHolder(null)}}>←</button>}<h2>{t('Cash','เงินสด')}{page?' · '+pages.find(p=>p[0]===page)?.[thai?2:1]:''}</h2></header>{!page?<div className="cash-landing">{pages.map(([id,en,th])=><button key={id} onClick={()=>setPage(id)}>{t(en,th)}</button>)}</div>:page==='cash-accounts'?<><div hidden={Boolean(holder)}><ManagementWorkspace access={access} thai={thai} section="cash-holders" active={!holder} onChooseHolder={(id,label)=>setHolder({id,label})}/></div>{holder&&<><h3>{holder.label}</h3><ManagementWorkspace key={holder.id} access={access} thai={thai} section="cash-accounts" holderId={holder.id} onBack={()=>setHolder(null)}/></>}</>:<ManagementWorkspace key={page} access={access} thai={thai} section={page}/>}</section>;
}
