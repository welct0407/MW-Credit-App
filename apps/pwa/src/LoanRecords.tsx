import React from 'react';

export type LoanRecord = {
  id: string; borrowerId: string; loanDate: string | null; dueDate: string | null; closeDate: string | null;
  loanType: string | null; status: string | null; principalAmount: string | null; outstandingPrincipal: string | null;
  totalPrincipalReceived: string | null; totalInterestReceived: string | null; totalAmountReceived: string | null;
  defaulted: boolean | null; autoChargeEnabled: boolean | null;
};
export type LoanPageResult = { ok: true; source: 'dev'; borrowerId: string; items: LoanRecord[]; nextCursor: string | null; asOf: string };
export type LoanDetailResult = { ok: true; source: 'dev'; item: LoanRecord; asOf: string };
type Props = {
  thai: boolean; items: LoanRecord[]; selected: LoanRecord | null; busy: boolean; loading: boolean;
  error: 'not_found' | 'unavailable' | null; nextCursor: string | null; listAsOf: string; detailAsOf: string;
  onSelect: (id: string) => void; onBack: () => void; onRefresh: () => void; onNext: () => void;
};
export function LoanRecords(props: Props) {
  const t = (en: string, th: string) => props.thai ? th : en;
  const unavailable = t('Unavailable', 'ไม่มีข้อมูล');
  const money = (value: string | null) => value === null ? unavailable : new Intl.NumberFormat(props.thai ? 'th-TH' : 'en-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value));
  const date = (value: string | null) => value === null ? unavailable : new Intl.DateTimeFormat(props.thai ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date(value + 'T00:00:00Z'));
  const yesNo = (value: boolean | null) => value === null ? unavailable : value ? t('Yes', 'ใช่') : t('No', 'ไม่ใช่');
  const status = (value: string | null) => value === 'ยังไม่ปิดยอด' ? t('Open', 'ยังไม่ปิดยอด') : value === 'ปิดยอดแล้ว' ? t('Closed', 'ปิดยอดแล้ว') : value === null ? unavailable : `${t('Other status', 'สถานะอื่น')}: ${value}`;
  const type = (value: string | null) => value === 'กำหนดวันชำระ' ? t('Fixed due date', 'กำหนดวันชำระ') : value === 'ดอกเบี้ยรายวัน' ? t('Daily interest', 'ดอกเบี้ยรายวัน') : value === 'ผ่อนชำระรายวัน' ? t('Daily instalment', 'ผ่อนชำระรายวัน') : value === null ? unavailable : `${t('Other type', 'ประเภทอื่น')}: ${value}`;
  const freshness = props.selected ? props.detailAsOf : props.listAsOf;
  return <section className="related-loans" aria-label={t('Related loans', 'สัญญาที่เกี่ยวข้อง')}>
    <div className="related-loans-heading"><h3>{t('Related loans', 'สัญญาที่เกี่ยวข้อง')}</h3><span>{t('Read only', 'อ่านอย่างเดียว')}</span></div>
    {props.loading && <p role="status">{t('Loading loan records…', 'กำลังโหลดข้อมูลสัญญา…')}</p>}
    {props.error && <div className="loan-read-error" role="status"><p>{props.error === 'not_found' ? t('This borrower or loan is no longer available.', 'ไม่พบผู้กู้หรือสัญญานี้แล้ว') : t('Unable to load loan records.', 'ไม่สามารถโหลดข้อมูลสัญญาได้')}</p><button className="secondary-button" disabled={props.busy} onClick={props.onRefresh}>{t('Retry loan list', 'ลองโหลดรายการสัญญาอีกครั้ง')}</button></div>}
    {props.selected ? <article className="loan-detail" aria-label={t('Loan details', 'รายละเอียดสัญญา')}>
      <button className="secondary-button" onClick={props.onBack}>← {t('Back to loans', 'กลับไปรายการสัญญา')}</button>
      <h4>{props.selected.id}</h4>
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
        <div><dt>{t('Automatic charges enabled', 'เปิดเรียกเก็บอัตโนมัติ')}</dt><dd>{yesNo(props.selected.autoChargeEnabled)}</dd></div>
      </dl>
    </article> : <>
      <p className="loan-order-note">{t('Newest loan dates first; undated loans last. Up to 25 per page, including open and closed loans.', 'เรียงวันที่สัญญาใหม่ก่อน และสัญญาไม่ระบุวันที่อยู่ท้าย แสดงไม่เกิน 25 รายการต่อหน้า รวมสัญญาที่ยังเปิดและปิดแล้ว')}</p>
      {!props.loading && !props.error && props.items.length === 0 && <p>{t('No loans for this borrower.', 'ผู้กู้รายนี้ไม่มีสัญญา')}</p>}
      <div className="loan-record-list">{props.items.map(loan => <button className="loan-record" key={loan.id} onClick={() => props.onSelect(loan.id)} disabled={props.busy}>
        <span className="loan-record-main"><strong>{loan.id}</strong><span>{date(loan.loanDate)} · {status(loan.status)}</span><span>{type(loan.loanType)}</span>{loan.defaulted === true && <span>{t('Defaulted', 'ผิดนัดชำระ')}</span>}</span>
        <span className="loan-record-amount"><strong>{money(loan.outstandingPrincipal)}</strong><span>{t('Principal outstanding', 'เงินต้นคงเหลือ')}</span></span>
      </button>)}</div>
      <div className="loan-page-actions"><button className="secondary-button" disabled={props.busy} onClick={props.onRefresh}>{t('Refresh loans / first page', 'รีเฟรชสัญญา / หน้าแรก')}</button><button className="secondary-button" disabled={props.busy || !props.nextCursor} onClick={props.onNext}>{t('Next loans', 'สัญญาถัดไป')}</button></div>
    </>}
    {freshness && <p className="loan-freshness">{t('Loans read at', 'อ่านข้อมูลสัญญาเมื่อ')} {new Intl.DateTimeFormat(props.thai ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(freshness))} · Asia/Bangkok</p>}
  </section>;
}
