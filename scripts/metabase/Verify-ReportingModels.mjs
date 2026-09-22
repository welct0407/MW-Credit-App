import {api,assertSource,read,write} from './ReportingApi.mjs';
await assertSource();
const models=read('models.json'),questions=read('model-questions.json'),checks=[];
for(const [key,m] of Object.entries(models)){
 const card=await api('GET','card/'+m.id),result=await api('POST',`card/${m.id}/query`,{});
 const grain={borrowers:'Borrower ID',loans:'Loan ID',repayments:'Repayment ID','borrower-performance':'Borrower',portfolio:'Portfolio ID',daily:'Date'}[key];
 const col=result.data.cols.findIndex(c=>c.name===grain),values=result.data.rows.map(row=>row[col]);
 const ok=card.type==='model'&&result.status==='completed'&&values.every(v=>v!==null)&&new Set(values).size===values.length;
 if(!ok)throw Error('Model grain failure '+key);
 checks.push({model:key,id:m.id,rows:result.row_count,unique_nonnull_grain:true,field_count:result.data.cols.length});
}
for(const q of questions){
 const c=await api('GET','card/'+q.id),s=c.dataset_query.stages;
 if(s?.length!==1||s[0]['source-card']!==models[q.model].id||s[0].joins||s[0].expressions||s[0].native)throw Error('Visual bypasses central model: '+q.key);
}
for(const [id,target] of [[96,72],[113,94]]){const f=await api('GET','field/'+id);if(f.semantic_type!=='type/FK'||f.fk_target_field_id!==target)throw Error('FK metadata mismatch');}
const permissions=await api('GET','collection/graph');
if(permissions.groups['5']['8']!=='read'||permissions.groups['1']?.['8'])throw Error('Unexpected model collection permissions');
const d=await api('GET','dashboard/3');
if(d.dashcards.filter(c=>c.card_id).length!==26||d.dashcards.filter(c=>c.dashboard_tab_id===5&&c.card_id).some(c=>c.parameter_mappings.length!==1))throw Error('Dashboard coverage/filter binding mismatch');
write('model-verification.json',{checked_at:new Date().toISOString(),models:checks,visuals_from_models:questions.length,visual_sql_count:0,visual_join_count:0,visual_business_expression_count:0,relationship_metadata_passed:true,partner_only_collection_permissions:true,dashboard_placements:26});
console.log('Verified six model grains, 22 model-only questions, relationship metadata, partner permissions and 26 placements.');
