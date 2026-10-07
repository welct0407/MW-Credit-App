import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import { initializeAuth, browserPopupRedirectResolver, GoogleAuthProvider, browserLocalPersistence, inMemoryPersistence, onAuthStateChanged, signInWithPopup, signOut, type Auth, type User } from 'firebase/auth';
import './style.css';
import './live-style.css';
import { LoanRecords, type LoanRecord, type LoanPageResult, type LoanDetailResult } from './LoanRecords';

const logo = new URL('./assets/loan-manager-logo-dev-orange.png', import.meta.url).href;
type Borrower = { id: string; name: string | null; borrowerDisplayName: string; totalProfitEarned: string | null; createdDate: string | null; hasActiveLoan: boolean | null; outstandingPrincipal: string | null; note: string | null };
type PageResult = { ok: true; source: 'dev'; items: Borrower[]; nextCursor: string | null; asOf: string; businessDate: string };
type DetailResult = { ok: true; source: 'dev'; item: Borrower };
function configuration() {
  const e = import.meta.env;
  if (e.MODE !== 'live-dev' || e.VITE_FIREBASE_PROJECT_ID !== 'clever-oasis-508610-n7' || !e.VITE_FIREBASE_API_KEY || !e.VITE_FIREBASE_APP_ID || e.VITE_FIREBASE_AUTH_DOMAIN !== 'clever-oasis-508610-n7.firebaseapp.com') throw new Error('unavailable');
  const apiOrigin = new URL(e.VITE_API_ORIGIN || '');
  if (apiOrigin.protocol !== 'https:' || apiOrigin.origin !== e.VITE_API_ORIGIN || !/^mw-credit-app-read-dev-[a-z0-9-]+(?:\.[a-z0-9-]+)?\.run\.app$/.test(apiOrigin.hostname)) throw new Error('unavailable');
  return { apiOrigin: apiOrigin.origin, firebase: { apiKey: e.VITE_FIREBASE_API_KEY, appId: e.VITE_FIREBASE_APP_ID, projectId: e.VITE_FIREBASE_PROJECT_ID, authDomain: e.VITE_FIREBASE_AUTH_DOMAIN } };
}
function App() {
  const [thai, setThai] = useState(false);
  const t = (en: string, th: string) => thai ? th : en;
  const [auth, setAuth] = useState<Auth | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState('initializing');
  const [temporarySignIn, setTemporarySignIn] = useState(false);
  const signingOut = useRef(false);
  const authInstance = useRef<Auth | null>(null);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Borrower[]>([]);
  const [selected, setSelected] = useState<Borrower | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [asOf, setAsOf] = useState('');
  const [borrowerPage, setBorrowerPage] = useState(1);
  const [loanPage, setLoanPage] = useState(1);
  const listPanel = useRef<HTMLElement | null>(null);
  const detailPanel = useRef<HTMLElement | null>(null);
  const resetScroll = (element: HTMLElement | null) => { if (!element) return; element.scrollTop = 0; if (window.innerWidth <= 1050) element.scrollIntoView({ block: 'start' }); };
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [selectedLoan, setSelectedLoan] = useState<LoanRecord | null>(null);
  const [loanCursor, setLoanCursor] = useState<string | null>(null);
  const [loanAsOf, setLoanAsOf] = useState('');
  const [loanDetailAsOf, setLoanDetailAsOf] = useState('');
  const [loanLoading, setLoanLoading] = useState(false);
  const [loanError, setLoanError] = useState<'not_found' | 'unavailable' | null>(null);
  const previousLoan = useRef<string | null>(null);
  const [loanPageRevision, setLoanPageRevision] = useState(0);
  const scrollRelated = () => {
    const panel = detailPanel.current;
    const related = panel?.querySelector<HTMLElement>('.related-loans');
    if (!panel || !related) return;
    if (window.innerWidth > 1050) panel.scrollTop += related.getBoundingClientRect().top - panel.getBoundingClientRect().top - panel.clientTop;
    else related.scrollIntoView({ block: 'start' });
  };
  useLayoutEffect(() => {
    // Replacement views must start at their heading, within the detail pane only.
    if (selectedLoan || previousLoan.current) scrollRelated();
    previousLoan.current = selectedLoan?.id ?? null;
  }, [selectedLoan]);
  useLayoutEffect(() => {
    if (loanPageRevision > 0) scrollRelated();
  }, [loanPageRevision]);
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const config = useRef<ReturnType<typeof configuration> | null>(null);
  const currentUser = useRef<User | null>(null);
  const clearLoans = () => { setLoans([]); setSelectedLoan(null); setLoanCursor(null); setLoanAsOf(''); setLoanDetailAsOf(''); setLoanLoading(false); setLoanError(null); setLoanPage(1); };
  const cancelPending = () => { generation.current++; pending.current?.abort(); pending.current = null; setBusy(false); };
  const clear = () => { cancelPending(); clearLoans(); setItems([]); setSelected(null); setNextCursor(null); setAsOf(''); setBorrowerPage(1); };
  const closeBorrower = () => { cancelPending(); clearLoans(); setSelected(null); };
  const failLoans = (code: 'not_found' | 'unavailable') => { clearLoans(); setLoanError(code); };
  async function expireSession() {
    signingOut.current = true;
    clear(); currentUser.current = null; setUser(null); setStatus('signing_out');
    try {
      if (!authInstance.current) throw new Error('auth_unavailable');
      await signOut(authInstance.current);
      signingOut.current = false; setStatus('expired');
    } catch { setStatus('sign_out_error'); }
  }
  async function request<T>(signedInUser: User, path: string, localError?: (code: 'not_found' | 'unavailable') => void): Promise<T | null> {
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    const revision = generation.current;
    setBusy(true);
    try {
      const token = await signedInUser.getIdToken();
      if (controller.signal.aborted || revision !== generation.current || currentUser.current !== signedInUser) return null;
      const response = await fetch(config.current!.apiOrigin + path, { method: 'GET', headers: { Authorization: 'Bearer ' + token }, cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal });
      if (controller.signal.aborted || revision !== generation.current || currentUser.current !== signedInUser) return null;
      if (!response.ok) {
        if (response.status === 401) { await expireSession(); return null; }
        if (localError && response.status !== 401 && response.status !== 403) { localError(response.status === 404 ? 'not_found' : 'unavailable'); return null; }
        clear();
        setStatus(response.status === 401 ? 'expired' : response.status === 403 ? 'denied' : 'error');
        return null;
      }
      const result = await response.json();
      if (controller.signal.aborted || revision !== generation.current || currentUser.current !== signedInUser) return null;
      if (result.ok !== true || result.source !== 'dev') throw new Error('invalid_response');
      setStatus('ready');
      return result as T;
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      if (!controller.signal.aborted && revision === generation.current && ['auth/user-token-expired', 'auth/invalid-user-token', 'auth/user-disabled'].includes(code)) { await expireSession(); return null; }
      if (!controller.signal.aborted && revision === generation.current) { if (localError) localError('unavailable'); else { clear(); setStatus('error'); } }
      return null;
    } finally { if (revision === generation.current && pending.current === controller) setBusy(false); }
  }
  async function load(signedInUser: User, cursor?: string, page = 1) {
    cancelPending(); clearLoans(); setSelected(null);
    const result = await request<PageResult>(signedInUser, '/api/borrowers?limit=25' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
    if (result) { setItems(result.items); setNextCursor(result.nextCursor); setAsOf(result.asOf); setBorrowerPage(page); requestAnimationFrame(() => resetScroll(listPanel.current)); }
  }
  async function loadLoans(signedInUser: User, borrowerId: string, cursor?: string, page = 1, scrollToLoans = false) {
    setLoans([]); setSelectedLoan(null); setLoanError(null); setLoanCursor(null); setLoanAsOf(''); setLoanDetailAsOf(''); setLoanLoading(true);
    const revision = generation.current;
    const result = await request<LoanPageResult>(signedInUser, '/api/borrowers/' + encodeURIComponent(borrowerId) + '/loans?limit=25' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), failLoans);
    if (revision !== generation.current) return;
    setLoanLoading(false);
    if (result) { setLoans(result.items); setLoanCursor(result.nextCursor); setLoanAsOf(result.asOf); setLoanPage(page); if (scrollToLoans) setLoanPageRevision(value => value + 1); }
  }
  async function openBorrower(row: Borrower) {
    if (!user) return;
    cancelPending(); clearLoans(); setSelected(null);
    const detail = await request<DetailResult>(user, '/api/borrowers/' + encodeURIComponent(row.id));
    if (detail) { setSelected(detail.item); requestAnimationFrame(() => resetScroll(detailPanel.current)); await loadLoans(user, detail.item.id); }
  }
  async function openLoan(id: string) {
    if (!user || !selected) return;
    setSelectedLoan(null); setLoanError(null); setLoanDetailAsOf(''); setLoanLoading(true);
    const revision = generation.current;
    const result = await request<LoanDetailResult>(user, '/api/borrowers/' + encodeURIComponent(selected.id) + '/loans/' + encodeURIComponent(id), failLoans);
    if (revision !== generation.current) return;
    setLoanLoading(false);
    if (result) { setSelectedLoan(result.item); setLoanDetailAsOf(result.asOf); }
  }
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let disposed = false;
    try {
      config.current = configuration();
      // Probe only our random, non-sensitive marker; Firebase owns all auth storage.
      const marker = 'mw-credit-storage-probe-' + crypto.randomUUID();
      let localAvailable = false;
      try {
        localStorage.setItem(marker, '1');
        localAvailable = localStorage.getItem(marker) === '1';
      } catch { /* A restricted browser uses an explicitly labelled temporary session. */ }
      finally { try { localStorage.removeItem(marker); } catch { /* Storage may be blocked. */ } }
      setTemporarySignIn(!localAvailable);
      let instance: Auth;
      try {
        instance = initializeAuth(initializeApp(config.current.firebase), {
          persistence: localAvailable ? browserLocalPersistence : inMemoryPersistence,
          popupRedirectResolver: browserPopupRedirectResolver,
        });
      } catch { setStatus('auth_unavailable'); return; }
      authInstance.current = instance;
      setAuth(instance);
      unsubscribe = onAuthStateChanged(instance, next => {
        if (disposed || (signingOut.current && next)) return;
        clear(); currentUser.current = next; setUser(next);
        if (next) { setStatus('loading'); void load(next); } else setStatus('signed_out');
      }, () => { if (!disposed) { clear(); setStatus('auth_unavailable'); } });
    } catch { setStatus('unavailable'); }
    return () => { disposed = true; unsubscribe?.(); generation.current++; pending.current?.abort(); };
  }, []);
  async function login() {
    if (!auth) return;
    clear(); setStatus('signing_in');
    try { const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' }); await signInWithPopup(auth, provider); }
    catch { clear(); setStatus('signed_out'); }
  }
  async function logout() {
    signingOut.current = true;
    clear(); currentUser.current = null; setUser(null); setStatus('signing_out');
    try {
      if (!auth) throw new Error('auth_unavailable');
      await signOut(auth);
      signingOut.current = false; setStatus('signed_out');
    } catch { setStatus('sign_out_error'); }
  }
  const money = (value: string | null) => value === null ? t('Unavailable', 'ไม่มีข้อมูล') : new Intl.NumberFormat(thai ? 'th-TH' : 'en-TH', { style: 'currency', currency: 'THB', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value));
  const date = (value: string | null) => value === null ? t('Unavailable', 'ไม่มีข้อมูล') : new Intl.DateTimeFormat(thai ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date(value + 'T00:00:00Z'));
  return <div className="app-shell live-shell" data-preview-theme="dev"><div className="workspace"><header className="topbar"><a className="live-brand" href="#" onClick={e => e.preventDefault()}><img className="brand-logo" src={logo} alt="Loan Manager" /><strong>MW Credit</strong></a><div className="language" aria-label="Language" role="group"><button onClick={() => { setThai(false); document.documentElement.lang = 'en'; }} aria-pressed={!thai}>EN</button><button onClick={() => { setThai(true); document.documentElement.lang = 'th'; }} aria-pressed={thai}>ไทย</button></div></header><main>
    {temporarySignIn && <p role="status" className="live-scope">{t('This browser cannot remember sign-in; you will need to sign in again after refreshing.', 'เบราว์เซอร์นี้ไม่สามารถจดจำการลงชื่อเข้าใช้ได้ คุณต้องลงชื่อเข้าใช้อีกครั้งหลังรีเฟรช')}</p>}
    <div className="preview-strip">{t('DEV · Read-only borrower workspace', 'DEV · พื้นที่อ่านข้อมูลผู้กู้เท่านั้น')}</div>
    <div className="page-heading"><div><h1>{t('Borrowers', 'ผู้กู้')}</h1><p>{t('Google sign-in is required. Access is limited to the approved development account.', 'ต้องลงชื่อเข้าใช้ด้วย Google และใช้บัญชีที่ได้รับอนุญาตสำหรับระบบพัฒนาเท่านั้น')}</p></div>{user && <button className="secondary-button" onClick={logout}>{t('Sign out', 'ออกจากระบบ')}</button>}</div>
    {status === 'ready' ? <><div className="live-toolbar"><span>{t('Up to 25 per page · active borrowers first, then inactive and unknown · oldest creation date first in each group', 'แสดงไม่เกิน 25 รายการต่อหน้า · ผู้กู้ที่มีสัญญาก่อน ตามด้วยไม่มีสัญญาและไม่ทราบสถานะ · ภายในกลุ่มเรียงวันที่สร้างเก่าก่อน')}</span><button className="secondary-button" disabled={busy} onClick={() => user && load(user)}>{t('First borrowers page / refresh', 'หน้าแรกของผู้กู้ / รีเฟรช')}</button></div><div className={'work-grid ' + (selected ? 'has-detail' : '')}><section ref={listPanel} tabIndex={0} className="list-panel" aria-label={t('Borrower list', 'รายชื่อผู้กู้')}><div className="section-heading"><h2>{t('Borrower directory', 'รายชื่อผู้กู้')}</h2></div><p className="borrower-page-note">{t('Groups may continue on another page.', 'แต่ละกลุ่มอาจต่อเนื่องในหน้าถัดไป')}</p>{items.length ? items.map((row, index) => <React.Fragment key={row.id}>{(index === 0 || items[index - 1].hasActiveLoan !== row.hasActiveLoan) && <h3 className={'record-group-heading ' + (row.hasActiveLoan === true ? 'group-active' : row.hasActiveLoan === false ? 'group-inactive' : 'group-unknown')}>{row.hasActiveLoan === true ? t('Active borrowers', 'ผู้กู้ที่มีสัญญา') : row.hasActiveLoan === false ? t('Inactive borrowers', 'ผู้กู้ที่ไม่มีสัญญา') : t('Loan status unavailable', 'ไม่มีข้อมูลสถานะสัญญา')}</h3>}<button className={'borrower-card ' + (row.hasActiveLoan === false ? 'inactive ' : '') + (selected?.id === row.id ? 'selected' : '')} key={row.id} disabled={busy} onClick={() => void openBorrower(row)}><span className="person"><strong>{row.borrowerDisplayName ?? row.name ?? t('Unnamed borrower', 'ไม่ระบุชื่อผู้กู้')}</strong></span><span className="card-amount"><strong>{money(row.outstandingPrincipal)}</strong><span>{t('Principal outstanding', 'เงินต้นคงเหลือ')}</span><strong>{money(row.totalProfitEarned ?? null)}</strong><span>{t('Total Profit Earned', 'ดอกเบี้ยที่ได้รับทั้งหมด')}</span></span></button></React.Fragment>) : <p className="live-empty">{t('No visible borrower records.', 'ไม่พบรายการผู้กู้ที่แสดงได้')}</p>}<div className="list-foot"><span className="live-page-status" role="status">{busy ? t('Loading records…', 'กำลังโหลดรายการ…') : `${t('Borrowers page', 'หน้าผู้กู้')} ${borrowerPage}${!nextCursor ? t(' · End of borrower list', ' · สิ้นสุดรายชื่อผู้กู้') : ''}`}</span>{nextCursor && <button className="secondary-button" disabled={busy} onClick={() => user && nextCursor && load(user, nextCursor, borrowerPage + 1)}>{t('Next borrowers page', 'หน้าถัดไปของผู้กู้')}</button>}</div></section><section ref={detailPanel} tabIndex={0} className={'detail-panel ' + (!selected ? 'unselected' : '')} aria-label={t('Borrower details', 'รายละเอียดผู้กู้')}>{selected ? <><button className="back-button" onClick={closeBorrower}>← {t('Back to list', 'กลับไปรายการ')}</button><h2>{selected.borrowerDisplayName ?? selected.name ?? t('Unnamed borrower', 'ไม่ระบุชื่อผู้กู้')}</h2><div className="detail-amounts"><div><span>{t('Principal outstanding', 'เงินต้นคงเหลือ')}</span><strong>{money(selected.outstandingPrincipal)}</strong></div></div><p>{t('Created', 'วันที่สร้าง')} · {date(selected.createdDate)}</p>{selected.note && <div className="issue-note"><strong>{t('Borrower note', 'หมายเหตุผู้กู้')}</strong><p>{selected.note}</p></div>}<LoanRecords thai={thai} page={loanPage} items={loans} selected={selectedLoan} busy={busy} loading={loanLoading} error={loanError} nextCursor={loanCursor} listAsOf={loanAsOf} detailAsOf={loanDetailAsOf} onSelect={id => void openLoan(id)} onBack={() => { cancelPending(); setSelectedLoan(null); setLoanDetailAsOf(''); setLoanError(null); setLoanLoading(false); }} onRefresh={() => user && void loadLoans(user, selected.id, undefined, 1, true)} onNext={() => user && loanCursor && void loadLoans(user, selected.id, loanCursor, loanPage + 1, true)} /></> : <p>{t('Select a borrower to view details.', 'เลือกผู้กู้เพื่อดูรายละเอียด')}</p>}</section></div>{asOf && <p className="live-freshness">{t('Read at', 'อ่านข้อมูลเมื่อ')} {new Intl.DateTimeFormat(thai ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(asOf))} · Asia/Bangkok</p>}</> : <section className="access-blocked" role="status"><h2>{status === 'sign_out_error' ? t('Sign-out could not be completed', 'ไม่สามารถออกจากระบบได้สำเร็จ') : status === 'signing_out' ? t('Signing out…', 'กำลังออกจากระบบ…') : status === 'auth_unavailable' ? t('Sign-in is unavailable in this browser', 'ไม่สามารถลงชื่อเข้าใช้ในเบราว์เซอร์นี้ได้') : status === 'unavailable' ? t('DEV connection is not configured', 'ยังไม่ได้ตั้งค่าการเชื่อมต่อ DEV') : status === 'denied' ? t('This account does not have access', 'บัญชีนี้ไม่มีสิทธิ์เข้าถึง') : status === 'expired' ? t('Please sign in again', 'กรุณาลงชื่อเข้าใช้อีกครั้ง') : status === 'error' ? t('Unable to load borrower records', 'ไม่สามารถโหลดข้อมูลผู้กู้ได้') : ['loading', 'initializing', 'signing_in'].includes(status) ? t('Connecting…', 'กำลังเชื่อมต่อ…') : t('Sign in to continue', 'ลงชื่อเข้าใช้เพื่อดำเนินการต่อ')}</h2>{status === 'sign_out_error' && <button className="secondary-button" onClick={logout}>{t('Retry sign out', 'ลองออกจากระบบอีกครั้ง')}</button>}{status === 'auth_unavailable' && <button className="secondary-button" onClick={() => window.location.reload()}>{t('Retry sign-in setup', 'ลองตั้งค่าการลงชื่อเข้าใช้อีกครั้ง')}</button>}{['signed_out', 'expired', 'denied'].includes(status) && <button className="secondary-button" onClick={login}>{t('Continue with Google', 'ดำเนินการต่อด้วย Google')}</button>}{status === 'error' && user && <button className="secondary-button" onClick={() => load(user)}>{t('Try again', 'ลองอีกครั้ง')}</button>}</section>}
    <p className="live-scope">{t('Collection, charges, receipts and financial actions are not available in this read-only checkpoint. AppSheet continues operating in parallel.', 'จุดตรวจสอบแบบอ่านอย่างเดียวยังไม่มีงานติดตาม ยอดเรียกเก็บ ใบเสร็จ หรือการทำรายการทางการเงิน AppSheet ยังคงใช้งานควบคู่')}</p>
  </main></div></div>;
}
createRoot(document.getElementById('root')!).render(<App />);
