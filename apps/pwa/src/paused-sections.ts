/** UX-HOLD-08: the header sync status names the sections whose data could not be refreshed
 * (failedDomains from offline-dataset.ts; receipts are never listed there). */
const sectionNames:Record<string,[string,string]>={records:['Borrowers and loans','ผู้กู้และสินเชื่อ'],collection:['Collection','ติดตามชำระ'],cash:['Cash','เงินสด'],management:['Management','การจัดการ'],notifications:['Notifications','การแจ้งเตือน']};
export const pausedSections=(failedDomains:string,thai:boolean)=>failedDomains.split(',').filter(domain=>sectionNames[domain]).map(domain=>sectionNames[domain][thai?1:0]).join(thai?' ':', ');
