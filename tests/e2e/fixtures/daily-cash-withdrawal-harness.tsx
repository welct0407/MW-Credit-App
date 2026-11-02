// R115 Daily cash withdrawal harness: Cash Position with Dad's synthetic accounts and a real synthetic offline repository.
import{useState}from'react';import{createRoot}from'react-dom/client';
import'../../../apps/pwa/src/style.css';import'../../../apps/pwa/src/live-style.css';
import{ManagementPosition}from'../../../apps/pwa/src/ManagementPosition';
import{ownerOfflineRepository}from'../../../apps/pwa/src/owner-offline';
import{useHeaderBack}from'../../../apps/pwa/src/HeaderBack';
const repo=ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'synthetic-daily-cash-withdrawal'},'synthetic');
const positionData={businessDate:'2026-10-10',holders:[{id:'ch:dad',label:'SYNTHETIC Dad',cashIn:'0',cashOut:'0',currentBalance:'1500',businessCashHeld:'1500',reimbursementDue:null}],
 accounts:[{id:'dad-cash',holderId:'ch:dad',label:'SYNTHETIC Dad เงินสด',initialized:true,currentBalance:'0',openingBalance:'0'},{id:'dad-scb',holderId:'ch:dad',label:'SYNTHETIC Dad SCB',initialized:true,currentBalance:'1000',openingBalance:'0'},{id:'dad-ttb',holderId:'ch:dad',label:'SYNTHETIC Dad TTB',initialized:true,currentBalance:'500',openingBalance:'0'}]};
function App(){const back=useHeaderBack(),[refreshes,setRefreshes]=useState(0),w=window as any;
 const access:any={origin:location.origin,ownerTesting:true,offline:repo,offlineOnly:w.__dcwOffline===true,token:async()=>'synthetic-only',authFailure:()=>{}};
 return <div><header className="topbar">{back&&<button type="button" className="live-menu-toggle has-back" aria-label={back.label} disabled={back.disabled} onClick={back.run}>←</button>}<h1>SYNTHETIC route</h1></header><output id="refreshes">{refreshes}</output><main><ManagementPosition access={access} thai={w.__dcwThai===true} data={positionData} onInitialize={()=>{}} onRefresh={()=>setRefreshes(n=>n+1)}/></main></div>}
void repo.authorize().then(()=>{createRoot(document.getElementById('root')!).render(<App/>);(window as any).__dcwReady=true});
