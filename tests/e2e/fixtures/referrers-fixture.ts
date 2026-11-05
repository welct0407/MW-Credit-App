/**
 * R129 (V137) synthetic Referrers data for the Playwright spec and the UI pass: the command service's three read routes
 * (GET /api/referrers, /api/referrers/:id, /api/rebate-settlements/:id) and the referral rebate expense records they open.
 * Referrer Mai (R-MAI) has one pending rebate, one partly offset (200 offset, 100 pending), one legacy row Lisa paid at
 * close, one earlier settlement and two open referred loans (3,000 and 0 received, custom terms 15% max ฿2,000); referrer
 * Pond (R-POND) is owed nothing. Synthetic names and ids only.
 */
export const REFERRERS_BUSINESS_DATE='2026-11-05';
const terms={rate:15,cap:2000,custom:true};
export const referrerMai={id:'R-MAI',name:'มาย',description:'Mai',terms,referredCount:4,unpaidAmount:'400.00',unpaidCount:2,oldestUnpaidCloseDate:'2026-10-12',accruingAmount:'450.00',accruingLoanCount:2,paidToDate:'750.00',offsetToDate:'200.00'};
export const referrerPond={id:'R-POND',name:'ปอนด์',description:'Pond',terms:{rate:10,cap:1000,custom:false},referredCount:1,unpaidAmount:'0.00',unpaidCount:0,oldestUnpaidCloseDate:null,accruingAmount:'0.00',accruingLoanCount:0,paidToDate:'0.00',offsetToDate:'0.00'};
export const referrerList={items:[referrerMai,referrerPond],businessDate:REFERRERS_BUSINESS_DATE};
export const lisaAccounts=[{id:'ca:lisa-cash',label:'Lisa Cash'},{id:'ca:lisa-scb',label:'Lisa SCB'}];
export const referrerMaiDetail={referrer:referrerMai,
 unpaid:[
  {expenseId:'rr1:L-PEND',loanId:'L-PEND',loanDisplayKey:'นก - Nok-฿10,000-01/09-2%',borrowerLabel:'นก - Nok',closeDate:'2026-10-12',amount:'300.00',offsetAmount:'0.00',pendingAmount:'300.00'},
  {expenseId:'rr1:L-OFF',loanId:'L-OFF',loanDisplayKey:'แก้ว - Kaew-฿5,000-15/09-2%',borrowerLabel:'แก้ว - Kaew',closeDate:'2026-11-01',amount:'300.00',offsetAmount:'200.00',pendingAmount:'100.00'}],
 accruing:[
  {loanId:'L-OPEN1',loanDisplayKey:'ฝน - Fon-฿20,000-01/10-2%',borrowerLabel:'ฝน - Fon',loanDate:'2026-10-01',profitToDate:'3000.00',estimatedRebate:'450.00'},
  {loanId:'L-OPEN2',loanDisplayKey:'ฝน - Fon-฿8,000-01/11-2%',borrowerLabel:'ฝน - Fon',loanDate:'2026-11-01',profitToDate:'0.00',estimatedRebate:'0.00'}],
 history:[
  {kind:'offset',date:'2026-11-01',amount:'200.00',offsetPaymentId:'ro122:pwa:off',offsetLoanLabel:'มาย - Mai-฿3,000-20/10-2%',expenseId:'rr1:L-OFF'},
  {kind:'settlement',date:'2026-10-20',amount:'450.00',settlementId:'c1111111-1111-4111-8111-111111111111',rebateCount:1,accountLabel:'Lisa SCB',paymentMethod:'Bank Transfer',bankReference:'1234'},
  {kind:'paid-at-close',date:'2026-09-30',amount:'300.00',expenseId:'rr1:L-LEG'}],
 settleOptions:{accounts:lisaAccounts,defaultAccountId:'ca:lisa-cash',businessDate:REFERRERS_BUSINESS_DATE}};
export const referrerPondDetail={referrer:referrerPond,unpaid:[],accruing:[],history:[],settleOptions:{accounts:lisaAccounts,defaultAccountId:'ca:lisa-cash',businessDate:REFERRERS_BUSINESS_DATE}};
export const settlementS1={item:{id:'c1111111-1111-4111-8111-111111111111',referrerId:'R-MAI',referrerLabel:'มาย - Mai',settlementDate:'2026-10-20',amount:'450.00',accountId:'ca:lisa-scb',accountLabel:'Lisa SCB',paymentMethod:'Bank Transfer',bankReference:'1234',notes:null,createdBy:'owner@example.invalid',createdAt:'2026-10-20T03:00:00.000Z',version:'d'.repeat(64),
 rebates:[{expenseId:'rr1:L-PAID',loanDisplayKey:'ต้น - Ton-฿9,000-01/08-2%',borrowerLabel:'ต้น - Ton',closeDate:'2026-10-15',amount:'450.00',offsetAmount:'0.00',paidAmount:'450.00'}]}};
const expense=(id:string,over:Record<string,unknown>)=>({id,expenseDate:'2026-10-12',category:'Referral Rebate / เงินคืนค่าแนะนำลูกค้า',amount:'300.00',payeeName:'มาย',payeeBorrowerId:'R-MAI',payeeBorrowerLabel:'มาย - Mai',relatedBorrowerId:'B-'+id,relatedBorrowerLabel:'Synthetic referred',relatedLoanId:id.slice(4),relatedLoanLabel:null,notes:null,paidByAccountId:'ca:lisa-cash',paidByAccountLabel:'Lisa Cash',paidByHolderId:'ch:lisa',paidByHolderLabel:'Lisa',sourceType:'Referral Rebate',sourceKey:'REFERRAL_REBATE:'+id.slice(4),grossProfitBasis:'3000.00',allocationBasis:'Closing Date Contribution Ratio',partnerAShare:'0.5',partnerBShare:'0.5',partnerAExpense:'150.00',partnerBExpense:'150.00',ruleVersion:'REFERRAL_REBATE_V3',rebateRate:10,rebateCap:1000,createdAt:'2026-10-12 10:00:00',createdBy:'SQL:loan-close',offsetPaymentId:null,offsetAmount:null,offsetLoanId:null,offsetLoanLabel:null,payableAmount:null,canEdit:false,canDelete:false,version:'e'.repeat(64),reimbursements:[],
 rebateState:'pending',pendingAmount:'300.00',settlementId:null,settlementDate:null,...over});
/** The referral rebate expense records the pages open, one per state (pending, offset remainder, paid, legacy). */
export const rebateExpenses:Record<string,any>={
 'rr1:L-PEND':expense('rr1:L-PEND',{}),
 'rr1:L-OFF':expense('rr1:L-OFF',{expenseDate:'2026-11-01',offsetPaymentId:'ro122:pwa:off',offsetAmount:'200.00',offsetLoanId:'L-MAI',offsetLoanLabel:'มาย - Mai-฿3,000-20/10-2%',payableAmount:'100.00',pendingAmount:'100.00'}),
 'rr1:L-PAID':expense('rr1:L-PAID',{expenseDate:'2026-10-15',amount:'450.00',rebateState:'paid',pendingAmount:'0.00',settlementId:'c1111111-1111-4111-8111-111111111111',settlementDate:'2026-10-20'}),
 'rr1:L-LEG':expense('rr1:L-LEG',{expenseDate:'2026-09-30',ruleVersion:'REFERRAL_REBATE_V2',rebateState:'paid-at-close',pendingAmount:'0.00',reimbursements:[{id:'cash:EXPENSE:rr1:L-LEG',movementDate:'2026-09-30',movementType:'Business Expense',amount:'300.00',entryOrigin:'System',fromAccountLabel:'Lisa Cash',toAccountLabel:null}]}),
};
/** The response a command-service GET answers with for an R129 route, or null for any other path. */
export function referrerRoute(path:string):{status:number;body:any}|null{
 const ok=(body:any)=>({status:200,body:{ok:true,...body}}),missing={status:404,body:{ok:false,code:'not_found'}};
 if(path==='/api/referrers')return ok(referrerList);
 const referrer=/^\/api\/referrers\/([^/]+)$/.exec(path);if(referrer){const id=decodeURIComponent(referrer[1]);return id==='R-MAI'?ok(referrerMaiDetail):id==='R-POND'?ok(referrerPondDetail):missing;}
 const settlement=/^\/api\/rebate-settlements\/([^/]+)$/.exec(path);if(settlement)return decodeURIComponent(settlement[1])===settlementS1.item.id?ok(settlementS1):missing;
 const record=/^\/api\/expense-records\/([^/]+)$/.exec(path);if(record&&rebateExpenses[decodeURIComponent(record[1])])return ok({item:rebateExpenses[decodeURIComponent(record[1])]});
 return null;
}
