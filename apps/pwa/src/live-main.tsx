import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePwa } from './usePwa';
import { createRoot } from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import { initializeAuth, browserPopupRedirectResolver, GoogleAuthProvider, browserLocalPersistence, inMemoryPersistence, onAuthStateChanged, signInWithPopup, signOut, type Auth, type User } from 'firebase/auth';
import './style.css';
import './live-style.css';
import { CollectionRecords, type CollectionReadError } from './CollectionRecords';
import { LoanRecords, type LoanRecord, type LoanPageResult, type LoanDetailResult } from './LoanRecords';

const workspaceViews = [{ id: 'borrowers', en: 'Borrowers', th: 'ผู้กู้', icon: '◎', frequent: true }, { id: 'collection', en: 'Collection', th: 'งานติดตาม', icon: '◷', frequent: true }] as const;
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
  const pwa = usePwa();
  const offlineBlocked = useRef(!navigator.onLine);
  const [thai, setThai] = useState(false);
  const [view, setView] = useState<'borrowers' | 'collection'>('borrowers');
  const [collectionRefresh, setCollectionRefresh] = useState(0);
  const [collectionStatus, setCollectionStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const menuDialog = useRef<HTMLDialogElement | null>(null);
  const menuToggle = useRef<HTMLButtonElement | null>(null);
  const topbar = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const header = topbar.current;
    if (!header) return;
    const measure = () => { (header.closest('.live-shell') as HTMLElement | null)?.style.setProperty('--live-header-height', `${header.getBoundingClientRect().height}px`); };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  const [languageChoices, setLanguageChoices] = useState(false);
  const languageToggle = useRef<HTMLButtonElement | null>(null);
  const languagePanel = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => { if (languageChoices && navigationCollapsed) languagePanel.current?.querySelector('button')?.focus(); }, [languageChoices, navigationCollapsed]);
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
  useEffect(() => {
    const disconnected = () => {
      offlineBlocked.current = true;
      clear(); setCollectionStatus('idle'); setStatus('offline');
      menuDialog.current?.close();
    };
    window.addEventListener('offline', disconnected);
    if (offlineBlocked.current) disconnected();
    return () => window.removeEventListener('offline', disconnected);
  }, []);
  async function expireSession() {
    signingOut.current = true;
    clear(); currentUser.current = null; setUser(null); setStatus('signing_out');
    try {
      if (!authInstance.current) throw new Error('auth_unavailable');
      await signOut(authInstance.current);
      signingOut.current = false; setStatus(offlineBlocked.current ? 'offline' : 'expired');
    } catch { setStatus('sign_out_error'); }
  }
  async function request<T>(signedInUser: User, path: string, localError?: (code: 'not_found' | 'unavailable') => void, onDateChanged?: () => void): Promise<T | null> {
    if (offlineBlocked.current) return null;
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
        if (response.status === 409 && onDateChanged) { onDateChanged(); return null; }
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
  const collectionRequest = <T,>(path: string, onError: (code: CollectionReadError) => void) => user
    ? request<T>(user, path, onError, () => onError('business_date_changed')) : Promise.resolve(null);
  function changeView(next: 'borrowers' | 'collection') {
    menuDialog.current?.close();
    if (next === view) return;
    setCollectionStatus('idle');
    clear(); setView(next);
    if (next === 'borrowers' && user) void load(user);
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
      } catch { setStatus(offlineBlocked.current ? 'offline' : 'auth_unavailable'); return; }
      authInstance.current = instance;
      setAuth(instance);
      unsubscribe = onAuthStateChanged(instance, next => {
        if (disposed || (signingOut.current && next)) return;
        if (offlineBlocked.current) { clear(); setStatus('offline'); return; }
        clear(); currentUser.current = next; setUser(next);
        if (next) { setView('borrowers'); setStatus('loading'); void load(next); } else setStatus('signed_out');
      }, () => { if (!disposed && !offlineBlocked.current) { clear(); setStatus('auth_unavailable'); } });
    } catch { setStatus(offlineBlocked.current ? 'offline' : 'unavailable'); }
    return () => { disposed = true; unsubscribe?.(); generation.current++; pending.current?.abort(); };
  }, []);
  async function login() {
    if (!auth || offlineBlocked.current) return;
    clear(); setStatus('signing_in');
    try { const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' }); await signInWithPopup(auth, provider); }
    catch { clear(); setStatus(offlineBlocked.current ? 'offline' : 'signed_out'); }
  }
  async function logout() {
    menuDialog.current?.close();
    signingOut.current = true;
    clear(); currentUser.current = null; setUser(null); setStatus('signing_out');
    try {
      if (!auth) throw new Error('auth_unavailable');
      await signOut(auth);
      signingOut.current = false; setStatus(offlineBlocked.current ? 'offline' : 'signed_out');
    } catch { setStatus('sign_out_error'); }
  }
  const money = (value: string | null) => value === null ? t('Unavailable', 'ไม่มีข้อมูล') : new Intl.NumberFormat(thai ? 'th-TH' : 'en-TH', { style: 'currency', currency: 'THB', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value));
  const date = (value: string | null) => value === null ? t('Unavailable', 'ไม่มีข้อมูล') : new Intl.DateTimeFormat(thai ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date(value + 'T00:00:00Z'));
  const headerState = ['loading', 'initializing', 'signing_in', 'signing_out'].includes(status) ? 'loading' : status !== 'ready' ? ['error', 'denied', 'sign_out_error', 'auth_unavailable', 'unavailable'].includes(status) ? 'error' : 'idle' : view === 'collection' ? collectionStatus : busy ? 'loading' : 'success';
  const navigation = (location: 'desktop' | 'mobile-bottom' | 'drawer') => {
    if (status !== 'ready') return null;
    const routes = workspaceViews.filter(route => location === 'desktop' || (location === 'mobile-bottom' ? route.frequent : !route.frequent));
    if (!routes.length) return null;
    return <nav className={location === 'mobile-bottom' ? 'live-bottom-nav' : 'live-vertical-nav'} aria-label={t('Workspace navigation', 'เมนูพื้นที่ทำงาน')}>{routes.map(route => <button key={route.id} aria-label={t(route.en, route.th)} title={t(route.en, route.th)} aria-current={view === route.id ? 'page' : undefined} onClick={() => changeView(route.id)}><span className="live-nav-icon" aria-hidden="true">{route.icon}</span><span className="live-nav-label">{t(route.en, route.th)}</span></button>)}</nav>;
  };
  const chooseLanguage = (value: boolean, compact: boolean) => {
    setThai(value); document.documentElement.lang = value ? 'th' : 'en';
    if (compact) { setLanguageChoices(false); languageToggle.current?.focus({ preventScroll: true }); }
  };
  const accountControls = (compact = false) => <div className="live-account-controls">
    {compact && <button ref={languageToggle} className="secondary-button live-account-icon" aria-label={t('Language', 'ภาษา')} title={t('Language', 'ภาษา')} aria-expanded={languageChoices} aria-controls="live-language-choices" onClick={() => setLanguageChoices(value => !value)}><span aria-hidden="true">文</span></button>}
    {(!compact || languageChoices) && <div ref={compact ? languagePanel : undefined} id={compact ? 'live-language-choices' : undefined} className="language" aria-label={t('Language', 'ภาษา')} role="group" onKeyDown={event => { if (compact && event.key === 'Escape') { event.preventDefault(); setLanguageChoices(false); languageToggle.current?.focus({ preventScroll: true }); } }}><button onClick={() => chooseLanguage(false, compact)} aria-pressed={!thai}>EN</button><button onClick={() => chooseLanguage(true, compact)} aria-pressed={thai}>ไทย</button></div>}
    {pwa.canonical && <div className="live-pwa-controls">
      {pwa.canInstall && !pwa.standalone && <button className="secondary-button" aria-label={t('Install app', 'ติดตั้งแอป')} title={t('Install app', 'ติดตั้งแอป')} onClick={() => void pwa.install()}>{compact ? '↓' : t('Install app', 'ติดตั้งแอป')}</button>}
      {!pwa.canInstall && !pwa.standalone && <details><summary aria-label={t('Installation help', 'วิธีติดตั้ง')} title={t('Installation help', 'วิธีติดตั้ง')}>{compact ? 'ⓘ' : t('Installation help', 'วิธีติดตั้ง')}</summary><p>{t('Use your browser menu to install or Add to Home Screen, if supported.', 'หากเบราว์เซอร์รองรับ ให้ใช้เมนูเพื่อติดตั้งหรือเพิ่มไปยังหน้าจอหลัก')}</p></details>}
      {(pwa.waiting || pwa.reloadAvailable) && <button className="secondary-button" disabled={pwa.activating} aria-label={pwa.reloadAvailable ? t('Reload app', 'โหลดแอปใหม่') : t('Update and reload', 'อัปเดตและโหลดใหม่')} title={pwa.reloadAvailable ? t('Reload app', 'โหลดแอปใหม่') : t('Update and reload', 'อัปเดตและโหลดใหม่')} onClick={pwa.update}>{compact ? '↻' : pwa.reloadAvailable ? t('Reload app', 'โหลดแอปใหม่') : t('Update and reload', 'อัปเดตและโหลดใหม่')}</button>}
      {pwa.unavailable && <p role="status">{t('Install or update is currently unavailable. You can keep using the online app.', 'ยังไม่สามารถติดตั้งหรืออัปเดตได้ คุณยังใช้แอปออนไลน์ต่อได้')}</p>}
    </div>}
    {user && <button className="secondary-button live-account-signout" aria-label={t('Sign out', 'ออกจากระบบ')} title={t('Sign out', 'ออกจากระบบ')} onClick={logout}>{compact ? <span aria-hidden="true">↪</span> : t('Sign out', 'ออกจากระบบ')}</button>}
  </div>;
  return <div className="app-shell live-shell" data-preview-theme="dev"><div className="workspace"><header ref={topbar} className="topbar">
    <button ref={menuToggle} className="live-menu-toggle secondary-button" aria-label={t('Open navigation', 'เปิดเมนู')} onClick={() => menuDialog.current?.showModal()}>☰</button>
    <div className="live-brand"><img className="brand-logo" src={logo} alt="Loan Manager" /><div><h1>{view === 'collection' ? t('Collection', 'งานติดตาม') : t('Borrowers', 'ผู้กู้')}</h1></div></div>
    <div className="live-header-actions">{status === 'ready' && <button className="live-header-refresh" disabled={headerState === 'loading'} aria-label={view === 'collection' ? t('Refresh Collection — return to first page', 'รีเฟรชงานติดตาม — กลับหน้าแรก') : t('Refresh Borrowers — return to first page', 'รีเฟรชผู้กู้ — กลับหน้าแรก')} title={view === 'collection' ? t('Refresh Collection — return to first page', 'รีเฟรชงานติดตาม — กลับหน้าแรก') : t('Refresh Borrowers — return to first page', 'รีเฟรชผู้กู้ — กลับหน้าแรก')} onClick={() => { if (view === 'collection') setCollectionRefresh(value => value + 1); else if (user) void load(user); }}><span aria-hidden="true">↻</span></button>}<div className="collection-update" role="status" aria-live="polite"><span aria-hidden="true" className={headerState === 'loading' ? 'collection-spinner' : 'collection-update-icon'}>{headerState === 'loading' ? '' : headerState === 'success' ? '✓' : headerState === 'error' ? '!' : '·'}</span><span className="live-status-text">{headerState === 'loading' ? t('Loading…', 'กำลังโหลด…') : headerState === 'success' ? t('Updated', 'อัปเดตแล้ว') : headerState === 'error' ? t('Could not update', 'อัปเดตไม่สำเร็จ') : t('Ready', 'พร้อม')}</span></div></div>

  </header><div className={'live-body ' + (navigationCollapsed ? 'nav-collapsed' : '')}><aside id="live-desktop-navigation" className="live-desktop-nav"><button className="live-nav-collapse" aria-expanded={!navigationCollapsed} aria-controls="live-desktop-navigation" aria-label={navigationCollapsed ? t('Expand navigation', 'ขยายเมนู') : t('Collapse navigation', 'ย่อเมนู')} title={navigationCollapsed ? t('Expand navigation', 'ขยายเมนู') : t('Collapse navigation', 'ย่อเมนู')} onClick={() => setNavigationCollapsed(value => !value)}><span aria-hidden="true">{navigationCollapsed ? '›' : '‹'}</span></button>{navigation('desktop')}{accountControls(navigationCollapsed)}</aside><main>
    {temporarySignIn && <p role="status" className="live-scope">{t('This browser cannot remember sign-in; you will need to sign in again after refreshing.', 'เบราว์เซอร์นี้ไม่สามารถจดจำการลงชื่อเข้าใช้ได้ คุณต้องลงชื่อเข้าใช้อีกครั้งหลังรีเฟรช')}</p>}
    {status === 'ready' ? view === 'collection' ? <CollectionRecords thai={thai} request={collectionRequest} cancel={cancelPending} onStatus={setCollectionStatus} refreshToken={collectionRefresh} /> : <><div className={'work-grid ' + (selected ? 'has-detail' : '')}><section ref={listPanel} tabIndex={0} className="list-panel" aria-label={t('Borrower list', 'รายชื่อผู้กู้')}><div className="section-heading"><h2>{t('Borrower directory', 'รายชื่อผู้กู้')}</h2></div>{items.length ? items.map((row, index) => <React.Fragment key={row.id}>{(index === 0 || items[index - 1].hasActiveLoan !== row.hasActiveLoan) && <h3 className={'record-group-heading ' + (row.hasActiveLoan === true ? 'group-active' : row.hasActiveLoan === false ? 'group-inactive' : 'group-unknown')}>{row.hasActiveLoan === true ? t('Active borrowers', 'ผู้กู้ที่มีสัญญา') : row.hasActiveLoan === false ? t('Inactive borrowers', 'ผู้กู้ที่ไม่มีสัญญา') : t('Loan status unavailable', 'ไม่มีข้อมูลสถานะสัญญา')}</h3>}<button className={'borrower-card ' + (row.hasActiveLoan === false ? 'inactive ' : '') + (selected?.id === row.id ? 'selected' : '')} key={row.id} disabled={busy} onClick={() => void openBorrower(row)}><span className="person"><strong>{row.borrowerDisplayName ?? row.name ?? t('Unnamed borrower', 'ไม่ระบุชื่อผู้กู้')}</strong></span><span className="card-amount"><strong>{money(row.outstandingPrincipal)}</strong><span>{t('Principal outstanding', 'เงินต้นคงเหลือ')}</span><strong>{money(row.totalProfitEarned ?? null)}</strong><span>{t('Total Profit Earned', 'ดอกเบี้ยที่ได้รับทั้งหมด')}</span></span></button></React.Fragment>) : <p className="live-empty">{t('No visible borrower records.', 'ไม่พบรายการผู้กู้ที่แสดงได้')}</p>}<div className="list-foot"><span className="live-page-status" role="status">{busy ? t('Loading records…', 'กำลังโหลดรายการ…') : `${t('Borrowers page', 'หน้าผู้กู้')} ${borrowerPage}${!nextCursor ? t(' · End of borrower list', ' · สิ้นสุดรายชื่อผู้กู้') : ''}`}</span>{nextCursor && <button className="secondary-button" disabled={busy} onClick={() => user && nextCursor && load(user, nextCursor, borrowerPage + 1)}>{t('Next borrowers page', 'หน้าถัดไปของผู้กู้')}</button>}</div></section><section ref={detailPanel} tabIndex={0} className={'detail-panel ' + (!selected ? 'unselected' : '')} aria-label={t('Borrower details', 'รายละเอียดผู้กู้')}>{selected ? <><button className="back-button" onClick={closeBorrower}>← {t('Back to list', 'กลับไปรายการ')}</button><h2>{selected.borrowerDisplayName ?? selected.name ?? t('Unnamed borrower', 'ไม่ระบุชื่อผู้กู้')}</h2><div className="detail-amounts"><div><span>{t('Principal outstanding', 'เงินต้นคงเหลือ')}</span><strong>{money(selected.outstandingPrincipal)}</strong></div></div><p>{t('Created', 'วันที่สร้าง')} · {date(selected.createdDate)}</p>{selected.note && <div className="issue-note"><strong>{t('Borrower note', 'หมายเหตุผู้กู้')}</strong><p>{selected.note}</p></div>}<LoanRecords thai={thai} page={loanPage} items={loans} selected={selectedLoan} busy={busy} loading={loanLoading} error={loanError} nextCursor={loanCursor} listAsOf={loanAsOf} detailAsOf={loanDetailAsOf} onSelect={id => void openLoan(id)} onBack={() => { cancelPending(); setSelectedLoan(null); setLoanDetailAsOf(''); setLoanError(null); setLoanLoading(false); }} onRefresh={() => user && void loadLoans(user, selected.id, undefined, 1, true)} onNext={() => user && loanCursor && void loadLoans(user, selected.id, loanCursor, loanPage + 1, true)} /></> : <p>{t('Select a borrower to view details.', 'เลือกผู้กู้เพื่อดูรายละเอียด')}</p>}</section></div></> : <section className="access-blocked" role="status"><h2>{status === 'offline' ? t('Connection required', 'ต้องเชื่อมต่ออินเทอร์เน็ต') : status === 'sign_out_error' ? t('Sign-out could not be completed', 'ไม่สามารถออกจากระบบได้สำเร็จ') : status === 'signing_out' ? t('Signing out…', 'กำลังออกจากระบบ…') : status === 'auth_unavailable' ? t('Sign-in is unavailable in this browser', 'ไม่สามารถลงชื่อเข้าใช้ในเบราว์เซอร์นี้ได้') : status === 'unavailable' ? t('DEV connection is not configured', 'ยังไม่ได้ตั้งค่าการเชื่อมต่อ DEV') : status === 'denied' ? t('This account does not have access', 'บัญชีนี้ไม่มีสิทธิ์เข้าถึง') : status === 'expired' ? t('Please sign in again', 'กรุณาลงชื่อเข้าใช้อีกครั้ง') : status === 'error' ? t('Unable to load borrower records', 'ไม่สามารถโหลดข้อมูลผู้กู้ได้') : ['loading', 'initializing', 'signing_in'].includes(status) ? t('Connecting…', 'กำลังเชื่อมต่อ…') : t('Sign in to continue', 'ลงชื่อเข้าใช้เพื่อดำเนินการต่อ')}</h2>{status === 'offline' && <><p>{t('Reconnect to load current records.', 'เชื่อมต่ออีกครั้งเพื่อโหลดข้อมูลปัจจุบัน')}</p><button className="secondary-button" onClick={() => window.location.reload()}>{t('Reconnect', 'เชื่อมต่ออีกครั้ง')}</button></>}{status === 'sign_out_error' && <button className="secondary-button" onClick={logout}>{t('Retry sign out', 'ลองออกจากระบบอีกครั้ง')}</button>}{status === 'auth_unavailable' && <button className="secondary-button" onClick={() => window.location.reload()}>{t('Retry sign-in setup', 'ลองตั้งค่าการลงชื่อเข้าใช้อีกครั้ง')}</button>}{['signed_out', 'expired', 'denied'].includes(status) && <button className="secondary-button" onClick={login}>{t('Continue with Google', 'ดำเนินการต่อด้วย Google')}</button>}{status === 'error' && user && <button className="secondary-button" onClick={() => load(user)}>{t('Try again', 'ลองอีกครั้ง')}</button>}</section>}

  </main></div><dialog ref={menuDialog} className="live-menu-dialog" onClose={() => menuToggle.current?.focus({ preventScroll: true })} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), summary'));
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} onClick={event => { if (event.target === event.currentTarget) menuDialog.current?.close(); }} aria-label={t('Navigation menu', 'เมนูนำทาง')}><button autoFocus className="secondary-button" onClick={() => menuDialog.current?.close()}>{t('Close menu', 'ปิดเมนู')}</button>{navigation('drawer')}{accountControls()}</dialog>{navigation('mobile-bottom')}</div></div>;
}
createRoot(document.getElementById('root')!).render(<App />);
