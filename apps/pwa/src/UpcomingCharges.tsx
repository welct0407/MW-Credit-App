import {Icon} from './Icon';
import {HeaderBack} from './HeaderBack';
import {displayDate} from './display-date';
import {CompactPager} from './CompactPager';
import { ErrorReference, type ReadFailure } from './ReadFailure';
import {OperationConfirm} from './OperationConfirm';
import type {CommandAccess} from './SelectedCharges';
import {useEffect,useId,useRef,useState} from 'react';
export type UpcomingSummary = { ok: true; source: 'dev'; businessDate: string; asOf: string; horizonEnd: string; reviewRequired: boolean; previews?: UpcomingDetail[]; items: { id: string; dueDate: string; totalCharge: string | null }[] };
export type UpcomingDetail = Omit<UpcomingSummary, 'items' | 'previews'> & { dueDate: string; totalCharge: string | null; nextCursor: string | null; items: { id: string; loanId: string; loanDisplayKey: string; principalRemaining: string | null; interestRemaining: string | null; amountRemaining: string | null; basis: string }[] };
/** R104: the charge a loan may record next, as the command service's payment draft offers it in `bookable` (V117, schedule order), with the loan version that books it. */
type BookOffer = { loanId: string; chargeDate: string; principalRemaining: string; interestRemaining: string; bookVersion: string };
const sameAmount = (shown: string | null, offered: string) => shown !== null && /^-?\d+(?:\.\d+)?$/.test(shown) && Number(shown) === Number(offered);
/** The offers are read online from the command origin once per detail open or refresh; any failure only means no Record charge button. */
async function readBookOffers(access: CommandAccess, borrowerId: string, signal: AbortSignal): Promise<BookOffer[]> {
  const token = await access.token();
  const response = await fetch(access.origin + '/api/payment-drafts/' + encodeURIComponent(borrowerId) + '?scope=all', { signal, headers: { Authorization: 'Bearer ' + token, 'X-MW-Wake-Deadline': String(Date.now() + 15000) }, cache: 'no-store', credentials: 'omit', redirect: 'error' });
  if (response.status === 401 || response.status === 403) { access.authFailure(response.status); return []; }
  if (!response.ok) return [];
  const data = await response.json();
  if (!Array.isArray(data?.bookable)) return [];
  return data.bookable.filter((row: any) => row && typeof row.loanId === 'string' && typeof row.chargeDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.chargeDate) && typeof row.principalRemaining === 'string' && /^(0|[1-9]\d*)$/.test(row.principalRemaining) && typeof row.interestRemaining === 'string' && /^(0|[1-9]\d*)$/.test(row.interestRemaining) && typeof row.bookVersion === 'string' && /^[a-f0-9]{64}$/.test(row.bookVersion))
    .map((row: any) => ({ loanId: row.loanId, chargeDate: row.chargeDate, principalRemaining: row.principalRemaining, interestRemaining: row.interestRemaining, bookVersion: row.bookVersion }));
}
export function UpcomingCharges({ thai, summary, detail, busy, error, onDate, onBack, onRefresh, onNext, onPrevious, onDetailRefresh, access, borrowerId }: { thai: boolean; summary: UpcomingSummary | null; detail: UpcomingDetail | null; page: number; busy: boolean; error: ReadFailure | null; onDate: (date: string) => void; onBack: () => void; onRefresh: () => void; onNext: () => void; onPrevious?:()=>void; onDetailRefresh: () => void; access?: CommandAccess; borrowerId?: string }) {
  const t = (en: string, th: string) => thai ? th : en;
  const date = (value: string) => displayDate(value);
  const money = (value: string | null) => value === null ? t('Unavailable', 'ไม่มีข้อมูล') : new Intl.NumberFormat(thai ? 'th-TH' : 'en-TH', { style: 'currency', currency: 'THB', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(value));
  const basis = (value: string) => ({ Recorded: t('Recorded', 'บันทึกแล้ว'), 'Recorded settlement': t('Recorded settlement', 'รายการชำระที่บันทึกแล้ว'), 'Recorded - review status': t('Recorded - review status', 'บันทึกแล้ว - ตรวจสอบสถานะ'), Projected: t('Projected', 'คาดการณ์') })[value] ?? t('Unavailable', 'ไม่มีข้อมูล');
  // R104 (UPC-01..07): offers are held apart from the detail, so a live dataset emit of the detail never drops the buttons.
  const [offers, setOffers] = useState<{ key: string; rows: BookOffer[] } | null>(null), [offerRevision, setOfferRevision] = useState(0);
  const [booking, setBooking] = useState<{ command: any; loanDisplayKey: string } | null>(null), [writing, setWriting] = useState(false), [stale, setStale] = useState<string | null>(null), flight = useRef(false);
  // UPC-06: the button state follows connectivity changes while the detail is open.
  const [, setNetwork] = useState(0);
  useEffect(() => { const changed = () => setNetwork(value => value + 1); window.addEventListener('online', changed); window.addEventListener('offline', changed); return () => { window.removeEventListener('online', changed); window.removeEventListener('offline', changed); }; }, []);
  const helpId = useId(), offline = !!access && (!!access.offlineOnly || !navigator.onLine);
  const offerKey = access && borrowerId && detail ? borrowerId + '\u0000' + detail.dueDate : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: fetched once per detail open (borrower and date) or explicit refresh (offerRevision); access is rebuilt every render and the detail's live emits must not refetch
  useEffect(() => {
    setStale(null);
    if (!access || !borrowerId || !offerKey || access.offlineOnly || !navigator.onLine) { setOffers(null); return; }
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    void readBookOffers(access, borrowerId, controller.signal).then(rows => { if (!controller.signal.aborted) setOffers({ key: offerKey, rows }); }).catch(() => { if (!controller.signal.aborted) setOffers({ key: offerKey, rows: [] }); }).finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); };
  }, [offerKey, offerRevision]);
  const offerFor = (row: UpcomingDetail['items'][number]) => detail && offers?.key === offerKey && row.basis === 'Projected' ? offers.rows.find(offer => offer.loanId === row.loanId && offer.chargeDate === detail.dueDate && sameAmount(row.principalRemaining, offer.principalRemaining) && sameAmount(row.interestRemaining, offer.interestRemaining)) : undefined;
  const refreshDetail = () => { setStale(null); setOfferRevision(value => value + 1); onDetailRefresh(); };
  const finish = () => { flight.current = false; setWriting(false); setBooking(null); };
  function record(row: UpcomingDetail['items'][number], offer: BookOffer) {
    if (flight.current || busy || offline || !access) return;
    flight.current = true; setWriting(true); setStale(null);
    setBooking({ loanDisplayKey: row.loanDisplayKey, command: { requestId: crypto.randomUUID(), operation: 'loan.book-projected-charge', targetId: offer.loanId, expectedVersion: offer.bookVersion, predecessorRequestId: null, receiptId: null, inputs: { chargeDate: offer.chargeDate, principalDue: offer.principalRemaining, interestDue: offer.interestRemaining } } });
  }
  const recordLabel = t('Record charge', 'บันทึกรายการเรียกเก็บ');
  // UPC-R02: the refused offer's row keeps no button until the detail is refreshed.
  const staleKey = (command: any) => command.targetId + '\u0000' + command.inputs.chargeDate;
  if (booking && access) {
    const inputs = booking.command.inputs;
    return <OperationConfirm key={booking.command.requestId} access={access} command={booking.command} domain="loan" label={recordLabel} thai={thai}
      onBack={finish}
      onApplied={() => { finish(); refreshDetail(); }}
      onBlocked={code => { if (code === 'plan_changed' || code === 'source_conflict') { finish(); setStale(staleKey(booking.command)); } }}>
      <p>{booking.loanDisplayKey}</p>
      <dl><div><dt>{t('Charge date', 'วันที่เรียกเก็บ')}</dt><dd>{date(inputs.chargeDate)}</dd></div><div><dt>{t('Principal', 'เงินต้น')}</dt><dd>{money(inputs.principalDue)}</dd></div><div><dt>{t('Interest', 'ดอกเบี้ย')}</dt><dd>{money(inputs.interestDue)}</dd></div></dl>
      <p>{thai ? `ยังไม่ครบกำหนด: ระบบจะบันทึกรายการเรียกเก็บของวันที่ ${date(inputs.chargeDate)} ทันที` : `Not yet due: this records the charge now for ${date(inputs.chargeDate)}.`}</p>
    </OperationConfirm>;
  }
  const locked = busy || writing;
  const bookable = detail ? detail.items.map(row => { const offer = offerFor(row); return offer && stale !== offer.loanId + '\u0000' + offer.chargeDate ? offer : undefined; }) : [];
  return <section className="upcoming-charges" aria-label={t('Upcoming Charges', 'ยอดเรียกเก็บล่วงหน้า')} aria-busy={busy}>
    {detail && <HeaderBack navigationKey="upcoming-date" className="icon-action" aria-label={t('Back to borrower summary','กลับสรุปผู้กู้')} title={t('Back to borrower summary','กลับสรุปผู้กู้')} disabled={writing} onClick={onBack}><Icon name="back"/></HeaderBack>}
    <div className="related-loans-heading"><h3>{t('Upcoming Charges', 'ยอดเรียกเก็บล่วงหน้า')}</h3></div>
    {error && <div role="status"><ErrorReference failure={error} thai={thai} /><button type="button" className="secondary-button" disabled={locked} onClick={detail?refreshDetail:onRefresh}>{t('Retry Upcoming Charges','ลองโหลดยอดเรียกเก็บล่วงหน้าอีกครั้ง')}</button><p>{error.code === 'not_found' ? t('This upcoming date is no longer available. Refresh upcoming charges.', 'ไม่พบวันที่เรียกเก็บล่วงหน้านี้แล้ว กรุณารีเฟรช') : t('Unable to load upcoming charges.', 'ไม่สามารถโหลดรายการเรียกเก็บล่วงหน้าได้')}</p></div>}
    {detail && stale && <div role="status"><p>{t('This projected charge is no longer available. Refresh upcoming charges.', 'ไม่พบรายการคาดการณ์นี้แล้ว กรุณารีเฟรช')}</p><button type="button" className="secondary-button" disabled={locked} onClick={refreshDetail}>{t('Refresh upcoming charges', 'รีเฟรชยอดเรียกเก็บล่วงหน้า')}</button></div>}
    {detail ? <><h3>{date(detail.dueDate)} · {money(detail.totalCharge)}</h3><p className="live-page-status">{t('Total charge for this date', 'ยอดเรียกเก็บรวมสำหรับวันที่นี้')}</p>{detail.items.map((row, index) => { const offer = bookable[index]; return <article className="collection-charge" key={row.id}><h4>{row.loanDisplayKey}</h4><dl><div><dt>{t('Principal remaining', 'เงินต้นคงเหลือ')}</dt><dd>{money(row.principalRemaining)}</dd></div><div><dt>{t('Interest remaining', 'ดอกเบี้ยคงเหลือ')}</dt><dd>{money(row.interestRemaining)}</dd></div><div><dt>{t('Amount remaining', 'ยอดคงเหลือ')}</dt><dd>{money(row.amountRemaining)}</dd></div><div><dt>{t('Basis', 'ที่มา')}</dt><dd>{basis(row.basis)}</dd></div></dl>{offer && <><button type="button" className="secondary-button upcoming-record-charge" aria-label={recordLabel + ' · ' + row.loanDisplayKey} title={recordLabel} disabled={locked || offline} aria-describedby={offline ? helpId + '-' + index : undefined} onClick={() => record(row, offer)}><span aria-hidden="true"><Icon name="add"/></span><span>{recordLabel}</span></button>{offline && <p id={helpId + '-' + index} className="live-page-status upcoming-record-help">{t('Recording a charge needs a connection.', 'การบันทึกรายการเรียกเก็บต้องเชื่อมต่ออินเทอร์เน็ต')}</p>}</>}</article>; })}<CompactPager busy={locked} previous={onPrevious} next={detail.nextCursor?onNext:undefined} previousLabel={t('Previous upcoming details page','หน้ารายละเอียดล่วงหน้าก่อนหน้า')} nextLabel={t('Next upcoming details page','หน้าถัดไปของรายละเอียดล่วงหน้า')}/></> : <>
      {summary && !summary.items.length && !error && <p>{t('No upcoming charge dates.', 'ไม่มีวันที่เรียกเก็บล่วงหน้า')}</p>}
      {!!summary?.items.length&&<div className="upcoming-summary-table"><div className="upcoming-table-head"><span>{t('Date','วันที่')}</span><span>{t('Total Charge','ยอดเรียกเก็บรวม')}</span></div>{summary.items.map(row=><button type="button" className="upcoming-date-row" disabled={locked} key={row.id} onClick={()=>onDate(row.dueDate)}><span>{date(row.dueDate)}</span><strong>{money(row.totalCharge)}</strong></button>)}</div>}
    </>}

  </section>;
}
