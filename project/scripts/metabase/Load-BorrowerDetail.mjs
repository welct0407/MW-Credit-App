// One bounded realistic dashboard burst; result rows remain in memory only.
import fs from 'node:fs';
import {api} from './ReportingApi.mjs';
import {specs,read,save,priv,parameters} from './BorrowerPages.mjs';
const s=read('metabase-state'),d=await api('GET','dashboard/3');
const pick=await api('POST',`card/${s.cards['p-comparison']}/query`,{});
const ix=pick.data.cols.findIndex(c=>c.name==='Borrower ID');const id=pick.data.rows[0][ix];
const checks=await Promise.all(specs.filter(x=>x.page==='detail').map(async x=>{
 const dc=d.dashcards.find(c=>c.card_id===s.cards[x.key]);
 const ps=parameters(s).filter(p=>dc.parameter_mappings.some(m=>m.parameter_id===p.id)).map(p=>({id:p.id,type:p.type,value:p.id==='bd-borrower'?[id]:p.default})).filter(p=>p.value!==undefined);
 const at=Date.now();try{const r=await api('POST',`dashboard/3/dashcard/${dc.id}/card/${dc.card_id}/query`,{parameters:ps,ignore_cache:true});
 if(r.status!=='completed')fs.writeFileSync(priv+'/load-'+x.key+'.json',JSON.stringify(r));
 return {key:x.key,status:r.status,wallMs:Date.now()-at,runningMs:r.running_time,error:r.error??null};
 }catch(e){return {key:x.key,status:'transport error',wallMs:Date.now()-at,error:String(e).slice(0,150)};}
}));
save('detail-load-check',{at:new Date().toISOString(),checks,passed:checks.every(c=>c.status==='completed')});console.log(JSON.stringify(checks));
