import {ManagementCash} from './ManagementCash';
import {RecordAction} from './RecordAction';
import {HeaderBack,useHeaderBack} from './HeaderBack';
import {ManagementWorkspace,type ManagementSection} from './ManagementWorkspace';
import {limitAppZoom} from './zoom-guard';
import {SharedBorrowerDetail} from './SharedBorrowerDetail';
import {flushSync} from 'react-dom';
import {displayDate,displayTimestamp,displayValue} from './display-date';
import {StandaloneRecords} from './StandaloneRecords';
import {StandaloneUpcoming} from './StandaloneUpcoming';
import {Dashboard} from './Dashboard';
import {CashWorkspace} from './CashWorkspace';
import {ExpenseRecords} from './ExpenseRecords';
import {LoanForm} from './LoanForm';
import {LoanRecord as FullLoanRecord} from './LoanRecord';
import {BorrowerRecord} from './BorrowerRecord';
import {refreshSnapshot,subscribeRefresh,useContextRefresh} from './context-refresh';
import {PaymentResult} from './PaymentResult';
import {useSyncExternalStore} from 'react';
import {activitySnapshot,subscribeActivity,beginRequest} from './request-activity';
import {CompactPager} from './CompactPager';
import {SelectedCharges,type CommandAccess} from './SelectedCharges';
import {BorrowerPayments} from './BorrowerPayments';
import {ownerOfflineRepository} from './owner-offline';
import {OfflinePayments} from './OfflinePayments';
import { ErrorReference, responseReference, type ReadFailure } from './ReadFailure';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePwa } from './usePwa';
import { createRoot } from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import { initializeAuth, browserPopupRedirectResolver, GoogleAuthProvider, browserLocalPersistence, inMemoryPersistence, onAuthStateChanged, signInWithPopup, signOut, type Auth, type User } from 'firebase/auth';
import './style.css';
import './live-style.css';
import { CollectionRecords, type CollectionReadError } from './CollectionRecords';
import { LoanRecords, type LoanRecord, type LoanPageResult, type LoanDetailResult } from './LoanRecords';

const managementViews=[{id:'partners',en:'Partners',th:'หุ้นส่วน',icon:'♧'},{id:'cash-accounts',en:'Cash Accounts',th:'บัญชีเงินสด',icon:'▣'},{id:'cash-position',en:'Cash Position',th:'สถานะเงินสด',icon:'฿'},{id:'contributions',en:'Contributions',th:'เงินลงทุน',icon:'＋'},{id:'settlements',en:'Settlements',th:'การจัดสรรกำไร',icon:'⇄'},{id:'assessments',en:'Loan Assessments',th:'ประเมินสินเชื่อ',icon:'▤'},{id:'analytics',en:'Analytics',th:'การวิเคราะห์',icon:'▥'}] as const;
const workspaceViews = [{id:'dashboard',en:'Dashboard',th:'ภาพรวม',icon:'▦',frequent:true},{id:'collection',en:'Collection',th:'งานติดตาม',icon:'◷',frequent:true},{id:'payments',en:'Payments',th:'รับชำระ',icon:'฿',frequent:true},{id:'borrowers',en:'Borrowers',th:'ผู้กู้',icon:'◎',frequent:true},{id:'expenses',en:'Expenses',th:'ค่าใช้จ่าย',icon:'▤',frequent:false},{id:'upcoming',en:'Upcoming Charges',th:'รายการเรียกเก็บล่วงหน้า',icon:'◷',frequent:false},{id:'cash',en:'Cash',th:'เงินสด',icon:'฿',frequent:false},{id:'management',en:'Management',th:'การจัดการ',icon:'▥',frequent:false}] as const;
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
  useEffect(()=>limitAppZoom(),[]);
  const pwa = usePwa();
  const offlineBlocked = useRef(!navigator.onLine);
  const [thai, setThai] = useState(false);
  const languageRevision=useRef(0),preferenceOwner=useRef<string|null>(null);
  const [managementSection,setManagementSection]=useState<ManagementSection>('cash-accounts'),[managementExpanded,setManagementExpanded]=useState(false);
  const [view, setView] = useState<'borrowers' | 'collection' | 'expenses' | 'cash' | 'dashboard' | 'upcoming' | 'loans' | 'payments' | 'management'>(import.meta.env.VITE_COMMAND_MODE==='dev-owner-testing'?'dashboard':'borrowers');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const searchQuery = useRef('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimerGeneration = useRef(0);
  const [searchPending, setSearchPending] = useState(false);
  const [searchComposing, setSearchComposing] = useState(false);
  const composing = useRef(false);
  const cancelSearchTimer = () => {
    searchTimerGeneration.current++;
    if (searchTimer.current !== null) clearTimeout(searchTimer.current);
    searchTimer.current = null; setSearchPending(false);
  };
  const finishSearchNavigation = () => { cancelSearchTimer(); composing.current = false; setSearchComposing(false); setSearchDraft(searchQuery.current); setSearchOpen(false); };
  const searchInput = useRef<HTMLInputElement | null>(null);
  const searchToggle = useRef<HTMLButtonElement | null>(null);
  const resetSearch = () => { cancelSearchTimer(); composing.current = false; setSearchComposing(false); searchQuery.current = ''; setAppliedQuery(''); setSearchDraft(''); setSearchOpen(false); };
  useLayoutEffect(() => { if (searchOpen) searchInput.current?.focus(); }, [searchOpen]);
  const [collectionRefresh, setCollectionRefresh] = useState(0);
  const [postedNotice,setPostedNotice]=useState<string|null>(null),[postedDetails,setPostedDetails]=useState(false);
  const activeBack=useHeaderBack();
  const activeRefresh=useSyncExternalStore(subscribeRefresh,refreshSnapshot);
  const pendingActivity=useSyncExternalStore(subscribeActivity,activitySnapshot);
  const borrowerCursors=useRef<(string|undefined)[]>([undefined]),loanCursors=useRef<(string|undefined)[]>([undefined]);
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
  const offlineRepository=useMemo(()=>user?ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:user.uid}):null,[user?.uid]);
  const offlineRepositoryRef=useRef(offlineRepository);offlineRepositoryRef.current=offlineRepository;
  const [fullLoan,setFullLoan]=useState<string|null>(null);
  const [borrowerRecordRevision,setBorrowerRecordRevision]=useState(0);
  const [borrowerHistory,setBorrowerHistory]=useState<string|null>(null);
  const [newLoan,setNewLoan]=useState<{borrowerId:string;label:string}|null>(null);
  const [borrowerEditor,setBorrowerEditor]=useState<string|null|undefined>(undefined);
  const [borrowerPayment,setBorrowerPayment]=useState<string|null>(null);
 const [savedPayments,setSavedPayments]=useState(false);
  const [status, setStatus] = useState('initializing');
  const [temporarySignIn, setTemporarySignIn] = useState(false);
  const signingOut = useRef(false);
  const authInstance = useRef<Auth | null>(null);
  const [rootError, setRootError] = useState<ReadFailure | null>(null);
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
  const [loanError, setLoanError] = useState<ReadFailure<'not_found' | 'unavailable'> | null>(null);
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
  const clear = () => { setNewLoan(null);setFullLoan(null);setBorrowerEditor(undefined);setPostedNotice(null);setPostedDetails(false);setSavedPayments(false); setBorrowerPayment(null); setRootError(null); cancelPending(); clearLoans(); setItems([]); setSelected(null); setNextCursor(null); setAsOf(''); setBorrowerPage(1); };
  const closeBorrower = () => { cancelPending(); clearLoans(); setSelected(null); };
  const failLoans = (failure: ReadFailure<'not_found' | 'unavailable'>) => { clearLoans(); setLoanError(failure); };
  useEffect(() => {
    const disconnected = () => {
      offlineBlocked.current = true; resetSearch();
      clear(); setCollectionStatus('idle'); setStatus('offline');
      menuDialog.current?.close();
    };
    window.addEventListener('offline', disconnected);
    if (offlineBlocked.current) disconnected();
    return () => window.removeEventListener('offline', disconnected);
  }, []);
  async function expireSession(failure: ReadFailure | null = null) {
    void offlineRepositoryRef.current?.purge();
    resetSearch(); signingOut.current = true;
    clear(); currentUser.current = null; setUser(null); setStatus('signing_out');
    try {
      if (!authInstance.current) throw new Error('auth_unavailable');
      await signOut(authInstance.current);
      signingOut.current = false; setRootError(offlineBlocked.current ? null : failure); setStatus(offlineBlocked.current ? 'offline' : 'expired');
    } catch { setStatus('sign_out_error'); }
  }
  async function request<T>(signedInUser: User, path: string, localError?: (failure: ReadFailure<'not_found' | 'unavailable'>) => void, onDateChanged?: (failure: ReadFailure<'business_date_changed'>) => void): Promise<T | null> {
    if (offlineBlocked.current || pwa.startup!=='ready') return null;
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    const revision = generation.current;
    setRootError(null); setBusy(true);
    try {
      const token = await signedInUser.getIdToken();
      if (controller.signal.aborted || revision !== generation.current || currentUser.current !== signedInUser) return null;
      const response = await fetch(config.current!.apiOrigin + path, { method: 'GET', headers: { Authorization: 'Bearer ' + token }, cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal });
      if (controller.signal.aborted || revision !== generation.current || currentUser.current !== signedInUser) return null;
      if (!response.ok) {
        if (response.status === 401) { await expireSession({ code: 'session_invalid', reference: responseReference(response) }); return null; }
        if (response.status === 409 && onDateChanged) { onDateChanged({ code: 'business_date_changed', reference: responseReference(response) }); return null; }
        if (localError && response.status !== 401 && response.status !== 403) { localError({ code: response.status === 404 ? 'not_found' : 'unavailable', reference: responseReference(response) }); return null; }
        if (response.status === 403) {void offlineRepositoryRef.current?.purge();resetSearch();}
        clear(); setRootError({ code: response.status === 403 ? 'access_denied' : 'unavailable', reference: responseReference(response) });
        setStatus(response.status === 401 ? 'expired' : response.status === 403 ? 'denied' : 'error');
        return null;
      }
      const result = await response.json();
      if (controller.signal.aborted || revision !== generation.current || currentUser.current !== signedInUser) return null;
      if (result.ok !== true || result.source !== 'dev') throw new Error('invalid_response');
      void ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:signedInUser.uid}).authorize().catch(()=>{});
      setStatus('ready');
      return result as T;
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      if (!controller.signal.aborted && revision === generation.current && ['auth/user-token-expired', 'auth/invalid-user-token', 'auth/user-disabled'].includes(code)) { await expireSession(); return null; }
      if (!controller.signal.aborted && revision === generation.current) { if (localError) localError({ code: 'unavailable' }); else { clear(); setStatus('error'); } }
      return null;
    } finally { if (revision === generation.current && pending.current === controller) setBusy(false); }
  }
  const collectionRequest = <T,>(path: string, onError: (failure: ReadFailure<CollectionReadError>) => void) => user
    ? request<T>(user, path, onError, failure => onError(failure)) : Promise.resolve(null);
  function changeView(next: 'borrowers' | 'collection' | 'expenses' | 'cash' | 'dashboard' | 'upcoming' | 'loans' | 'payments' | 'management') {
    setBorrowerEditor(undefined);
    menuDialog.current?.close();
    if (next === view && !savedPayments && !borrowerPayment) return;
    resetSearch(); setCollectionStatus('idle');
    const change=()=>{clear();setView(next);if(next==='borrowers'&&user)void load(user)};const transition=(document as Document&{startViewTransition?:(callback:()=>void)=>unknown}).startViewTransition;if(transition&&!matchMedia('(prefers-reduced-motion: reduce)').matches)transition.call(document,()=>flushSync(change));else change();
  }
  async function load(signedInUser: User, cursor?: string, page = 1, query = searchQuery.current) {
    if(page===1)borrowerCursors.current=[undefined];borrowerCursors.current[page-1]=cursor;
    cancelPending(); clearLoans(); setSelected(null);
    requestAnimationFrame(() => resetScroll(listPanel.current));
    const result = await request<PageResult>(signedInUser, '/api/borrowers?limit=25' + (query ? '&q=' + encodeURIComponent(query) : '') + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
    if (result) { setItems(result.items); setNextCursor(result.nextCursor); setAsOf(result.asOf); setBorrowerPage(page); }
  }
  async function loadLoans(signedInUser: User, borrowerId: string, cursor?: string, page = 1, scrollToLoans = false) {
    if(page===1)loanCursors.current=[undefined];loanCursors.current[page-1]=cursor;
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
        if(!next||currentUser.current&&currentUser.current.uid!==next.uid)void offlineRepositoryRef.current?.purge();
        if (offlineBlocked.current) { clear();currentUser.current=next;setUser(next);setStatus('offline');return; }
        resetSearch(); clear(); currentUser.current = next; setUser(next);
        if (next) { setView(import.meta.env.VITE_COMMAND_MODE==='dev-owner-testing'?'dashboard':'borrowers'); setStatus('loading'); } else setStatus('signed_out');
      }, () => { if (!disposed && !offlineBlocked.current) { clear(); setStatus('auth_unavailable'); } });
    } catch { setStatus(offlineBlocked.current ? 'offline' : 'unavailable'); }
    return () => { disposed = true; unsubscribe?.(); generation.current++; pending.current?.abort(); };
  }, []);
  useEffect(()=>{if(!user||offlineBlocked.current||pwa.startup!=='ready')return;if(import.meta.env.VITE_COMMAND_MODE==='dev-owner-testing')setStatus('ready');else void load(user)},[user,pwa.startup]);
  async function login() {
    if (!auth || offlineBlocked.current) return;
    clear(); setStatus('signing_in');
    try { const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' }); await signInWithPopup(auth, provider); }
    catch { clear(); setStatus(offlineBlocked.current ? 'offline' : 'signed_out'); }
  }
  async function logout() {
    menuDialog.current?.close();
    void offlineRepositoryRef.current?.purge();
    resetSearch(); signingOut.current = true;
    clear(); currentUser.current = null; setUser(null); setStatus('signing_out');
    try {
      if (!auth) throw new Error('auth_unavailable');
      await signOut(auth);
      signingOut.current = false; setStatus(offlineBlocked.current ? 'offline' : 'signed_out');
    } catch { setStatus('sign_out_error'); }
  }
  const money = (value: string | null) => value === null ? t('Unavailable', 'ไม่มีข้อมูล') : new Intl.NumberFormat(thai ? 'th-TH' : 'en-TH', { style: 'currency', currency: 'THB', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value));
  const date = (value: string | null) => value === null ? t('Unavailable', 'ไม่มีข้อมูล') : displayDate(value);
  useContextRefresh(status==='ready'&&view==='borrowers'&&!!selected&&!borrowerPayment&&!savedPayments,t('First loans page / refresh','หน้าแรกของสัญญา / รีเฟรช'),()=>{if(user&&selected)void loadLoans(user,selected.id,undefined,1,true)});
  const headerState = pendingActivity>0 ? 'loading' : ['loading', 'initializing', 'signing_in', 'signing_out'].includes(status) ? 'loading' : status !== 'ready' ? ['error', 'denied', 'sign_out_error', 'auth_unavailable', 'unavailable'].includes(status) ? 'error' : 'idle' : view === 'collection' ? collectionStatus : busy ? 'loading' : 'success';
  const navigation = (location: 'desktop' | 'mobile-bottom' | 'drawer') => {
    if (status !== 'ready') return null;
    const routes = workspaceViews.filter(route => (!['expenses','cash','dashboard','upcoming','loans','payments','management'].includes(route.id)||import.meta.env.VITE_COMMAND_MODE==='dev-owner-testing')).filter(route => location === 'desktop' || (location === 'mobile-bottom' ? route.frequent : !route.frequent));
    if (!routes.length) return null;
    return <nav className={location === 'mobile-bottom' ? 'live-bottom-nav' : 'live-vertical-nav'} aria-label={t('Workspace navigation', 'เมนูพื้นที่ทำงาน')}>{routes.map(route => <React.Fragment key={route.id}><button aria-label={t(route.en, route.th)} title={t(route.en, route.th)} aria-expanded={route.id==='management'?managementExpanded:undefined} aria-current={view === route.id&&route.id!=='management' ? 'page' : undefined} onClick={() => {if(route.id==='management'){setManagementExpanded(value=>!value);if(!managementExpanded&&location==='desktop')changeView('management')}else changeView(route.id)}}><span className="live-nav-icon" aria-hidden="true">{route.icon}</span><span className="live-nav-label">{t(route.en, route.th)}{route.id==='management'?(managementExpanded?' ▴':' ▾'):''}</span></button>{route.id==='management'&&managementExpanded&&managementViews.map(item=><button className="management-nav-item" key={item.id} aria-label={t(item.en,item.th)} title={t(item.en,item.th)} aria-current={view==='management'&&managementSection===item.id?'page':undefined} onClick={()=>{setManagementSection(item.id);changeView('management')}}><span className="live-nav-icon" aria-hidden="true">{item.icon}</span><span className="live-nav-label">{t(item.en,item.th)}</span></button>)}</React.Fragment>)}{location!=='mobile-bottom'&&import.meta.env.VITE_COMMAND_MODE==='dev-owner-testing'&&<a className="text-action" href="https://www.appsheet.com/start/9f3422be-bc87-4a5a-a42a-67528ee80393" target="_blank" rel="noopener noreferrer">{t('Reporting','รายงาน')}</a>}</nav>;
  };
  const chooseLanguage = (value: boolean, compact: boolean) => {
    languageRevision.current++;setThai(value); document.documentElement.lang = value ? 'th' : 'en';
    if (compact) { setLanguageChoices(false); languageToggle.current?.focus({ preventScroll: true }); }
  };
  function closeSearch() { finishSearchNavigation(); requestAnimationFrame(() => searchToggle.current?.focus()); }
  function submitSearch(raw: string, reportInvalid = true) {
    cancelSearchTimer();
    if (composing.current || offlineBlocked.current || status !== 'ready') return;
    const query = raw.trim();
    if (raw.length > 512 || /[\u0000-\u001f\u007f]/u.test(raw) || [...query].length > 100) {
      searchInput.current?.setCustomValidity(t('Use up to 100 characters without control characters.', 'ใช้ไม่เกิน 100 ตัวอักษรและไม่ใช้อักขระควบคุม'));
      if (reportInvalid) searchInput.current?.reportValidity(); return;
    }
    searchInput.current?.setCustomValidity('');
    if (query === searchQuery.current) return;
    clear(); searchQuery.current = query; setAppliedQuery(query);
    if (view === 'collection') setCollectionRefresh(value => value + 1);
    else if (view==='borrowers'&&user) void load(user, undefined, 1, query);
  }
  useEffect(() => {
    cancelSearchTimer();
    if (!searchOpen || status !== 'ready' || searchComposing || searchDraft.trim() === searchQuery.current) return;
    const timerGeneration = searchTimerGeneration.current;
    setSearchPending(true);
    searchTimer.current = setTimeout(() => {
      if (timerGeneration !== searchTimerGeneration.current || composing.current || offlineBlocked.current) return;
      submitSearch(searchDraft, false);
    }, 300);
    return cancelSearchTimer;
  }, [searchDraft, searchOpen, searchComposing, status, user, view]);
  const accountControls = (compact = false) => <div className="live-account-controls">
    {status==='ready'&&user&&<button className="secondary-button" aria-label={t('Saved payment drafts','ร่างรับชำระที่บันทึกไว้')} title={t('Saved payment drafts','ร่างรับชำระที่บันทึกไว้')} onClick={()=>{setSavedPayments(true);menuDialog.current?.close()}}>{compact?'▤':t('Saved payment drafts','ร่างรับชำระที่บันทึกไว้')}</button>}
    {compact && <button ref={languageToggle} className="secondary-button live-account-icon" aria-label={t('Language', 'ภาษา')} title={t('Language', 'ภาษา')} aria-expanded={languageChoices} aria-controls="live-language-choices" onClick={() => setLanguageChoices(value => !value)}><span aria-hidden="true">文</span></button>}
    {(!compact || languageChoices) && <div ref={compact ? languagePanel : undefined} id={compact ? 'live-language-choices' : undefined} className="language" aria-label={t('Language', 'ภาษา')} role="group" onKeyDown={event => { if (compact && event.key === 'Escape') { event.preventDefault(); setLanguageChoices(false); languageToggle.current?.focus({ preventScroll: true }); } }}><button onClick={() => chooseLanguage(false, compact)} aria-pressed={!thai}>EN</button><button onClick={() => chooseLanguage(true, compact)} aria-pressed={thai}>ไทย</button></div>}
    {pwa.canonical && <div className="live-pwa-controls">
      {pwa.canInstall && !pwa.standalone && <button className="secondary-button" aria-label={t('Install app', 'ติดตั้งแอป')} title={t('Install app', 'ติดตั้งแอป')} onClick={() => void pwa.install()}>{compact ? '↓' : t('Install app', 'ติดตั้งแอป')}</button>}
      {!pwa.canInstall && !pwa.standalone && <details><summary aria-label={t('Installation help', 'วิธีติดตั้ง')} title={t('Installation help', 'วิธีติดตั้ง')}>{compact ? 'ⓘ' : t('Installation help', 'วิธีติดตั้ง')}</summary><p>{t('Use your browser menu to install or Add to Home Screen, if supported.', 'หากเบราว์เซอร์รองรับ ให้ใช้เมนูเพื่อติดตั้งหรือเพิ่มไปยังหน้าจอหลัก')}</p></details>}
      {(pwa.waiting || pwa.reloadAvailable) && <button className="secondary-button" disabled={pwa.startup!=='ready'||pwa.activating||Boolean(activeBack)||headerState==='loading'} aria-label={pwa.reloadAvailable ? t('Reload app', 'โหลดแอปใหม่') : t('Update and reload', 'อัปเดตและโหลดใหม่')} title={pwa.reloadAvailable ? t('Reload app', 'โหลดแอปใหม่') : t('Update and reload', 'อัปเดตและโหลดใหม่')} onClick={()=>{if(!activeBack&&headerState!=='loading')pwa.update()}}>{compact ? '↻' : pwa.reloadAvailable ? t('Reload app', 'โหลดแอปใหม่') : t('Update and reload', 'อัปเดตและโหลดใหม่')}</button>}
      {pwa.unavailable && <p role="status">{t('Install or update is currently unavailable. You can keep using the online app.', 'ยังไม่สามารถติดตั้งหรืออัปเดตได้ คุณยังใช้แอปออนไลน์ต่อได้')}</p>}
    </div>}
    {user && <button className="secondary-button live-account-signout" aria-label={t('Sign out', 'ออกจากระบบ')} title={t('Sign out', 'ออกจากระบบ')} onClick={logout}>{compact ? <span aria-hidden="true">↪</span> : t('Sign out', 'ออกจากระบบ')}</button>}
  </div>;
  const commandAccess:CommandAccess|undefined=user && /^https:\/\/mw-credit-app-command-dev-[a-z0-9.-]+\.run\.app$/.test(import.meta.env.VITE_COMMAND_API_ORIGIN||'') && (import.meta.env.VITE_COMMAND_MODE==='dev-owner-testing'||import.meta.env.VITE_COMMAND_FIXTURE_BORROWER_ID) ? {origin:import.meta.env.VITE_COMMAND_API_ORIGIN,fixtureBorrowerId:import.meta.env.VITE_COMMAND_FIXTURE_BORROWER_ID??'',ownerTesting:import.meta.env.VITE_COMMAND_MODE==='dev-owner-testing',offline:offlineRepository??undefined,onPosted:id=>{clear();setView('collection');setCollectionRefresh(value=>value+1);setPostedNotice(id)},token:async()=>{if(pwa.startup!=='ready'||offlineBlocked.current||currentUser.current!==user)throw Error('Session unavailable');return user.getIdToken()},authFailure:code=>{if(code===401)void expireSession();else {void offlineRepositoryRef.current?.purge();clear();setStatus('denied')}}} : undefined;
  useEffect(()=>{if(!user){preferenceOwner.current=null;return;}if(status!=='ready'||!commandAccess?.ownerTesting||!navigator.onLine||preferenceOwner.current===user.uid)return;preferenceOwner.current=user.uid;let active=true;const revision=languageRevision.current,done=beginRequest(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);void(async()=>{try{const response=await fetch(commandAccess.origin+'/api/preferences',{headers:{Authorization:'Bearer '+await commandAccess.token()},signal:controller.signal,cache:'no-store',credentials:'omit',redirect:'error'});if(!active)return;if(response.status===401||response.status===403){commandAccess.authFailure(response.status);return;}if(!response.ok)return;const value=(await response.json()).item?.language;if(active&&revision===languageRevision.current&&['English','ไทย'].includes(value)){setThai(value==='ไทย');document.documentElement.lang=value==='ไทย'?'th':'en';}}catch{}finally{clearTimeout(timer);done()}})();return()=>{active=false;controller.abort()}},[user,status]);
  return <div className="app-shell live-shell" data-preview-theme="dev"><div className="workspace"><header ref={topbar} className="topbar">
    {searchOpen && status === 'ready' ? <form className="live-search" role="search" aria-label={t('Borrower name search', 'ค้นหาชื่อผู้กู้')} onSubmit={event => { event.preventDefault(); submitSearch(searchDraft); }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); closeSearch(); } if (event.key === 'Enter' && (event.nativeEvent.isComposing || composing.current)) event.preventDefault(); }}>
      <button type="button" aria-label={t('Back from search', 'กลับจากการค้นหา')} title={t('Back from search', 'กลับจากการค้นหา')} onClick={closeSearch}>←</button>
      <input ref={searchInput} type="search" aria-label={t('Search Thai or English name', 'ค้นหาชื่อไทยหรืออังกฤษ')} placeholder={t('Thai or English name', 'ชื่อไทยหรืออังกฤษ')} value={searchDraft} maxLength={512} onCompositionStart={() => { composing.current = true; setSearchComposing(true); cancelSearchTimer(); }} onCompositionEnd={event => { composing.current = false; setSearchComposing(false); setSearchDraft(event.currentTarget.value); }} onChange={event => { cancelSearchTimer(); event.target.setCustomValidity(''); setSearchDraft(event.target.value); }} />
      <button type="button" aria-label={t('Clear search', 'ล้างการค้นหา')} title={t('Clear search', 'ล้างการค้นหา')} onClick={() => { composing.current = false; setSearchComposing(false); setSearchDraft(''); submitSearch(''); searchInput.current?.focus(); }}>×</button>
      <button type="submit" aria-label={t('Submit search', 'ค้นหา')} title={t('Submit search', 'ค้นหา')}><span aria-hidden="true" className={searchPending || headerState === 'loading' ? 'collection-spinner' : ''}>{searchPending || headerState === 'loading' ? '' : '⌕'}</span></button>
      <span className="live-status-text" role="status" aria-live="polite">{searchPending || headerState === 'loading' ? t('Loading…', 'กำลังโหลด…') : headerState === 'error' ? t('Could not update', 'อัปเดตไม่สำเร็จ') : t('Updated', 'อัปเดตแล้ว')}</span>
    </form> : <>
    <button ref={menuToggle} className={"live-menu-toggle secondary-button"+(activeBack?" has-back":"")} disabled={activeBack?.disabled} aria-label={activeBack?.label??t('Open navigation', 'เปิดเมนู')} onClick={event => activeBack?activeBack.run(event):menuDialog.current?.showModal()}>{activeBack?'←':'☰'}</button>
    <div className="live-brand"><img className="brand-logo" src={logo} alt="Loan Manager" /><div><h1 title={(view==='management'?t(managementViews.find(item=>item.id===managementSection)?.en??'Management',managementViews.find(item=>item.id===managementSection)?.th??'การจัดการ'):view==='loans'?t('Loans','สินเชื่อ'):view==='payments'?t('Payments','รับชำระ'):view === 'collection' ? t('Collection', 'งานติดตาม') : view==='expenses'?t('Expenses','ค่าใช้จ่าย'):view==='cash'?t('Cash','เงินสด'):view==='upcoming'?t('Upcoming Charges','รายการเรียกเก็บล่วงหน้า'):view==='dashboard'?t('Dashboard','ภาพรวม'):t('Borrowers', 'ผู้กู้')) + (appliedQuery ? ' · ' + appliedQuery : '')}>{view==='management'?t(managementViews.find(item=>item.id===managementSection)?.en??'Management',managementViews.find(item=>item.id===managementSection)?.th??'การจัดการ'):view==='loans'?t('Loans','สินเชื่อ'):view==='payments'?t('Payments','รับชำระ'):view === 'collection' ? t('Collection', 'งานติดตาม') : view==='expenses'?t('Expenses','ค่าใช้จ่าย'):view==='cash'?t('Cash','เงินสด'):view==='upcoming'?t('Upcoming Charges','รายการเรียกเก็บล่วงหน้า'):view==='dashboard'?t('Dashboard','ภาพรวม'):t('Borrowers', 'ผู้กู้')}{appliedQuery ? ' · ' + appliedQuery : ''}</h1></div></div>
    <div className="live-header-actions">{status === 'ready' && !['expenses','cash','dashboard','upcoming'].includes(view) && <button ref={searchToggle} className="live-header-refresh" aria-label={t('Search borrowers', 'ค้นหาผู้กู้')} title={t('Search borrowers', 'ค้นหาผู้กู้')} onClick={() => { setSearchDraft(searchQuery.current); setSearchOpen(true); }}><span aria-hidden="true">⌕</span></button>}<button className="live-header-refresh collection-update" aria-busy={headerState==='loading'} disabled={status!=='ready'||headerState==='loading'} aria-label={activeRefresh?.label??(view === 'collection' ? t('Refresh Collection — return to first page', 'รีเฟรชงานติดตาม — กลับหน้าแรก') : t('Refresh Borrowers — return to first page', 'รีเฟรชผู้กู้ — กลับหน้าแรก'))} title={activeRefresh?.label??(view === 'collection' ? t('Refresh Collection — return to first page', 'รีเฟรชงานติดตาม — กลับหน้าแรก') : t('Refresh Borrowers — return to first page', 'รีเฟรชผู้กู้ — กลับหน้าแรก'))} onClick={() => { if(activeRefresh){activeRefresh.run();return;} if (view === 'collection') setCollectionRefresh(value => value + 1); else if (view==='borrowers'&&user) void load(user); }}><span aria-hidden="true" className={headerState==='loading'?'collection-spinner':''}>{headerState==='loading'?'':'↻'}</span><span className="live-status-text" role="status" aria-live="polite">{headerState==='loading'?t('Loading…','กำลังโหลด…'):headerState==='error'?t('Could not update','อัปเดตไม่สำเร็จ'):t('Ready','พร้อม')}</span></button></div>
    </>}
  </header><div className={'live-body ' + (navigationCollapsed ? 'nav-collapsed' : '')}><aside id="live-desktop-navigation" className="live-desktop-nav"><button className="live-nav-collapse" aria-expanded={!navigationCollapsed} aria-controls="live-desktop-navigation" aria-label={navigationCollapsed ? t('Expand navigation', 'ขยายเมนู') : t('Collapse navigation', 'ย่อเมนู')} title={navigationCollapsed ? t('Expand navigation', 'ขยายเมนู') : t('Collapse navigation', 'ย่อเมนู')} onClick={() => setNavigationCollapsed(value => !value)}><span aria-hidden="true">{navigationCollapsed ? '›' : '‹'}</span></button>{navigation('desktop')}{accountControls(navigationCollapsed)}</aside><main data-workspace={view} onClickCapture={event => { if (searchOpen && event.target instanceof Element && event.target.closest('button:not(:disabled)')) finishSearchNavigation(); }}>
    {temporarySignIn && <p role="status" className="live-scope">{t('This browser cannot remember sign-in; you will need to sign in again after refreshing.', 'เบราว์เซอร์นี้ไม่สามารถจดจำการลงชื่อเข้าใช้ได้ คุณต้องลงชื่อเข้าใช้อีกครั้งหลังรีเฟรช')}</p>}
    {status==='ready'&&postedNotice&&<div className="payment-success" role="status">{t('Payment received','รับชำระแล้ว')} <button className="text-action" onClick={()=>setPostedDetails(value=>!value)}>{t('Payment details','รายละเอียดรับชำระ')}</button></div>}{status==='ready'&&postedNotice&&postedDetails&&commandAccess&&<PaymentResult access={commandAccess} requestId={postedNotice} thai={thai}/>}
    {['checking','upgrading','error'].includes(pwa.startup)?<section className="startup-version" role="status"><h2>{pwa.startup==='upgrading'?t('App upgrade in progress','กำลังอัปเกรดแอป'):pwa.startup==='checking'?t('Checking app version…','กำลังตรวจสอบเวอร์ชันแอป…'):t('Unable to check app version','ไม่สามารถตรวจสอบเวอร์ชันแอป')}</h2>{pwa.startup==='error'&&<><button onClick={pwa.retryStartup}>{t('Retry','ลองอีกครั้ง')}</button>{user&&<button onClick={()=>{offlineBlocked.current=true;setStatus('offline');pwa.useSavedOffline()}}>{t('Saved on this device','ข้อมูลที่บันทึกบนอุปกรณ์')}</button>}</>}</section>:status === 'ready' ? newLoan&&commandAccess ? <LoanForm access={commandAccess} borrowerId={newLoan.borrowerId} borrowerLabel={newLoan.label} thai={thai} onBack={()=>setNewLoan(null)} onSaved={id=>{setNewLoan(null);setFullLoan(id)}}/> : fullLoan&&commandAccess ? <FullLoanRecord access={commandAccess} id={fullLoan} thai={thai} onBack={()=>setFullLoan(null)}/> : borrowerEditor!==undefined&&commandAccess ? <BorrowerRecord key={borrowerEditor??'new'} access={commandAccess} id={borrowerEditor??undefined} thai={thai} onBack={()=>setBorrowerEditor(undefined)} onSaved={()=>{setBorrowerEditor(undefined);if(user)void load(user)}}/> : savedPayments&&commandAccess ? <OfflinePayments access={commandAccess} thai={thai}/> : borrowerPayment&&commandAccess ? <SelectedCharges access={commandAccess} borrowerId={borrowerPayment} thai={thai} onBack={()=>setBorrowerPayment(null)}/> : view==='management'&&commandAccess ? managementSection==='cash-accounts'?<ManagementCash access={commandAccess} thai={thai}/>:<ManagementWorkspace key={managementSection} section={managementSection} access={commandAccess} thai={thai}/> : view==='payments'&&commandAccess ? <StandaloneRecords key={view} access={commandAccess} kind="payments" query={appliedQuery} thai={thai}/> : view==='upcoming'&&commandAccess ? <StandaloneUpcoming access={commandAccess} thai={thai}/> : view==='dashboard'&&commandAccess ? <Dashboard access={commandAccess} thai={thai}/> : view==='cash'&&commandAccess ? <CashWorkspace access={commandAccess} thai={thai} onLanguage={value=>{setThai(value);document.documentElement.lang=value?'th':'en'}}/> : view==='expenses'&&commandAccess ? <ExpenseRecords access={commandAccess} thai={thai} readOrigin={import.meta.env.VITE_API_ORIGIN}/> : view === 'collection' ? <CollectionRecords thai={thai} request={collectionRequest} cancel={cancelPending} onStatus={setCollectionStatus} refreshToken={collectionRefresh} query={appliedQuery} commandAccess={commandAccess} /> : <><div className={'work-grid ' + (selected ? 'has-detail' : '')}><section ref={listPanel} tabIndex={0} className="list-panel borrower-directory" aria-label={t('Borrower list', 'รายชื่อผู้กู้')}><div className="section-heading root-record-heading"><h2>{t('Borrower directory', 'รายชื่อผู้กู้')}</h2>{commandAccess?.ownerTesting&&<RecordAction icon="✎" className="icon-action" aria-label={t('Add borrower','เพิ่มผู้กู้')} title={t('Add borrower','เพิ่มผู้กู้')} onClick={()=>setBorrowerEditor(null)}>+</RecordAction>}</div>{items.length ? items.map((row, index) => <React.Fragment key={row.id}>{(index === 0 || items[index - 1].hasActiveLoan !== row.hasActiveLoan) && <h3 className={'record-group-heading ' + (row.hasActiveLoan === true ? 'group-active' : row.hasActiveLoan === false ? 'group-inactive' : 'group-unknown')}>{row.hasActiveLoan === true ? t('Active borrowers', 'ผู้กู้ที่มีสัญญา') : row.hasActiveLoan === false ? t('Inactive borrowers', 'ผู้กู้ที่ไม่มีสัญญา') : t('Loan status unavailable', 'ไม่มีข้อมูลสถานะสัญญา')}</h3>}<article className={'borrower-tile '+(row.hasActiveLoan===false?'inactive ':'')+(selected?.id===row.id?'selected':'')}><button className="borrower-tile-main" disabled={busy} onClick={()=>{setBorrowerHistory(null);void openBorrower(row)}}><span><strong>{row.borrowerDisplayName??row.name??t('Unnamed borrower','ไม่ระบุชื่อผู้กู้')}</strong><span title={t('Principal outstanding','เงินต้นคงเหลือ')}>{money(row.outstandingPrincipal)}</span></span><strong className={row.totalProfitEarned==null?'':Number(row.totalProfitEarned)>0?'profit-positive':Number(row.totalProfitEarned)<0?'profit-negative':''} title={t('Total Interest Earned','ดอกเบี้ยรวมที่ได้รับ')}>{money(row.totalProfitEarned??null)}</strong></button>{commandAccess?.ownerTesting&&<button className="icon-action" aria-label={t('New loan for ','เพิ่มสินเชื่อให้ ')+(row.borrowerDisplayName??row.name??t('Unnamed borrower','ไม่ระบุชื่อผู้กู้'))} onClick={()=>setNewLoan({borrowerId:row.id,label:row.borrowerDisplayName??row.name??t('Unnamed borrower','ไม่ระบุชื่อผู้กู้')})}>+</button>}</article></React.Fragment>) : !busy && <p className="live-empty">{appliedQuery ? t('No matching borrowers.', 'ไม่พบผู้กู้ที่ตรงกับการค้นหา') : t('No visible borrower records.', 'ไม่พบรายการผู้กู้ที่แสดงได้')}</p>}<CompactPager busy={busy} previous={borrowerPage>1?()=>{if(user)void load(user,borrowerCursors.current[borrowerPage-2],borrowerPage-1)}:undefined} next={nextCursor?()=>{if(user)void load(user,nextCursor,borrowerPage+1)}:undefined} previousLabel={t('Previous borrowers page','หน้าก่อนของผู้กู้')} nextLabel={t('Next borrowers page','หน้าถัดไปของผู้กู้')}/></section><section ref={detailPanel} tabIndex={0} className={'detail-panel ' + (!selected ? 'unselected' : '')} aria-label={t('Borrower details', 'รายละเอียดผู้กู้')}>{selected ? commandAccess?.ownerTesting ? <SharedBorrowerDetail key={selected.id} access={commandAccess} id={selected.id} label={selected.borrowerDisplayName??selected.name??undefined} thai={thai} onBack={closeBorrower}/> : <><HeaderBack className="back-button icon-action" aria-label={t('Back to list','กลับไปรายการ')} onClick={closeBorrower}>←</HeaderBack><h2>{selected.borrowerDisplayName??selected.name}</h2><div className="detail-amounts"><div><span>{t('Principal outstanding','เงินต้นคงเหลือ')}</span><strong>{money(selected.outstandingPrincipal)}</strong></div></div><p>{t('Created','วันที่สร้าง')} · {date(selected.createdDate)}</p>{selected.note&&<div className="issue-note"><strong>{t('Borrower note','หมายเหตุผู้กู้')}</strong><p>{selected.note}</p></div>}<LoanRecords thai={thai} page={loanPage} items={loans} selected={selectedLoan} busy={busy} loading={loanLoading} error={loanError} nextCursor={loanCursor} listAsOf={loanAsOf} detailAsOf={loanDetailAsOf} onSelect={id => void openLoan(id)} onBack={() => { cancelPending(); setSelectedLoan(null); setLoanDetailAsOf(''); setLoanError(null); setLoanLoading(false); }} onRefresh={() => user && void loadLoans(user, selected.id, undefined, 1, true)} onPrevious={loanPage>1?()=>{if(user)void loadLoans(user,selected.id,loanCursors.current[loanPage-2],loanPage-1,true)}:undefined} onNext={() => user && loanCursor && void loadLoans(user, selected.id, loanCursor, loanPage + 1, true)} /></> : <p>{t('Select a borrower to view details.', 'เลือกผู้กู้เพื่อดูรายละเอียด')}</p>}</section></div></> : ['loading','initializing','signing_in','signing_out'].includes(status) ? null : <section className="access-blocked" role="status"><h2>{status === 'offline' ? t('Connection required', 'ต้องเชื่อมต่ออินเทอร์เน็ต') : status === 'sign_out_error' ? t('Sign-out could not be completed', 'ไม่สามารถออกจากระบบได้สำเร็จ') : status === 'signing_out' ? t('Signing out…', 'กำลังออกจากระบบ…') : status === 'auth_unavailable' ? t('Sign-in is unavailable in this browser', 'ไม่สามารถลงชื่อเข้าใช้ในเบราว์เซอร์นี้ได้') : status === 'unavailable' ? t('DEV connection is not configured', 'ยังไม่ได้ตั้งค่าการเชื่อมต่อ DEV') : status === 'denied' ? t('This account does not have access', 'บัญชีนี้ไม่มีสิทธิ์เข้าถึง') : status === 'expired' ? t('Please sign in again', 'กรุณาลงชื่อเข้าใช้อีกครั้ง') : status === 'error' ? t('Unable to load borrower records', 'ไม่สามารถโหลดข้อมูลผู้กู้ได้') : ['loading', 'initializing', 'signing_in'].includes(status) ? t('Connecting…', 'กำลังเชื่อมต่อ…') : t('Sign in to continue', 'ลงชื่อเข้าใช้เพื่อดำเนินการต่อ')}</h2><ErrorReference failure={rootError} thai={thai} />{status === 'offline' && <>{user&&offlineRepository&&/^https:\/\/mw-credit-app-command-dev-[a-z0-9.-]+\.run\.app$/.test(import.meta.env.VITE_COMMAND_API_ORIGIN||'')&&<OfflinePayments thai={thai} access={{origin:import.meta.env.VITE_COMMAND_API_ORIGIN,fixtureBorrowerId:import.meta.env.VITE_COMMAND_FIXTURE_BORROWER_ID??'',ownerTesting:import.meta.env.VITE_COMMAND_MODE==='dev-owner-testing',offline:offlineRepository,offlineOnly:true,token:async()=>{throw Error('Offline')},authFailure:()=>{}}}/>}<p>{t('Reconnect to load current records.', 'เชื่อมต่ออีกครั้งเพื่อโหลดข้อมูลปัจจุบัน')}</p><button className="secondary-button" onClick={() => window.location.reload()}>{t('Reconnect', 'เชื่อมต่ออีกครั้ง')}</button></>}{status === 'sign_out_error' && <button className="secondary-button" onClick={logout}>{t('Retry sign out', 'ลองออกจากระบบอีกครั้ง')}</button>}{status === 'auth_unavailable' && <button className="secondary-button" onClick={() => window.location.reload()}>{t('Retry sign-in setup', 'ลองตั้งค่าการลงชื่อเข้าใช้อีกครั้ง')}</button>}{['signed_out', 'expired', 'denied'].includes(status) && <button className="secondary-button" onClick={login}>{t('Continue with Google', 'ดำเนินการต่อด้วย Google')}</button>}{status === 'error' && user && <button className="secondary-button" onClick={() => { if (view === 'collection') { clear(); setStatus('ready'); setCollectionRefresh(value => value + 1); } else void load(user); }}>{t('Try again', 'ลองอีกครั้ง')}</button>}</section>}

  </main></div><dialog ref={menuDialog} className="live-menu-dialog" onClose={() => menuToggle.current?.focus({ preventScroll: true })} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), summary'));
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} onClick={event => { if (event.target === event.currentTarget) menuDialog.current?.close(); }} aria-label={t('Navigation menu', 'เมนูนำทาง')}><button autoFocus className="secondary-button" onClick={() => menuDialog.current?.close()}>{t('Close menu', 'ปิดเมนู')}</button>{navigation('drawer')}{accountControls()}</dialog>{navigation('mobile-bottom')}</div></div>;
}
createRoot(document.getElementById('root')!).render(<App />);
