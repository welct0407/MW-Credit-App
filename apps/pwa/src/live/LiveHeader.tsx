import type {ManagementSection} from '../ManagementWorkspace';
// APP-ARCH-06: live shell header pieces extracted from live-main.tsx without behaviour change.
export type LiveView='borrowers'|'collection'|'expenses'|'cash'|'dashboard'|'upcoming'|'loans'|'payments'|'management'|'notifications';
type Translate=(en:string,th:string)=>string;
export const managementViews=[{id:'partners',en:'Partners',th:'หุ้นส่วน',icon:'partners'},{id:'cash-accounts',en:'Cash Accounts',th:'บัญชีเงินสด',icon:'accounts'},{id:'cash-position',en:'Cash Position',th:'สถานะเงินสด',icon:'cash-position'},{id:'contributions',en:'Contributions',th:'เงินลงทุน',icon:'contributions'},{id:'settlements',en:'Settlements',th:'การจัดสรรกำไร',icon:'settlements'},{id:'assessments',en:'Loan Assessments',th:'ประเมินสินเชื่อ',icon:'assessments'},{id:'analytics',en:'Analytics',th:'การวิเคราะห์',icon:'analytics'}] as const;
export const workspaceViews = [{id:'dashboard',en:'Dashboard',th:'ภาพรวม',icon:'dashboard',frequent:true},{id:'collection',en:'Collection',th:'งานติดตาม',icon:'collection',frequent:true},{id:'payments',en:'Payments',th:'รับชำระ',icon:'history',frequent:true},{id:'borrowers',en:'Borrowers',th:'ผู้กู้',icon:'borrowers',frequent:true},{id:'expenses',en:'Expenses',th:'ค่าใช้จ่าย',icon:'expenses',frequent:false},{id:'upcoming',en:'Upcoming Charges',th:'รายการเรียกเก็บล่วงหน้า',icon:'upcoming',frequent:false},{id:'cash',en:'Cash',th:'เงินสด',icon:'cash',frequent:false},{id:'management',en:'Management',th:'การจัดการ',icon:'management',frequent:false}] as const;
/** Header title for the current workspace view. */
export function liveTitle(view:LiveView,managementSection:ManagementSection,t:Translate):string{
 return view==='management'?t(managementViews.find(item=>item.id===managementSection)?.en??'Management',managementViews.find(item=>item.id===managementSection)?.th??'การจัดการ'):view==='loans'?t('Loans','สินเชื่อ'):view==='payments'?t('Payments','รับชำระ'):view === 'collection' ? t('Collection', 'งานติดตาม') : view==='expenses'?t('Expenses','ค่าใช้จ่าย'):view==='cash'?t('Cash','เงินสด'):view==='upcoming'?t('Upcoming Charges','รายการเรียกเก็บล่วงหน้า'):view==='notifications'?t('Notifications','การแจ้งเตือน'):view==='dashboard'?t('Dashboard','ภาพรวม'):t('Borrowers', 'ผู้กู้');
}
export function LiveBrand({logo,title,query,alt}:{logo:string;title:string;query:string;alt:string}){
 return <div className="live-brand"><img className="brand-logo" src={logo} alt={alt} /><div><h1 title={title + (query ? ' · ' + query : '')}>{title}{query ? ' · ' + query : ''}</h1></div></div>;
}
