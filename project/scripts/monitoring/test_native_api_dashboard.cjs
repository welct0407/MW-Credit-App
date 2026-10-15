const assert=require('node:assert/strict'),fs=require('node:fs');
const {patch}=require('./native-api-dashboard.cjs');
for(const format of ['dashboard','editor-resource']){
 const original=JSON.parse(fs.readFileSync('outputs/resource-monitoring-20260922/performance-'+format+'.json'));
 const next=patch(original),v2=!!next.spec;
 const panels=d=>v2?[d.spec.elements['panel-56'].spec,d.spec.elements['panel-57'].spec]:d.panels.filter(p=>[56,57].includes(p.id));
 assert.deepEqual(patch(next),next);
 assert.deepEqual(panels(next).map(p=>p.title),['Native operational API','Native analytical API']);
 const restored=structuredClone(next);panels(restored).forEach((p,i)=>{p.title=panels(original)[i].title;p.description=panels(original)[i].description;});assert.deepEqual(restored,original,'Only two title/description pairs change');
 const wrong=structuredClone(original);if(v2)wrong.metadata.name='other';else wrong.uid='other';assert.throws(()=>patch(wrong));
 const bad=structuredClone(original),p=panels(bad)[0];if(v2)p.data.spec.queries[0].spec.query.datasource.name='other';else p.targets[0].datasource.uid='other';assert.throws(()=>patch(bad));
}
console.log('Native dashboard classic/v2: identity, exact delta, idempotence and datasource refusal passed.');
