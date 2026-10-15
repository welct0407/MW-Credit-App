// Run with the bundled Node runtime; pass an official jq executable as argv[2].
const {spawnSync}=require('node:child_process');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
const selector=readFileSync(path.join(__dirname,'openai-status.jq'),'utf8');
const base={summary:{id:'01JMDK9XYNY6RXSED6SDWW50WY',name:'OpenAI',structure:{items:[{group:{name:'ChatGPT',components:[{component_id:'chat',name:'Conversations'}]}},{group:{name:'Codex',components:[{component_id:'code',name:'CLI'}]}}]},affected_components:[],ongoing_incidents:[]}};
let checks=0;
function run(mutate=()=>{}){const d=structuredClone(base);mutate(d.summary);const r=spawnSync(process.argv[2]||'jq',['-c',selector],{input:JSON.stringify(d),encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim().split('\n').map(JSON.parse);}
function test(name,fn){fn();checks++;console.log('PASS '+name);}
function incident(id='example',component='chat'){return {id,name:'Example incident '+id,status:'investigating',published_at:'2026-09-24T10:00:00Z',affected_components:[{component_id:component,status:'degraded_performance'}],updates:[{published_at:'2026-09-24T10:15:00.123Z',message_string:'Investigating elevated errors.'}]};}
test('healthy products and current Singapore check time',()=>{for(const r of run()){assert.equal(r.status,1);assert.equal(r.value,0);assert.match(r.details,/No active incident reported/);assert.match(r.details,/Checked: .* SGT/);}});
test('active incident affects only its own product',()=>{const r=run(s=>s.ongoing_incidents.push(incident()));assert.equal(r[0].status,2);assert.equal(r[0].value,1);assert.equal(r[1].status,1);assert.match(r[0].details,/18:15 SGT/);assert.match(r[0].details,/Investigating elevated errors/);assert.equal(r[0].url,'https://status.openai.com/incidents/example');});
test('resolved historical incident does not degrade product',()=>{const r=run(s=>s.ongoing_incidents.push({...incident(),status:'resolved'}));assert.equal(r[0].status,1);assert.doesNotMatch(r[0].details,/Example incident/);});
test('multiple incidents retained separately and latest update wins',()=>{const r=run(s=>{const i=incident('one');i.updates.unshift({published_at:'2026-09-24T09:00:00Z',message_string:'Old message'});s.ongoing_incidents.push(i,incident('two'));});assert.match(r[0].details,/Example incident one/);assert.match(r[0].details,/\n\nExample incident (one|two)/);assert.doesNotMatch(r[0].details,/Old message/);});
test('full outage is red and alertable',()=>{const r=run(s=>s.affected_components.push({component_id:'code',status:'full_outage'}));assert.equal(r[1].status,0);assert.equal(r[1].value,1);});
test('degraded without explanation stays degraded',()=>{const r=run(s=>s.affected_components.push({component_id:'chat',status:'partial_outage'}));assert.equal(r[0].status,2);assert.match(r[0].details,/No incident explanation published yet/);});
test('unknown status fails closed to Unknown',()=>{const r=run(s=>s.affected_components.push({component_id:'chat',status:'new_unrecognized_status'}));assert.equal(r[0].status,4);assert.equal(r[0].value,0);});
test('wrong site rejected',()=>{for(const r of run(s=>s.id='wrong'))assert.equal(r.status,4);});
test('missing product rejected',()=>{const r=run(s=>s.structure.items.pop());assert.equal(r[1].status,4);});
test('missing incident array rejected',()=>{for(const r of run(s=>delete s.ongoing_incidents))assert.equal(r.status,4);});
test('incident without component binding rejected',()=>{for(const r of run(s=>s.ongoing_incidents.push({...incident(),affected_components:[]})))assert.equal(r.status,4);});
console.log(JSON.stringify({passed:checks}));
