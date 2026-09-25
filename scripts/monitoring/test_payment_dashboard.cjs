const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {addPaymentMonitoring}=require('./payment-dashboard.js');
const root=path.resolve(__dirname,'../..');
const selectors={snapshot:fs.readFileSync(path.join(__dirname,'receipt-pipeline.jq'),'utf8'),trend:fs.readFileSync(path.join(__dirname,'receipt-trend.jq'),'utf8')};
for(const file of ['performance-dashboard.json','performance-editor-resource.json']){
  const input=JSON.parse(fs.readFileSync(path.join(root,'outputs/resource-monitoring-20260922',file),'utf8'));
  const before=JSON.stringify(input),out=addPaymentMonitoring(input,selectors);
  assert.equal(JSON.stringify(input),before,'patch mutated input');
  assert.deepEqual(addPaymentMonitoring(out,selectors),out,'patch not idempotent');
  if(out.spec){
    for(const [key,value] of Object.entries(input.spec.elements)){
      if(value.spec.id<101||value.spec.id>108)assert.deepEqual(out.spec.elements[key],value,'existing panel changed: '+key);
    }
    for(const row of input.spec.layout.spec.rows.filter(r=>!r.spec.title.startsWith('Payment processing')))
      assert.ok(out.spec.layout.spec.rows.some(r=>JSON.stringify(r)===JSON.stringify(row)),'existing row changed');
    const ids=Object.values(out.spec.elements).map(p=>p.spec.id);
    assert.equal(new Set(ids).size,ids.length);
    for(const id of [103,104,105,106,107]){
      const p=out.spec.elements['panel-'+id].spec;
      assert.ok(p.data.spec.queries[0].spec.query.spec.columns.length>=2);
      assert.equal(p.data.spec.transformations.length,0,'must preserve every numeric field');
    }
  }else{
    for(const p of input.panels.filter(p=>p.id<100||p.id>108)){
      const actual=out.panels.find(q=>q.id===p.id);
      assert.deepEqual({...actual,gridPos:p.gridPos},p,'existing panel content changed');
    }
    assert.equal(new Set(out.panels.map(p=>p.id)).size,out.panels.length);
  }
  console.log(file+': preservation, idempotence, unique IDs and stage fields passed');
}
