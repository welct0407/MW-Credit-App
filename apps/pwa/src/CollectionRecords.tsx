import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

type CollectionStatus = 'not_paid' | 'partially_paid' | 'overdue' | 'fully_paid';
type Summary = { id: string; displayName: string; status: CollectionStatus; amountDue: string | null; amountCollected: string | null; amountRemaining: string | null };
type Charge = { id: string; loanId: string; loanDisplayKey: string; chargeDate: string; paymentStatus: string; paymentDate: string | null; amountRemaining: string | null; totalPaid: string | null; receivedToday: string | null };
type Envelope = { ok: true; source: 'dev'; businessDate: string; asOf: string; nextCursor: string | null };
type BoardResult = Envelope & { items: Summary[] };
type DetailResult = Envelope & { borrower: Summary; items: Charge[] };
export type CollectionReadError = 'not_found' | 'unavailable' | 'business_date_changed';
export type CollectionRequest = <T>(path: string, onError: (code: CollectionReadError) => void) => Promise<T | null>;
export function CollectionRecords({ thai, request, cancel }: { thai: boolean; request: CollectionRequest; cancel: () => void }) {
  const t = (en: string, th: string) => thai ? th : en;
  const [items, setItems] = useState<Summary[]>([]);
  const [selected, setSelected] = useState<Summary | null>(null);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [chargeCursor, setChargeCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [chargePage, setChargePage] = useState(1);
  const [businessDate, setBusinessDate] = useState('');
  const [asOf, setAsOf] = useState('');
  const [chargeAsOf, setChargeAsOf] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CollectionReadError | null>(null);
  const [childError, setChildError] = useState<CollectionReadError | null>(null);
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
  function reset() { setChildError(null); setItems([]); setSelected(null); setCharges([]); setCursor(null); setChargeCursor(null); setBusinessDate(''); setAsOf(''); setChargeAsOf(''); setPage(1); setChargePage(1); }
  function fail(code: CollectionReadError) { reset(); setError(code); }
  async function loadBoard(next?: string, pageNumber = 1) {
    cancel(); const current = ++revision.current; reset(); setError(null); setBusy(true);
    const result = await request<BoardResult>('/api/collection?limit=25' + (next ? '&cursor=' + encodeURIComponent(next) : ''), code => { if (current === revision.current) fail(code); });
    if (current !== revision.current) return;
    setBusy(false);
    if (result) { setItems(result.items); setCursor(result.nextCursor); setPage(pageNumber); setBusinessDate(result.businessDate); setAsOf(result.asOf); setScrollTarget(value => ({ kind: 'list', sequence: value.sequence + 1 })); }
  }
  async function loadCharges(row: Summary, next?: string, pageNumber = 1) {
    cancel(); const current = ++revision.current; setSelected(row); setChildError(null); setCharges([]); setChargeCursor(null); setChargeAsOf(''); setError(null); setBusy(true);
    const result = await request<DetailResult>('/api/collection/' + encodeURIComponent(row.id) + '/charges?limit=25' + (next ? '&cursor=' + encodeURIComponent(next) : ''), code => {
      if (current !== revision.current) return;
      if (code === 'business_date_changed') { fail(code); return; }
      setCharges([]); setChargeCursor(null); setChargeAsOf(''); setChildError(code);
      if (code === 'not_found') setSelected(null);
    });
    if (current !== revision.current) return;
    setBusy(false);
    if (result && businessDate && result.businessDate !== businessDate) { fail('business_date_changed'); return; }
    if (result) { setSelected(result.borrower); setCharges(result.items); setChargeCursor(result.nextCursor); setChargePage(pageNumber); setBusinessDate(result.businessDate); setChargeAsOf(result.asOf); setScrollTarget(value => ({ kind: 'detail', sequence: value.sequence + 1 })); }
  }
  useEffect(() => { void loadBoard(); return () => { revision.current++; }; }, []);
  const money = (value: string | null) => value === null ? t('Unavailable', 'ไม่มีข้อมูล') : new Intl.NumberFormat(thai ? 'th-TH' : 'en-TH', { style: 'currency', currency: 'THB', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value));
  const date = (value: string | null) => value === null ? t('Unavailable', 'ไม่มีข้อมูล') : new Intl.DateTimeFormat(thai ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date(value + 'T00:00:00Z'));
  const statusLabel = (value: CollectionStatus) => ({ not_paid: t('Not paid', 'ยังไม่ชำระ'), partially_paid: t('Partially paid', 'ชำระบางส่วน'), overdue: t('Overdue', 'เกินกำหนด'), fully_paid: t('Fully paid', 'ชำระครบ') })[value];
  const paymentLabel = (value: string) => value === 'รอชำระ' ? t('Pending', 'รอชำระ') : value === 'ชำระบางส่วน' ? t('Partially paid', 'ชำระบางส่วน') : t('Paid', 'ชำระแล้ว');
  const amounts = (row: Summary) => <dl className="collection-amounts"><div><dt>{t('Amount due', 'ยอดที่ต้องชำระ')}</dt><dd>{money(row.amountDue)}</dd></div><div><dt>{t('Collected today', 'รับชำระวันนี้')}</dt><dd>{money(row.amountCollected)}</dd></div><div><dt>{t('Remaining to collect', 'ยอดคงเหลือที่ต้องรับชำระ')}</dt><dd>{money(row.amountRemaining)}</dd></div></dl>;
  const freshness = (value: string) => value && <p className="live-freshness">{t('Read at', 'อ่านข้อมูลเมื่อ')} {new Intl.DateTimeFormat(thai ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value))} · Asia/Bangkok</p>;
  return <section aria-label={t('Collection workspace', 'พื้นที่งานติดตาม')}>
    <div className="live-toolbar"><span>{businessDate ? `${t('Business date', 'วันที่ทำรายการ')} · ${date(businessDate)} · Asia/Bangkok` : t('Today’s collection', 'งานติดตามวันนี้')}</span><button className="secondary-button" disabled={busy} onClick={() => void loadBoard()}>{t('First Collection page / refresh', 'หน้าแรกงานติดตาม / รีเฟรช')}</button></div>
    <p className="live-page-status">{t('Up to 25 per page. Groups may continue on another page. Records can change between pages; refresh for the latest position.', 'ไม่เกิน 25 รายการต่อหน้า แต่ละกลุ่มอาจต่อเนื่องในหน้าถัดไป ข้อมูลอาจเปลี่ยนระหว่างหน้า รีเฟรชเพื่อดูข้อมูลล่าสุด')}</p>
    {error && <div className="access-blocked" role="status"><h2>{error === 'business_date_changed' ? t('The business date has changed', 'วันที่ทำรายการเปลี่ยนแล้ว') : error === 'not_found' ? t('This borrower is no longer in Collection', 'ผู้กู้รายนี้ไม่อยู่ในงานติดตามแล้ว') : t('Collection is unavailable', 'ไม่สามารถโหลดงานติดตามได้')}</h2><p>{t('Refresh the first page to reload Collection.', 'รีเฟรชหน้าแรกเพื่อโหลดงานติดตามอีกครั้ง')}</p><button className="secondary-button" onClick={() => void loadBoard()}>{t('Refresh Collection', 'รีเฟรชงานติดตาม')}</button></div>}
    {childError === 'not_found' && <p role="status">{t('This borrower is no longer in Collection. Refresh the list.', 'ผู้กู้รายนี้ไม่อยู่ในงานติดตามแล้ว กรุณารีเฟรชรายการ')}</p>}
    {busy && <p role="status">{t('Loading Collection…', 'กำลังโหลดงานติดตาม…')}</p>}
    {!error && <div className={'work-grid collection-grid ' + (selected ? 'has-detail' : '')}>
      <section className="list-panel" ref={listPanel} tabIndex={0} aria-label={t('Collection borrower list', 'รายชื่อผู้กู้งานติดตาม')}>
        <div className="section-heading"><h2>{t('Collection borrowers', 'ผู้กู้งานติดตาม')}</h2></div>
        {!busy && !items.length && <p className="live-empty">{t('No borrowers in Collection today.', 'ไม่มีผู้กู้ในงานติดตามวันนี้')}</p>}
        {items.map((row, index) => <React.Fragment key={row.id}>{(index === 0 || items[index - 1].status !== row.status) && <h3 className={'record-group-heading ' + (row.status === 'fully_paid' ? 'group-inactive' : 'group-active')}>{statusLabel(row.status)}</h3>}<button className={'collection-borrower ' + (selected?.id === row.id ? 'selected ' : '') + (row.status === 'fully_paid' ? 'fully-paid' : '')} disabled={busy} onClick={() => void loadCharges(row)}><strong>{row.displayName}</strong>{amounts(row)}</button></React.Fragment>)}
        <div className="list-foot"><span className="live-page-status">{t('Collection page', 'หน้างานติดตาม')} {page}{!busy && !cursor ? t(' · End of list', ' · สิ้นสุดรายการ') : ''}</span>{cursor && <button className="secondary-button" disabled={busy} onClick={() => void loadBoard(cursor, page + 1)}>{t('Next Collection page', 'หน้าถัดไปของงานติดตาม')}</button>}</div>{freshness(asOf)}
      </section>
      <section className={'detail-panel ' + (!selected ? 'unselected' : '')} ref={detailPanel} tabIndex={0} aria-label={t('Collection charge details', 'รายละเอียดยอดเรียกเก็บงานติดตาม')}>
        {selected ? <><button className="secondary-button" onClick={() => { cancel(); revision.current++; setSelected(null); setCharges([]); setChargeCursor(null); setChargeAsOf(''); setBusy(false); }}>{t('Back to Collection', 'กลับงานติดตาม')}</button><h2>{selected.displayName}</h2><p>{statusLabel(selected.status)}</p>{amounts(selected)}<div className="related-loans-heading"><h3>{t('Today’s collection charges', 'ยอดเรียกเก็บในงานติดตามวันนี้')}</h3></div><p className="loan-order-note">{t('Includes earlier due dates. Newest charge dates first.', 'รวมยอดที่ครบกำหนดก่อนวันนี้ เรียงวันที่เรียกเก็บใหม่ก่อน')}</p>
          {childError === 'unavailable' && <p role="status">{t('Unable to load charges. Refresh the charges page to try again.', 'ไม่สามารถโหลดรายการเรียกเก็บได้ กรุณารีเฟรชหน้ายอดเรียกเก็บเพื่อลองอีกครั้ง')}</p>}
          {charges.map(charge => <article className="collection-charge" key={charge.id}><h4>{charge.loanDisplayKey}</h4><dl><div><dt>{t('Charge date', 'วันที่เรียกเก็บ')}</dt><dd>{date(charge.chargeDate)}</dd></div><div><dt>{t('Payment status', 'สถานะชำระเงิน')}</dt><dd>{paymentLabel(charge.paymentStatus)}</dd></div><div><dt>{t('Payment date', 'วันที่ชำระเงิน')}</dt><dd>{date(charge.paymentDate)}</dd></div><div><dt>{t('Amount remaining', 'ยอดคงเหลือ')}</dt><dd>{money(charge.amountRemaining)}</dd></div><div><dt>{t('Total paid', 'ยอดชำระรวม')}</dt><dd>{money(charge.totalPaid)}</dd></div><div><dt>{t('Received today', 'รับชำระวันนี้')}</dt><dd>{money(charge.receivedToday)}</dd></div></dl></article>)}
          <p className="live-page-status">{t('Charges page', 'หน้ายอดเรียกเก็บ')} {chargePage}{!busy && !childError && !chargeCursor ? t(' · End of charges', ' · สิ้นสุดยอดเรียกเก็บ') : ''}</p><div className="loan-page-actions"><button className="secondary-button" disabled={busy} onClick={() => void loadCharges(selected)}>{t('First charges page / refresh', 'หน้าแรกยอดเรียกเก็บ / รีเฟรช')}</button>{chargeCursor && <button className="secondary-button" disabled={busy} onClick={() => void loadCharges(selected, chargeCursor, chargePage + 1)}>{t('Next charges page', 'หน้าถัดไปของยอดเรียกเก็บ')}</button>}</div>{freshness(chargeAsOf)}
        </> : <p>{t('Select a borrower to view today’s collection charges.', 'เลือกผู้กู้เพื่อดูยอดเรียกเก็บในงานติดตามวันนี้')}</p>}
      </section>
    </div>}
  </section>;
}
