import {RecordAction} from './RecordAction';
import {HeaderBack} from './HeaderBack';
import {ChargeRecord} from './ChargeRecord';
import {LoanRecord} from './LoanRecord';
import {CollectionNote} from './CollectionNote';
import {SharedBorrowerDetail} from './SharedBorrowerDetail';
import {displayDate,displayTimestamp,displayValue} from './display-date';
import {CollectionReceipts} from './CollectionReceipts';
import {PaymentRecord} from './PaymentRecord';
import {useContextRefresh} from './context-refresh';
import {CompactPager,ReceiveIcon,RefreshIcon} from './CompactPager';
import {PaymentHistory} from './PaymentHistory';
import {SelectedCharges,type CommandAccess} from './SelectedCharges';
import { ErrorReference, type ReadFailure } from './ReadFailure';
import { UpcomingCharges, type UpcomingSummary, type UpcomingDetail } from './UpcomingCharges';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

type CollectionStatus = 'not_paid' | 'partially_paid' | 'overdue' | 'fully_paid';
type Summary = { id: string; displayName: string; status: CollectionStatus; amountDue: string | null; amountCollected: string | null; amountRemaining: string | null; groupRemaining?:string|null;groupCollected?:string|null };
type Charge = { id: string; loanId: string; loanDisplayKey: string; chargeDate: string; paymentStatus: string; paymentDate: string | null; amountRemaining: string | null; totalPaid: string | null; receivedToday: string | null };
type Envelope = { ok: true; source: 'dev'; businessDate: string; asOf: string; nextCursor: string | null };
type BoardResult = Envelope & { items: Summary[] };
type DetailResult = Envelope & { borrower: Summary; items: Charge[] };
export type CollectionReadError = 'not_found' | 'unavailable' | 'business_date_changed';
export type CollectionRequest = <T>(path: string, onError: (failure: ReadFailure<CollectionReadError>) => void) => Promise<T | null>;
export function CollectionRecords({ thai, request, cancel, onStatus, refreshToken, query, commandAccess }: { thai: boolean; request: CollectionRequest; cancel: () => void; onStatus: (value: 'idle' | 'loading' | 'success' | 'error') => void; refreshToken: number; query: string; commandAccess?: CommandAccess }) {
  const t = (en: string, th: string) => thai ? th : en;
  const [borrowerOpen,setBorrowerOpen]=useState(false),[loanOpen,setLoanOpen]=useState<string|null>(null);
  const [paymentOpen,setPaymentOpen]=useState(false),[receiptRecord,setReceiptRecord]=useState<string|null>(null);
  const pendingPayment=(()=>{try{return /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(sessionStorage.getItem('mw-credit.pending-command')??'')}catch{return false}})();
  const [items, setItems] = useState<Summary[]>([]);
  const [selected, setSelected] = useState<Summary | null>(null);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [selectedCharge, setSelectedCharge] = useState<Charge | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingSummary | null>(null);
  const [upcomingDetail, setUpcomingDetail] = useState<UpcomingDetail | null>(null);
  const [upcomingError, setUpcomingError] = useState<ReadFailure<CollectionReadError> | null>(null);
  const [upcomingPage, setUpcomingPage] = useState(1);
  const savedDetailScroll = useRef(0);
  const restoreDetailScroll = useRef(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [chargeCursor, setChargeCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const boardCursors=useRef<(string|undefined)[]>([undefined]),chargeCursors=useRef<(string|undefined)[]>([undefined]),upcomingCursors=useRef<(string|undefined)[]>([undefined]);

  const [chargePage, setChargePage] = useState(1);
  const [businessDate, setBusinessDate] = useState('');
  const [asOf, setAsOf] = useState('');
  const [chargeAsOf, setChargeAsOf] = useState('');
  const [busy, setBusy] = useState(false);
  const [updateState, setUpdateState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  useEffect(() => { onStatus(updateState); }, [updateState, onStatus]);
  const [error, setError] = useState<ReadFailure<CollectionReadError> | null>(null);
  const [childError, setChildError] = useState<ReadFailure<CollectionReadError> | null>(null);
  const previews = useRef<{ borrowerId: string; businessDate: string; asOf: string; receivedAt: number; items: UpcomingDetail[] } | null>(null);
  const bangkokToday = () => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
  };
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'visible') previews.current = null; };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  const revision = useRef(0);
  const listPanel = useRef<HTMLElement | null>(null);
  const detailPanel = useRef<HTMLElement | null>(null);
  const [scrollTarget, setScrollTarget] = useState<{ kind: 'list' | 'detail'; sequence: number }>({ kind: 'list', sequence: 0 });
  useLayoutEffect(() => {
    if (!scrollTarget.sequence) return;
    const panel = scrollTarget.kind === 'list' ? listPanel.current : detailPanel.current;
    if (!panel) return;
    panel.scrollTop = 0;
    if (window.innerWidth <= 1050) panel.scrollIntoView({ block: 'start' });
  }, [scrollTarget]);
  useLayoutEffect(() => {
    if (restoreDetailScroll.current && !selectedCharge && !upcomingDetail) {
      restoreDetailScroll.current = false;
      if (window.innerWidth > 1050 && detailPanel.current) detailPanel.current.scrollTop = savedDetailScroll.current;
      else window.scrollTo({ top: savedDetailScroll.current });
    }
  }, [selectedCharge, upcomingDetail]);
  function reset() { setPaymentOpen(false); previews.current = null; setUpcoming(null); setUpcomingDetail(null); setUpcomingError(null); setUpcomingPage(1); setSelectedCharge(null); setChildError(null); setItems([]); setSelected(null); setCharges([]); setCursor(null); setChargeCursor(null); setBusinessDate(''); setAsOf(''); setChargeAsOf(''); setPage(1); setChargePage(1); }
  function fail(code: ReadFailure<CollectionReadError>) { reset(); setError(code); setUpdateState('error'); }
  async function loadBoard(next?: string, pageNumber = 1) {
    if(pageNumber===1)boardCursors.current=[undefined];boardCursors.current[pageNumber-1]=next;
    cancel(); const current = ++revision.current; reset(); setError(null); setBusy(true); setUpdateState('loading');
    setScrollTarget(value => ({ kind: 'list', sequence: value.sequence + 1 }));
    const result = await request<BoardResult>('/api/collection?limit=25' + (query ? '&q=' + encodeURIComponent(query) : '') + (next ? '&cursor=' + encodeURIComponent(next) : ''), code => { if (current === revision.current) fail(code); });
    if (current !== revision.current) return;
    setBusy(false);
    if (result) { setUpdateState('success'); setItems(result.items); setCursor(result.nextCursor); setPage(pageNumber); setBusinessDate(result.businessDate); setAsOf(result.asOf); }
  }
  async function fetchUpcoming(row: Summary, day: string, current: number) {
    previews.current = null; setUpcoming(null); setUpcomingError(null);
    const result = await request<UpcomingSummary>('/api/collection/' + encodeURIComponent(row.id) + '/upcoming?businessDate=' + encodeURIComponent(day), code => {
      if (current !== revision.current) return;
      if (code.code === 'business_date_changed') { fail(code); return; }
      setUpcomingError(code);
      if (code.code === 'not_found') { setSelected(null); setCharges([]); setChargeAsOf(''); setChildError(code); }
    });
    if (current !== revision.current) return false;
    if (result && result.businessDate !== day) { fail({ code: 'business_date_changed' }); return false; }
    if (result) { setUpcoming(result); previews.current = { borrowerId: row.id, businessDate: result.businessDate, asOf: result.asOf, receivedAt: performance.now(), items: result.previews ?? [] }; }
    return result !== null;
  }
  async function loadCharges(row: Summary, next?: string, pageNumber = 1, keepCharge = false) {
    if(pageNumber===1)chargeCursors.current=[undefined];chargeCursors.current[pageNumber-1]=next;
    cancel(); const current = ++revision.current;
    previews.current = null; setSelected(row); if(!keepCharge)setSelectedCharge(null); setUpcoming(null); setUpcomingDetail(null); setUpcomingError(null);
    setChildError(null); setCharges([]); setChargeCursor(null); setChargeAsOf(''); setError(null); setBusy(true); setUpdateState('loading');
    // Keep the shared charge detail mounted while refreshing its Collection context.
    if(!keepCharge)setScrollTarget(value => ({ kind: 'detail', sequence: value.sequence + 1 }));
    let parentUnavailable = false;
    const result = await request<DetailResult>('/api/collection/' + encodeURIComponent(row.id) + '/charges?limit=10' + (next ? '&cursor=' + encodeURIComponent(next) : ''), code => {
      if (current !== revision.current) return;
      if (code.code === 'business_date_changed') { parentUnavailable = true; fail(code); return; }
      setCharges([]); setChargeCursor(null); setChargeAsOf(''); setChildError(code);
      if (code.code === 'not_found') { parentUnavailable = true; setSelected(null); }
    });
    if (current !== revision.current) return;
    if (result && businessDate && result.businessDate !== businessDate) { fail({ code: 'business_date_changed' }); setBusy(false); return; }
    if (parentUnavailable) { setSelectedCharge(null);setBusy(false); setUpdateState('error'); return; }
    if (result) { setSelected(result.borrower); setCharges(result.items); setChargeCursor(result.nextCursor); setChargePage(pageNumber); setBusinessDate(result.businessDate); setChargeAsOf(result.asOf); }
    const upcomingOk = await fetchUpcoming(result?.borrower ?? row, result?.businessDate ?? businessDate, current);
    if (current !== revision.current) return;
    setBusy(false); setUpdateState(result && upcomingOk ? 'success' : 'error');
  }
  async function chargeChanged() {
    if(!selected)return;
    const row=selected,boardPage=page,boardCursor=boardCursors.current[page-1];
    const reload=loadCharges(row,chargeCursors.current[chargePage-1],chargePage,true),current=revision.current;
    await reload;
    if(current!==revision.current)return;
    // A full page reread also refreshes server-calculated status groups and their whole-group totals.
    const result=await request<BoardResult>('/api/collection?limit=25'+(query?'&q='+encodeURIComponent(query):'')+(boardCursor?'&cursor='+encodeURIComponent(boardCursor):''),failure=>{if(current===revision.current)setError(failure)});
    if(current!==revision.current)return;
    if(result){setItems(result.items);setCursor(result.nextCursor);setPage(boardPage);setBusinessDate(result.businessDate);setAsOf(result.asOf);}
  }
  async function refreshUpcoming() {
    if (!selected) return;
    cancel(); const current = ++revision.current; setSelectedCharge(null); setUpcomingDetail(null); setBusy(true); setUpdateState('loading');
    const ok = await fetchUpcoming(selected, businessDate, current);
    if (current !== revision.current) return;
    setBusy(false); setUpdateState(ok && !childError ? 'success' : 'error');
  }
  async function openUpcoming(dueDate: string, next?: string, pageNumber = 1, forceFresh = false) {
    if (!selected) return;
    if(pageNumber===1)upcomingCursors.current=[undefined];upcomingCursors.current[pageNumber-1]=next;
    if (!upcomingDetail) savedDetailScroll.current = window.innerWidth > 1050 ? detailPanel.current?.scrollTop ?? 0 : window.scrollY;
    const cached = previews.current;
    const preview = !forceFresh && !next && cached?.borrowerId === selected.id && cached.businessDate === businessDate && cached.asOf === upcoming?.asOf && cached.businessDate === bangkokToday() && performance.now() - cached.receivedAt < 60_000 ? cached.items.find(item => item.dueDate === dueDate) : undefined;
    if (preview) {
      setSelectedCharge(null); setUpcomingDetail(preview); setUpcomingPage(1); setUpcomingError(null);
      setScrollTarget(value => ({ kind: 'detail', sequence: value.sequence + 1 }));
      return;
    }
    previews.current = null;
    cancel(); const current = ++revision.current; setSelectedCharge(null); setUpcomingDetail(null); setUpcomingError(null); setBusy(true); setUpdateState('loading');
    const result = await request<UpcomingDetail>('/api/collection/' + encodeURIComponent(selected.id) + '/upcoming/' + encodeURIComponent(dueDate) + '?businessDate=' + encodeURIComponent(businessDate) + '&limit=25' + (next ? '&cursor=' + encodeURIComponent(next) : ''), code => {
      if (current !== revision.current) return;
      if (code.code === 'business_date_changed') fail(code); else setUpcomingError(code);
    });
    if (current !== revision.current) return;
    setBusy(false);
    if (result && result.businessDate !== businessDate) { fail({ code: 'business_date_changed' }); return; }
    if (result) { setUpcomingDetail(result); setUpcomingPage(pageNumber); setUpdateState('success'); setScrollTarget(value => ({ kind: 'detail', sequence: value.sequence + 1 })); }
    else setUpdateState('error');
  }
  useEffect(() => { void loadBoard(); return () => { revision.current++; }; }, [refreshToken, query]);
  const money = (value: string | null) => value === null ? t('Unavailable', 'ไม่มีข้อมูล') : Number(value)===0?<span className="zero-currency">฿0</span>:new Intl.NumberFormat(thai ? 'th-TH' : 'en-TH', { style: 'currency', currency: 'THB', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value));
  const date = (value: string | null) => value === null ? t('Unavailable', 'ไม่มีข้อมูล') : displayDate(value);
  const statusLabel = (value: CollectionStatus) => ({ not_paid: t('Not paid', 'ยังไม่ชำระ'), partially_paid: t('Partially paid', 'ชำระบางส่วน'), overdue: t('Overdue', 'เกินกำหนด'), fully_paid: t('Fully paid', 'ชำระครบ') })[value];
  const paymentLabel = (value: string) => value === 'รอชำระ' ? t('Pending', 'รอชำระ') : value === 'ชำระบางส่วน' ? t('Partially paid', 'ชำระบางส่วน') : t('Paid', 'ชำระแล้ว');
  const amounts = (row: Summary) => <dl className="collection-amounts"><div><dt>{t('Amount due', 'ยอดที่ต้องชำระ')}</dt><dd className={row.amountDue!==null&&Number(row.amountDue)===0?'zero-currency':''}>{money(row.amountDue)}</dd></div><div><dt>{t('Collected today', 'รับชำระวันนี้')}</dt><dd className={row.amountCollected!==null&&Number(row.amountCollected)===0?'zero-currency':''}>{money(row.amountCollected)}</dd></div><div><dt>{t('Remaining to collect', 'ยอดคงเหลือที่ต้องรับชำระ')}</dt><dd className={row.amountRemaining!==null&&Number(row.amountRemaining)===0?'zero-currency':''}>{money(row.amountRemaining)}</dd></div></dl>;

  useContextRefresh(!!selected&&!paymentOpen&&!receiptRecord&&!selectedCharge&&!loanOpen&&!borrowerOpen,upcomingDetail?t('First upcoming details page / refresh','หน้าแรกของรายละเอียดล่วงหน้า / รีเฟรช'):t('First charges page / refresh','หน้าแรกยอดเรียกเก็บ / รีเฟรช'),()=>{if(upcomingDetail)void openUpcoming(upcomingDetail.dueDate,undefined,1,true);else if(selected)void loadCharges(selected)});
  const upcomingView = (detail: UpcomingDetail | null) => <UpcomingCharges thai={thai} summary={upcoming} detail={detail} page={upcomingPage} busy={busy} error={upcomingError} onDate={value => void openUpcoming(value)} onBack={() => { restoreDetailScroll.current = true; setUpcomingError(null); setUpcomingDetail(null); }} onRefresh={() => void refreshUpcoming()} onDetailRefresh={() => upcomingDetail && void openUpcoming(upcomingDetail.dueDate, undefined, 1, true)} onPrevious={upcomingPage>1&&upcomingDetail?()=>void openUpcoming(upcomingDetail.dueDate,upcomingCursors.current[upcomingPage-2],upcomingPage-1,true):undefined} onNext={() => upcomingDetail?.nextCursor && void openUpcoming(upcomingDetail.dueDate, upcomingDetail.nextCursor, upcomingPage + 1)} />;
  if(loanOpen&&commandAccess)return <LoanRecord access={commandAccess} id={loanOpen} thai={thai} onBack={()=>setLoanOpen(null)}/>;
  if(borrowerOpen&&selected&&commandAccess)return <SharedBorrowerDetail access={commandAccess} id={selected.id} label={selected.displayName} thai={thai} onBack={()=>setBorrowerOpen(false)}/>;
  if(selectedCharge&&commandAccess)return <ChargeRecord key={selectedCharge.id} access={commandAccess} id={selectedCharge.id} thai={thai} backLabel={t('Back to charges','กลับรายการเรียกเก็บ')} onChanged={()=>void chargeChanged()} onBack={()=>{restoreDetailScroll.current=true;setSelectedCharge(null)}}/>;
  if(receiptRecord&&commandAccess)return <PaymentRecord access={commandAccess} id={receiptRecord} thai={thai} onBack={()=>setReceiptRecord(null)}/>;
  if(paymentOpen&&commandAccess)return <SelectedCharges access={commandAccess} borrowerId={selected?.id??commandAccess.fixtureBorrowerId} thai={thai} onBack={()=>{setPaymentOpen(false);if(selected)void loadCharges(selected);else void loadBoard()}}/>;
  return <section className="collection-workspace" aria-label={t('Collection workspace', 'พื้นที่งานติดตาม')}>


    {commandAccess&&pendingPayment&&<button className="secondary-button" onClick={()=>setPaymentOpen(true)}>{t('Check pending payment status','ตรวจสอบคำขอรับชำระที่ค้างอยู่')}</button>}
    {error && <div className="access-blocked" role="status"><h2>{error.code === 'business_date_changed' ? t('The business date has changed', 'วันที่ทำรายการเปลี่ยนแล้ว') : error.code === 'not_found' ? t('This borrower is no longer in Collection', 'ผู้กู้รายนี้ไม่อยู่ในงานติดตามแล้ว') : t('Collection is unavailable', 'ไม่สามารถโหลดงานติดตามได้')}</h2><ErrorReference failure={error} thai={thai} /><p>{t('Refresh the first page to reload Collection.', 'รีเฟรชหน้าแรกเพื่อโหลดงานติดตามอีกครั้ง')}</p><button className="secondary-button" onClick={() => void loadBoard()}>{t('Refresh Collection', 'รีเฟรชงานติดตาม')}</button></div>}
    {childError?.code === 'not_found' && <div role="status"><ErrorReference failure={childError} thai={thai} />{selected&&<button className="secondary-button" disabled={busy} onClick={()=>void loadCharges(selected)}>{t('Retry charges','ลองโหลดยอดเรียกเก็บอีกครั้ง')}</button>}<p>{t('This borrower is no longer in Collection. Refresh the list.', 'ผู้กู้รายนี้ไม่อยู่ในงานติดตามแล้ว กรุณารีเฟรชรายการ')}</p></div>}
    {!error && <div className={'work-grid collection-grid ' + (selected ? 'has-detail' : '')}>
      <section className="list-panel" aria-busy={busy && !selected} ref={listPanel} tabIndex={0} aria-label={t('Collection borrower list', 'รายชื่อผู้กู้งานติดตาม')}>
        <div className="section-heading"><h2>{t('Collection borrowers', 'ผู้กู้งานติดตาม')}</h2></div>
        {!busy && !items.length && <p className="live-empty">{query ? t('No matching borrowers.', 'ไม่พบผู้กู้ที่ตรงกับการค้นหา') : t('No borrowers in Collection today.', 'ไม่มีผู้กู้ในงานติดตามวันนี้')}</p>}
        {items.map((row,index)=><React.Fragment key={row.id}>{(index===0||items[index-1].status!==row.status)&&<h3 className={'record-group-heading collection-status-'+row.status}><span>{statusLabel(row.status)}</span><strong className={row.status==='fully_paid'&&Number(row.groupCollected)>0?'paid-group-total':''}>{money((row.status==='fully_paid'?row.groupCollected:row.groupRemaining)??null)}</strong></h3>}<article className={'collection-compact-tile collection-status-'+row.status+(selected?.id===row.id?' selected':'')}><button className="collection-tile-main" disabled={busy} onClick={()=>void loadCharges(row)}><strong>{row.displayName}</strong><span className={row.amountRemaining!==null&&Number(row.amountRemaining)===0?'zero-currency':''}>{money(row.amountRemaining)}</span></button><div className="collection-tile-right"><strong className={row.amountCollected!==null&&Number(row.amountCollected)===0?'zero-currency':Number(row.amountCollected)>0?'positive-paid':''} aria-label={t('Paid amount','ยอดชำระ')}>{money(row.amountCollected)}</strong>{commandAccess&&(commandAccess.ownerTesting||commandAccess.fixtureBorrowerId===row.id)&&<button className="secondary-button icon-action" disabled={busy} aria-label={t('Receive payment for ','รับชำระให้ ')+row.displayName} title={t('Receive payment','รับชำระ')} onClick={()=>{cancel();revision.current++;previews.current=null;setSelected(row);setBusy(false);setUpdateState('idle');setPaymentOpen(true)}}><ReceiveIcon/></button>}</div></article></React.Fragment>)}
        <CompactPager busy={busy} previous={page>1?()=>void loadBoard(boardCursors.current[page-2],page-1):undefined} next={cursor?()=>void loadBoard(cursor,page+1):undefined} previousLabel={t('Previous Collection page','หน้างานติดตามก่อนหน้า')} nextLabel={t('Next Collection page','หน้าถัดไปของงานติดตาม')}/>
      </section>
      <section className={'detail-panel ' + (!selected ? 'unselected' : '')} aria-busy={busy && !!selected} ref={detailPanel} tabIndex={0} aria-label={t('Collection charge details', 'รายละเอียดยอดเรียกเก็บงานติดตาม')}>
        {selected ? selectedCharge ? <article className="collection-charge-detail" aria-label={t('Charge detail', 'รายละเอียดยอดเรียกเก็บ')}><HeaderBack className="icon-action" aria-label={t('Back to charges', 'กลับรายการเรียกเก็บ')} onClick={() => { restoreDetailScroll.current = true; setSelectedCharge(null); }}>←</HeaderBack><h2>{t('Charge detail', 'รายละเอียดยอดเรียกเก็บ')}</h2><h3>{selectedCharge.loanDisplayKey}</h3><dl><div><dt>{t('Charge date', 'วันที่เรียกเก็บ')}</dt><dd>{date(selectedCharge.chargeDate)}</dd></div><div><dt>{t('Payment status', 'สถานะชำระเงิน')}</dt><dd>{paymentLabel(selectedCharge.paymentStatus)}</dd></div>{selectedCharge.paymentDate !== null && <div><dt>{t('Payment date', 'วันที่ชำระเงิน')}</dt><dd>{date(selectedCharge.paymentDate)}</dd></div>}<div><dt>{t('Amount remaining', 'ยอดคงเหลือ')}</dt><dd>{money(selectedCharge.amountRemaining)}</dd></div><div><dt>{t('Total paid', 'ยอดชำระรวม')}</dt><dd>{money(selectedCharge.totalPaid)}</dd></div><div><dt>{t('Received today', 'รับชำระวันนี้')}</dt><dd>{money(selectedCharge.receivedToday)}</dd></div></dl></article> : upcomingDetail ? upcomingView(upcomingDetail) : <><div className="payment-context collection-context"><HeaderBack className="secondary-button icon-action" aria-label={t('Back to Collection','กลับงานติดตาม')} title={t('Back to Collection','กลับงานติดตาม')} onClick={() => { cancel(); revision.current++; previews.current = null; setChildError(null); setSelected(null); setSelectedCharge(null); setUpcoming(null); setUpcomingDetail(null); setUpcomingError(null); setCharges([]); setChargeCursor(null); setChargeAsOf(''); setBusy(false); setUpdateState('idle'); }}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M19 12H5m6-6-6 6 6 6"/></svg></HeaderBack>{commandAccess?<button className={'collection-name-link collection-status-'+selected.status} onClick={()=>setBorrowerOpen(true)}>{selected.displayName}</button>:<strong className={'collection-status-'+selected.status}>{selected.displayName}</strong>}{commandAccess&&<PaymentHistory compact access={commandAccess} borrowerId={selected.id} thai={thai}/>}</div>{amounts(selected)}{commandAccess?.ownerTesting&&<CollectionNote key={selected.id} access={commandAccess} id={selected.id} thai={thai}/>}<div className="related-loans-heading collection-charges-heading"><h3>{t('Today’s charges', 'ยอดเรียกเก็บวันนี้')}</h3>{commandAccess&&(commandAccess.ownerTesting||commandAccess.fixtureBorrowerId===selected.id)&&<RecordAction icon="↗" className="secondary-button icon-action" aria-label={t('Receive selected charges','รับชำระรายการที่เลือก')} title={t('Receive selected charges','รับชำระรายการที่เลือก')} onClick={()=>{cancel();revision.current++;previews.current=null;setPaymentOpen(true)}}><ReceiveIcon/></RecordAction>}</div>
          {childError?.code === 'unavailable' && <div role="status"><ErrorReference failure={childError} thai={thai} />{selected&&<button className="secondary-button" disabled={busy} onClick={()=>void loadCharges(selected)}>{t('Retry charges','ลองโหลดยอดเรียกเก็บอีกครั้ง')}</button>}<p>{t('Unable to load charges. Refresh the charges page to try again.', 'ไม่สามารถโหลดรายการเรียกเก็บได้ กรุณารีเฟรชหน้ายอดเรียกเก็บเพื่อลองอีกครั้ง')}</p></div>}
          {charges.map(charge=><article className="collection-charge collection-charge-row" key={charge.id}><span className="charge-row-left"><strong>{date(charge.chargeDate)}</strong>{commandAccess?<button className="record-field-link charge-loan-link" disabled={busy} onClick={()=>setLoanOpen(charge.loanId)}>{charge.loanDisplayKey}</button>:<span>{charge.loanDisplayKey}</span>}</span><span className="charge-row-right"><strong className={'charge-remaining '+(charge.amountRemaining!==null&&Number(charge.amountRemaining)===0?'zero-currency':'')}>{money(charge.amountRemaining)}</strong><strong className={'charge-received '+(charge.totalPaid!==null&&Number(charge.totalPaid)===0?'zero-currency':'')}>{money(charge.totalPaid)}</strong></span><button className="charge-tile-action" disabled={busy} aria-label={t('Charge details for ','รายละเอียดรายการเรียกเก็บ ')+charge.loanDisplayKey+' '+date(charge.chargeDate)} onClick={()=>{savedDetailScroll.current=window.innerWidth>1050?detailPanel.current?.scrollTop??0:window.scrollY;setSelectedCharge(charge);setScrollTarget(value=>({kind:'detail',sequence:value.sequence+1}))}}></button></article>)}
          <CompactPager busy={busy} previous={chargePage>1?()=>void loadCharges(selected,chargeCursors.current[chargePage-2],chargePage-1):undefined} next={chargeCursor?()=>void loadCharges(selected,chargeCursor,chargePage+1):undefined} previousLabel={t('Previous charges page','หน้ายอดเรียกเก็บก่อนหน้า')} nextLabel={t('Next charges page','หน้าถัดไปของยอดเรียกเก็บ')}/>
{commandAccess?.ownerTesting&&charges.length>0&&<CollectionReceipts access={commandAccess} borrowerId={selected.id} businessDate={businessDate} chargeIds={charges.map(row=>row.id)} thai={thai} onOpen={setReceiptRecord}/>}
{upcomingView(null)}
        </> : <p>{t('Select a borrower to view today’s collection charges.', 'เลือกผู้กู้เพื่อดูยอดเรียกเก็บในงานติดตามวันนี้')}</p>}
      </section>
    </div>}
  </section>;
}
