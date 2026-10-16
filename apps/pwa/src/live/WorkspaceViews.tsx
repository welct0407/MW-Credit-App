import {Suspense,use} from 'react';
import type {ManagementSection} from '../ManagementWorkspace';
import type {CommandAccess} from '../SelectedCharges';
import {StandaloneRecords} from '../StandaloneRecords';
import {StandaloneUpcoming} from '../StandaloneUpcoming';
import {Dashboard} from '../Dashboard';
import {CashWorkspace} from '../CashWorkspace';
import {ExpenseRecords} from '../ExpenseRecords';
import type {LiveView} from './LiveHeader';
// APP-PERF-01: the management workspace (and ManagementCash, which imports it) loads on first use or on idle.
// One shared import promise for both components; marking it fulfilled lets `use` render synchronously once loaded,
// so switching Cash Accounts <-> other sections never shows a second fallback (W3-UX-PERF-01).
type ManagementModules=[typeof import('../ManagementCash'),typeof import('../ManagementWorkspace')];
let management:(Promise<ManagementModules>&{status?:'fulfilled';value?:ManagementModules})|undefined;
export function loadManagement(){
 if(!management){const loading:Promise<ManagementModules>&{status?:'fulfilled';value?:ManagementModules}=Promise.all([import('../ManagementCash'),import('../ManagementWorkspace')]);management=loading;loading.then(value=>{loading.status='fulfilled';loading.value=value},()=>{if(management===loading)management=undefined});}
 return management;
}
/** Warm the management chunk when the browser is idle (setTimeout where requestIdleCallback is missing). */
export function preloadManagementWhenIdle(){
 const run=()=>{void loadManagement().catch(()=>{})};
 if(typeof requestIdleCallback==='function'){const id=requestIdleCallback(run,{timeout:5000});return()=>cancelIdleCallback(id)}
 const timer=setTimeout(run,2000);return()=>clearTimeout(timer);
}
function ManagementView({section,access,thai}:{section:ManagementSection;access:CommandAccess;thai:boolean}){
 const [{ManagementCash},{ManagementWorkspace}]=use(loadManagement() as Promise<ManagementModules>);
 return section==='cash-accounts'?<ManagementCash access={access} thai={thai}/>:<ManagementWorkspace key={section} section={section} access={access} thai={thai}/>;
}
/**
 * APP-ARCH-06: business workspace view switch extracted from live-main.tsx without behaviour change.
 * Returns null for views the shell renders itself (borrowers, collection, notifications, loans).
 */
export function businessWorkspaceView({view,managementSection,access,thai,query,readOrigin,onLanguage}:{view:LiveView;managementSection:ManagementSection;access:CommandAccess;thai:boolean;query:string;readOrigin:string|undefined;onLanguage:(thai:boolean)=>void}){
 const t=(en:string,th:string)=>thai?th:en;
 return view==='management' ? <Suspense fallback={<p className="live-empty" role="status">{t('Loading…','กำลังโหลด…')}</p>}><ManagementView section={managementSection} access={access} thai={thai}/></Suspense> : view==='payments' ? <StandaloneRecords key={view} access={access} kind="payments" query={query} thai={thai}/> : view==='upcoming' ? <StandaloneUpcoming access={access} thai={thai}/> : view==='dashboard' ? <Dashboard access={access} thai={thai}/> : view==='cash' ? <CashWorkspace access={access} thai={thai} onLanguage={onLanguage}/> : view==='expenses' ? <ExpenseRecords access={access} thai={thai} readOrigin={readOrigin}/> : null;
}
