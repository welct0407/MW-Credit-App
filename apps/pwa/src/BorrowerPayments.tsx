import React,{useState} from 'react';
import {PaymentGroups,type PaymentTree} from './PaymentGroups';
import {useContextRefresh} from './context-refresh';
import {PaymentRecord} from './PaymentRecord';
import type {CommandAccess} from './SelectedCharges';
export function BorrowerPayments({access,borrowerId,label,thai,onBack}:{access:CommandAccess;borrowerId:string;label:string;thai:boolean;onBack:()=>void}){
 const [selected,setSelected]=useState<string|null>(null),[epoch,setEpoch]=useState(0),[tree,setTree]=useState<PaymentTree>(()=>({[JSON.stringify([borrowerId,'months'])]:{open:true,items:[],next:null,page:0,cursors:[undefined],busy:false,error:false}}));
 useContextRefresh(!selected,thai?'รีเฟรชประวัติรับชำระ':'Refresh payment history',()=>setEpoch(value=>value+1));
 if(selected)return <PaymentRecord access={access} id={selected} thai={thai} onBack={()=>{setSelected(null);setEpoch(value=>value+1)}}/>;
 return <section className="borrower-payment-history payment-directory" aria-label={thai?'ประวัติรับชำระ':'Payment history'}><div className="related-loans-heading root-record-heading"><button className="icon-action" aria-label={thai?'กลับรายละเอียดผู้กู้':'Back to borrower summary'} onClick={onBack}>←</button><h2>{label}</h2></div><PaymentGroups hideBorrowerHeading access={access} query="" items={[{borrowerId,borrowerDisplayName:label}]} epoch={epoch} tree={tree} setTree={setTree} onOpen={setSelected} thai={thai}/></section>;
}
