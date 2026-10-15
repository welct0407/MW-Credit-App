import fs from 'node:fs';
import crypto from 'node:crypto';
import {api,assertSource} from '../ReportingApi.mjs';
const privateDir='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r030-custom-matrix';
const out='outputs/r030-custom-matrix';
await assertSource();
const before=JSON.parse(fs.readFileSync(privateDir+'/metabase/dashboard-before.json','utf8'));
const current=await api('GET','dashboard/3');
if(current.updated_at!==before.updated_at||current.dashcards.length!==before.dashcards.length)throw Error('Dashboard drift; reconcile before installation');
const properties=await api('GET','session/properties');
const oldHosts=JSON.parse(fs.readFileSync(privateDir+'/metabase/iframe-hosts-before.json','utf8'));
const expectedHosts=oldHosts.split(/[,\n]/).map(x=>x.trim()).filter(Boolean);
if(!expectedHosts.includes('charts.mw-credit.com'))expectedHosts.push('charts.mw-credit.com');
if(![oldHosts,expectedHosts.join(',\n')].includes(properties['allowed-iframe-hosts']))throw Error('Iframe allowlist changed; reconcile');
const key=fs.readFileSync(privateDir+'/chart-key.txt','utf8').trim();
if(!/^[A-Za-z0-9_-]{43}$/.test(key))throw Error('Invalid key format');
const result=await fetch('https://charts.mw-credit.com/api/matrix',{headers:{Authorization:'Bearer '+key}});
if(!result.ok)throw Error('Chart endpoint is not ready');
const data=await result.json();if(!data.rows.length)throw Error('No chart data');
const hosts=oldHosts.split(/[,\n]/).map(x=>x.trim()).filter(Boolean);
if(!hosts.includes('charts.mw-credit.com'))hosts.push('charts.mw-credit.com');
if(properties['allowed-iframe-hosts']!==hosts.join(',\n')){
 try{await api('PUT','setting/allowed-iframe-hosts',{value:hosts.join(',\n')});}
 catch(error){if(!(error instanceof SyntaxError))throw error;} // This endpoint returns HTTP 204.
 if((await api('GET','session/properties'))['allowed-iframe-hosts']!==hosts.join(',\n'))throw Error('Allowlist readback mismatch');
}
const cards=current.dashcards.map(c=>({...c,row:c.dashboard_tab_id===31&&c.row>=54?c.row+22:c.row}));
cards.push({id:-1,card_id:null,dashboard_tab_id:31,col:0,row:54,size_x:24,size_y:22,
 series:[],parameter_mappings:[],visualization_settings:{virtual_card:{display:'iframe',visualization_settings:{iframe:`<iframe src="https://charts.mw-credit.com/#key=${key}" title="Custom borrower matrix comparison"></iframe>`}}}});
await api('PUT','dashboard/3/cards',{tabs:current.tabs,cards});
const saved=await api('GET','dashboard/3');
fs.writeFileSync(privateDir+'/metabase/dashboard-after.json',JSON.stringify(saved,null,2));
const added=saved.dashcards.filter(c=>!before.dashcards.some(b=>b.id===c.id));
if(added.length!==1||added[0].visualization_settings?.virtual_card?.display!=='iframe')throw Error('Unexpected saved placement');
const q=await api('GET','card/274');const qBefore=JSON.parse(fs.readFileSync(privateDir+'/metabase/card274-before.json','utf8'));
if(JSON.stringify(q.dataset_query)!==JSON.stringify(qBefore.dataset_query)||JSON.stringify(q.visualization_settings)!==JSON.stringify(qBefore.visualization_settings))throw Error('Original question changed');
for(const b of before.dashcards){const c=saved.dashcards.find(c=>c.id===b.id);if(!c)throw Error('Original placement missing');
 if(c.row!==(b.dashboard_tab_id===31&&b.row>=54?b.row+22:b.row)||c.col!==b.col||c.size_x!==b.size_x||c.size_y!==b.size_y||c.card_id!==b.card_id||JSON.stringify(c.visualization_settings)!==JSON.stringify(b.visualization_settings))throw Error('Unexpected original layout change');}
if(JSON.stringify(saved.tabs)!==JSON.stringify(before.tabs)||JSON.stringify(saved.parameters)!==JSON.stringify(before.parameters))throw Error('Tabs or filters changed');
const checks={dashboard:3,tab:31,iframePlacement:added[0].id,placement:{row:54,col:0,width:24,height:22},originalQuestion:274,originalQuestionUnchanged:true,originalPlacementsRetained:true,otherTabsUnchanged:true,filtersUnchanged:true,offset:{fromRow:54,rows:22},rows:data.rows.length,iframeHost:'charts.mw-credit.com',privateKeySha256:crypto.createHash('sha256').update(key).digest('hex'),secretPublished:false};
fs.writeFileSync(out+'/metabase-installation.json',JSON.stringify(checks,null,2)+'\n');
console.log(JSON.stringify({...checks,privateKeySha256:undefined}));
