import {HeaderBack} from './HeaderBack';
import {displayDate} from './display-date';
import {CompactPager} from './CompactPager';
import { ErrorReference, type ReadFailure } from './ReadFailure';
import React from 'react';

export type LoanRecord = {
  id: string; borrowerId: string; borrowerDisplayName: string; originalDailyInterestRate: string | null; loanDate: string | null; dueDate: string | null; closeDate: string | null;
  loanType: string | null; status: string | null; principalAmount: string | null; outstandingPrincipal: string | null;
  totalPrincipalReceived: string | null; totalInterestReceived: string | null; totalAmountReceived: string | null;
  defaulted: boolean | null; autoChargeEnabled: boolean | null;
  /** R109: absent in a response cached before R109. */
  defaultLossAmount?: string | null;
  /** R110: the latest fully paid charge dated after today (borrower detail list only; absent elsewhere). */
  paidThrough?: string | null;
};
export type LoanPageResult = { ok: true; source: 'dev'; borrowerId: string; items: LoanRecord[]; nextCursor: string | null; asOf: string };
export type LoanDetailResult = { ok: true; source: 'dev'; item: LoanRecord; asOf: string };
type Props = {
  thai: boolean; page: number; items: LoanRecord[]; selected: LoanRecord | null; busy: boolean; loading: boolean;
  error: ReadFailure<'not_found' | 'unavailable'> | null; nextCursor: string | null; listAsOf: string; detailAsOf: string;
  onFullDetail?:(id:string)=>void; onPrevious?:()=>void; onSelect: (id: string) => void; onBack: () => void; onRefresh: () => void; onNext: () => void;
};
export function loanDisplayKey(loan: LoanRecord) {
  const principal = loan.principalAmount === null ? '' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'THB', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(loan.principalAmount));
  const date = loan.loanDate === null ? '' : loan.loanDate.slice(8, 10) + '/' + loan.loanDate.slice(5, 7);
  const rate = loan.originalDailyInterestRate == null ? 'Unavailable' : loan.originalDailyInterestRate + '%';
  return `${loan.borrowerDisplayName ?? ''}-${principal}-${date}-${rate}`;
}
export function loanRecoveryRatio(loan:LoanRecord){return loan.principalAmount===null||loan.totalInterestReceived===null?null:Number(loan.principalAmount)>0?Number(loan.totalInterestReceived)/Number(loan.principalAmount):0}
export function loanRecoveryClass(loan:LoanRecord){const ratio=loanRecoveryRatio(loan);return loan.status==='ปิดยอดแล้ว'?'recovery-closed':loan.status!=='ยังไม่ปิดยอด'||ratio===null?'':ratio<0.6?'recovery-low':ratio<1?'recovery-middle':'recovery-covered'}
export const loanStatusLabel=(value:string|null|undefined)=>value==='ยังไม่ปิดยอด'?'Open / ยังไม่ปิดยอด':value==='ปิดยอดแล้ว'?'Closed / ปิดยอดแล้ว':value??'—';
const thaiMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'], months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
/** R110 BD-1 copy date "7 Nov" / "7 พ.ย.". */
const paidThroughDate = (value: string, thai: boolean) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? Number(value.slice(8, 10)) + ' ' + (thai ? thaiMonths : months)[Number(value.slice(5, 7)) - 1] : value;
/** R122 (Echo R122-BOR-01..03): an open row shows its outstanding principal ("฿0" once repaid), a closed row its original
 * principal; the recovery ratio stays on the original principal. Each group carries its own legend. */
const loanGroup = (value: string | null) => value === 'ยังไม่ปิดยอด' ? 0 : value === 'ปิดยอดแล้ว' ? 1 : 2;
export function LoanRecords(props: Props) {
  const t = (en: string, th: string) => props.thai ? th : en;
  const unavailable = t('Unavailable', 'ไม่มีข้อมูล');
  const money = (value: string | null) => value === null ? unavailable : new Intl.NumberFormat(props.thai ? 'th-TH' : 'en-TH', { style: 'currency', currency: 'THB', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(value));
  const date = (value: string | null) => value === null ? unavailable : displayDate(value);
  const yesNo = (value: boolean | null) => value === null ? unavailable : value ? t('Yes', 'ใช่') : t('No', 'ไม่ใช่');
  const status = (value: string | null) => value === 'ยังไม่ปิดยอด' ? t('Open', 'ยังไม่ปิดยอด') : value === 'ปิดยอดแล้ว' ? t('Closed', 'ปิดยอดแล้ว') : value === null ? unavailable : `${t('Other status', 'สถานะอื่น')}: ${value}`;
  // R109-UX-L01: the open group says "Principal loss ฿X"; a Defaulted closed loan says "Defaulted · loss ฿X".
  const lossChip = (loan: LoanRecord) => Number(loan.defaultLossAmount ?? 0) > 0 ? <span className="loan-loss-badge">{loan.defaulted ? t('Defaulted · loss ', 'ผิดนัด · หนี้สูญ ') : t('Principal loss ', 'หนี้สูญเงินต้น ')}{money(loan.defaultLossAmount ?? null)}</span> : null;
  const type = (value: string | null) => value === 'กำหนดวันชำระ' ? t('Fixed due date', 'กำหนดวันชำระ') : value === 'ดอกเบี้ยรายวัน' ? t('Daily interest', 'ดอกเบี้ยรายวัน') : value === 'ผ่อนชำระรายวัน' ? t('Daily instalment', 'ผ่อนชำระรายวัน') : value === null ? unavailable : `${t('Other type', 'ประเภทอื่น')}: ${value}`;
  return <section className="related-loans" aria-label={t('Related loans', 'สัญญาที่เกี่ยวข้อง')}>
    <div className="related-loans-heading"><h3>{t('Related loans', 'สัญญาที่เกี่ยวข้อง')}</h3></div>

    {props.error && <div className="loan-read-error" role="status"><p>{props.error.code === 'not_found' ? t('This borrower or loan is no longer available.', 'ไม่พบผู้กู้หรือสัญญานี้แล้ว') : t('Unable to load loan records.', 'ไม่สามารถโหลดข้อมูลสัญญาได้')}</p><ErrorReference failure={props.error} thai={props.thai} /><button type="button" className="secondary-button" disabled={props.busy} onClick={props.onRefresh}>{t('Retry loan list', 'ลองโหลดรายการสัญญาอีกครั้ง')}</button></div>}
    {props.selected ? <article className="loan-detail" aria-label={t('Loan details', 'รายละเอียดสัญญา')}>
      <HeaderBack navigationKey="legacy-loan-detail" aria-label={t('Back to loans', 'กลับไปรายการสัญญา')} onClick={props.onBack}/>
      <h4>{loanDisplayKey(props.selected)}</h4>{props.onFullDetail&&<button type="button" className="text-action" onClick={()=>props.onFullDetail!(props.selected!.id)}>{t('Full loan details','รายละเอียดสินเชื่อทั้งหมด')}</button>}
      <dl>
        <div><dt>{t('Loan status', 'สถานะสัญญา')}</dt><dd>{status(props.selected.status)}</dd></div>
        <div><dt>{t('Loan type', 'ประเภทสัญญา')}</dt><dd>{type(props.selected.loanType)}</dd></div>
        <div><dt>{t('Loan date', 'วันที่เริ่มสัญญา')}</dt><dd>{date(props.selected.loanDate)}</dd></div>
        <div><dt>{t('Due date', 'วันที่ครบกำหนด')}</dt><dd>{date(props.selected.dueDate)}</dd></div>
        <div><dt>{t('Close date', 'วันที่ปิดสัญญา')}</dt><dd>{date(props.selected.closeDate)}</dd></div>
        <div><dt>{t('Original principal', 'เงินต้นเริ่มต้น')}</dt><dd>{money(props.selected.principalAmount)}</dd></div>
        <div><dt>{t('Principal outstanding', 'เงินต้นคงเหลือ')}</dt><dd>{money(props.selected.outstandingPrincipal)}</dd></div>
        <div><dt>{t('Principal received', 'เงินต้นที่ได้รับ')}</dt><dd>{money(props.selected.totalPrincipalReceived)}</dd></div>
        <div><dt>{t('Interest received', 'ดอกเบี้ยที่ได้รับ')}</dt><dd>{money(props.selected.totalInterestReceived)}</dd></div>
        <div><dt>{t('Total received', 'ยอดที่ได้รับรวม')}</dt><dd>{money(props.selected.totalAmountReceived)}</dd></div>
        <div><dt>{t('Defaulted', 'ผิดนัดชำระ')}</dt><dd>{yesNo(props.selected.defaulted)}</dd></div>
        {Number(props.selected.defaultLossAmount ?? 0) > 0 && <div><dt>{t('Default loss', 'หนี้สูญเงินต้น')}</dt><dd>{money(props.selected.defaultLossAmount ?? null)}</dd></div>}
        <div><dt>{t('Automatic charges enabled', 'เปิดเรียกเก็บอัตโนมัติ')}</dt><dd>{yesNo(props.selected.autoChargeEnabled)}</dd></div>
      </dl>
    </article> : <>

      {!props.loading && !props.error && props.items.length === 0 && <p>{t('No loans for this borrower.', 'ผู้กู้รายนี้ไม่มีสัญญา')}</p>}
      <div className="loan-record-list">{props.items.map((loan, index) => <React.Fragment key={loan.id}>{(index === 0 || loanGroup(props.items[index - 1].status) !== loanGroup(loan.status)) && <h4 className={'record-group-heading ' + (loanGroup(loan.status) === 0 ? 'group-active' : loanGroup(loan.status) === 1 ? 'group-inactive' : 'group-unknown')}>{loanGroup(loan.status) === 0 ? t('Open loans', 'สัญญาที่ยังเปิด') : loanGroup(loan.status) === 1 ? t('Closed loans', 'สัญญาที่ปิดแล้ว') : t('Other / unavailable status', 'สถานะอื่น / ไม่มีข้อมูล')}</h4>}{(index === 0 || loanGroup(props.items[index - 1].status) !== loanGroup(loan.status)) && <p className="list-meaning-legend">{loanGroup(loan.status) === 0 ? t('Outstanding principal · Interest received · Interest covering principal (%)','เงินต้นคงเหลือ · ดอกเบี้ยรับแล้ว · ดอกเบี้ยครอบคลุมเงินต้น (%)') : t('Principal · Interest received · Interest covering principal (%)','เงินต้น · ดอกเบี้ยรับแล้ว · ดอกเบี้ยครอบคลุมเงินต้น (%)')}</p>}<button type="button" className={'loan-record ' + (loanGroup(loan.status) === 1 ? 'closed' : '')} data-record-id={loan.id} onClick={() => props.onSelect(loan.id)} disabled={props.busy}>
        <span className="loan-record-main"><strong>{loanDisplayKey(loan)}</strong>{lossChip(loan)}{loan.status === 'ยังไม่ปิดยอด' ? <span className="loan-outstanding-principal" title={t('Outstanding principal','เงินต้นคงเหลือ')}>{money(loan.outstandingPrincipal)}</span> : <span title={t('Original principal','เงินต้นเริ่มต้น')}>{money(loan.principalAmount)}</span>}{loan.status === 'ยังไม่ปิดยอด' && loan.paidThrough && <small className="loan-paid-through">{t('Paid through ', 'ชำระถึง ')}{paidThroughDate(loan.paidThrough, props.thai)}</small>}</span>
        <span className="loan-record-amount"><strong className={loan.totalInterestReceived!==null&&Number(loan.totalInterestReceived)>0?'profit-positive':''} title={t('Total Interest Received','ดอกเบี้ยรับรวม')}>{money(loan.totalInterestReceived)}</strong><span className={loanRecoveryClass(loan)} title={t('Principal Recovered by Interest','เงินต้นที่ครอบคลุมด้วยดอกเบี้ย')}>{loanRecoveryRatio(loan)===null?'—':new Intl.NumberFormat('en-US',{style:'percent',maximumFractionDigits:2}).format(loanRecoveryRatio(loan)!)}</span></span>
      </button></React.Fragment>)}</div>
      <CompactPager busy={props.busy} previous={props.onPrevious} next={props.nextCursor?props.onNext:undefined} previousLabel={t('Previous loans page','หน้าก่อนของสัญญา')} nextLabel={t('Next loans page','หน้าถัดไปของสัญญา')}/>

    </>}

  </section>;
}
