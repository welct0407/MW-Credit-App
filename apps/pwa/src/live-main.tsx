// First: the troubleshooting event log listens before anything else can fail.
import {recordClientEvent} from './client-events';
import {usePreferenceSave} from './preference-save';
import {Icon} from './Icon';
import {useMenuDrawer} from './menu-drawer';
import {startOfflinePreparation,subscribeOfflinePreparation,getOfflinePreparation} from './offline-dataset';
import {subscribeOfflineDataset,readCachedJson,subscribeCachedReadFailure,hasCachedReadFailure,hasReadRefreshFailure,clearCachedReadFailures} from './read-cache';
import {useWorkspaceGestures} from './workspace-gestures';
import {WaitingToSyncButton,usePendingSnapshot} from './WaitingToSyncButton';
import {SyncStatus,SyncedToast} from './SyncStatus';
import {DataCheckIndicator,DataCheckToast,DATA_CHECK_WARNING_ID,revealWhenShown} from './DataCheck';
import {startSavedRequestSync,syncSavedRequests} from './offline-sync';
import {signOutGuard,syncNowLabel} from './sign-out-guard';
import {signInFailureMessage} from './sign-in-failure';
import {Notifications} from './Notifications';
import {About} from './About';
import {PaymentRecord as NotificationPaymentRecord} from './PaymentRecord';
import {liveOfflineEnabled,applicationEnvironment,commandOriginAllowed,chatOriginAllowed,liveConfiguration,firebaseIssuer} from './environment';
import {RecordAction} from './RecordAction';
import {HeaderBack,useHeaderBack} from './HeaderBack';
import {useSwipeBack,replaceBackTransition} from './swipe-back';
import type {ManagementSection} from './ManagementWorkspace';
import {managementViews,workspaceViews,liveTitle,LiveBrand} from './live/LiveHeader';
import {StartupStatus} from './live/StartupStatus';
import {businessWorkspaceView,loadManagement,preloadManagementWhenIdle} from './live/WorkspaceViews';
import {limitAppZoom} from './zoom-guard';
import {SharedBorrowerDetail,BorrowerUpcoming} from './SharedBorrowerDetail';
import {flushSync} from 'react-dom';
import {displayDate,displayTimestamp,displayValue} from './display-date';
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
import {useOnline} from './online-status';
import { createRoot } from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import { initializeAuth, browserPopupRedirectResolver, GoogleAuthProvider, browserLocalPersistence, inMemoryPersistence, onAuthStateChanged, signInWithPopup, signOut, type Auth, type User } from 'firebase/auth';
import './style.css';
import './live-style.css';
import { CollectionRecords, type CollectionReadError } from './CollectionRecords';
import { LoanRecords, type LoanRecord, type LoanPageResult, type LoanDetailResult } from './LoanRecords';

const logo = applicationEnvironment==='prod'?new URL('./assets/loan-manager-logo-prod-pink.png',import.meta.url).href:new URL('./assets/loan-manager-logo-dev-orange.png',import.meta.url).href;
type Borrower = { id: string; name: string | null; borrowerDisplayName: string; totalProfitEarned: string | null; createdDate: string | null; hasActiveLoan: boolean | null; outstandingPrincipal: string | null; note: string | null };
type PageResult = { ok: true; source: 'dev'|'prod'; items: Borrower[]; nextCursor: string | null; asOf: string; businessDate: string };
type DetailResult = { ok: true; source: 'dev'|'prod'; item: Borrower };
const configuration=()=>liveConfiguration(import.meta.env);
const businessWorkspace=import.meta.env.VITE_COMMAND_MODE==='dev-owner-testing'||(applicationEnvironment==='prod'&&import.meta.env.VITE_COMMAND_MODE==='production-business');
// R090: the Chat item exists only in a build that names a valid chat service origin (rollback is one build variable).
const chatOrigin:string|null=chatOriginAllowed(import.meta.env.VITE_CHAT_API_ORIGIN??'')?import.meta.env.VITE_CHAT_API_ORIGIN:null;
const ChatWorkspace=React.lazy(()=>import('./chat/ChatWorkspace').then(module=>({default:module.ChatWorkspace})));

function App() {
  useEffect(()=>limitAppZoom(),[]);
  const pwa = usePwa();
  const pwaLatest=useRef(pwa);pwaLatest.current=pwa;
  // R083: one startup gate. Network reads and writes wait while the build check runs (saved data shows meanwhile)
  // and through an upgrade (a reload blocked by a form ends ready); a failed or offline check rejects them.
  const startupGate=useRef<{wait:Promise<void>;resolve:()=>void;reject:(error:Error)=>void}|null>(null);
  const awaitStartup=()=>{const startup=pwaLatest.current.startup;if(startup==='ready')return Promise.resolve();if(startup!=='checking'&&startup!=='upgrading')return Promise.reject(Error('startup_pending'));
    if(!startupGate.current){let resolve!:()=>void,reject!:(error:Error)=>void;const wait=new Promise<void>((done,fail)=>{resolve=()=>done();reject=fail});startupGate.current={wait,resolve,reject}}return startupGate.current.wait};
  useEffect(()=>{const gate=startupGate.current;if(!gate||pwa.startup==='checking'||pwa.startup==='upgrading')return;startupGate.current=null;if(pwa.startup==='ready')gate.resolve();else gate.reject(Error('startup_pending'))},[pwa.startup]);
  const startupHeld=['checking','upgrading','error'].includes(pwa.startup);
  const [authRevision,setAuthRevision]=useState(0);
  const offlineBlocked = useRef(!navigator.onLine);
  const [thai, setThai] = useState(false);
  const languageRevision=useRef(0),preferenceOwner=useRef<string|null>(null);
  const [updateNavigation]=useState(()=>{try{const value=JSON.parse(sessionStorage.getItem('mw-app-update-navigation')??'null');sessionStorage.removeItem('mw-app-update-navigation');return value as {view?:string;management?:string}|null}catch{return null}});
  const [managementSection,setManagementSection]=useState<ManagementSection>(managementViews.some(item=>item.id===updateNavigation?.management)?updateNavigation!.management as ManagementSection:'cash-accounts'),[managementExpanded,setManagementExpanded]=useState(false);
  const [view, setView] = useState<'borrowers' | 'collection' | 'expenses' | 'cash' | 'dashboard' | 'upcoming' | 'loans' | 'payments' | 'management' | 'notifications' | 'about' | 'chat'>(()=>{const saved=updateNavigation?.view;return saved==='about'?saved:saved&&(saved!=='chat'||chatOrigin)&&workspaceViews.some(item=>item.id===saved)?saved as typeof workspaceViews[number]['id']:businessWorkspace?'dashboard':'borrowers'});
  const [searchOpen, setSearchOpen] = useState(false);
  const [chatTitle,setChatTitle]=useState('');
  // R090 batch 2 (B3): a chat-reply notification tap opens that thread (same nonce pattern as Notifications' openRequest).
  const [chatOpen,setChatOpen]=useState<{threadId:string;nonce:number}|null>(null);
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
  const refreshButton=useRef<HTMLButtonElement|null>(null);
  const workspace=useRef<HTMLElement|null>(null),searchBack=useRef<HTMLButtonElement|null>(null),searchBackToken=useRef(Symbol('search-back'));

  const topbar = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const header = topbar.current;
    if (!header) return;
    const measure = () => { (header.closest('.live-shell') as HTMLElement | null)?.style.setProperty('--live-header-height', `${header.getBoundingClientRect().height}px`); };
    measure();
    // Border box: padding-only changes (e.g. the startup update status line) must re-measure, or sticky
    // children under the header keep a stale offset and leave a gap below it.
    const observer = new ResizeObserver(measure); observer.observe(header, { box: 'border-box' });
    return () => observer.disconnect();
  }, []);
  const [navigationCollapsed, setNavigationCollapsed] = useState(()=>matchMedia('(min-width:768px) and (max-width:1199px)').matches);
  useEffect(()=>{const tablet=matchMedia('(min-width:768px) and (max-width:1199px)');const entered=()=>{if(tablet.matches)setNavigationCollapsed(true)};tablet.addEventListener('change',entered);return()=>tablet.removeEventListener('change',entered)},[]);
  const collapseTabletNavigation=()=>{if(matchMedia('(min-width:768px) and (max-width:1199px)').matches)setNavigationCollapsed(true)};
  const [languageChoices, setLanguageChoices] = useState(false);
  const languageToggle = useRef<HTMLButtonElement | null>(null);
  const languagePanel = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => { if (languageChoices && navigationCollapsed) languagePanel.current?.querySelector('button')?.focus(); }, [languageChoices, navigationCollapsed]);
  const t = (en: string, th: string) => thai ? th : en;
  const [auth, setAuth] = useState<Auth | null>(null);
  const [user, setUser] = useState<User | null>(null);
  // A keep-pending purge invalidates the current repository instance; the next sign-in event (same UID included) gets a fresh one without a reload.
  const [repositoryRevision,setRepositoryRevision]=useState(0),purgeTask=useRef<Promise<void>>(Promise.resolve());
  const offlineRepository=useMemo(()=>user?ownerOfflineRepository({issuer:firebaseIssuer,uid:user.uid}):null,[user?.uid,repositoryRevision]);
  const cachedReadFailure=useSyncExternalStore(subscribeCachedReadFailure,()=>!!offlineRepository&&hasCachedReadFailure(offlineRepository.scopeName));
  const readRefreshFailed=useSyncExternalStore(subscribeCachedReadFailure,()=>!!offlineRepository&&hasReadRefreshFailure(offlineRepository.scopeName));
  const offlinePreparation=useSyncExternalStore(subscribeOfflinePreparation,()=>getOfflinePreparation(offlineRepository?.scopeName));
  useEffect(()=>{if(offlinePreparation.lastChecked!==null&&offlinePreparation.state==='ready'&&!offlinePreparation.updateFailed&&!offlinePreparation.updating)clearCachedReadFailures(offlineRepository?.scopeName)},[offlineRepository?.scopeName,offlinePreparation.lastChecked]);
  const offlineRepositoryRef=useRef(offlineRepository);offlineRepositoryRef.current=offlineRepository;
  const purgeKeepPending=(repository=offlineRepositoryRef.current)=>{if(!repository)return;purgeTask.current=repository.purge({keepPending:true}).catch(()=>{})};
  const pendingSnapshot=usePendingSnapshot(offlineRepository),pendingCount=pendingSnapshot.count,pendingVisible=pendingSnapshot.visible,signOutControl=signOutGuard(pendingCount,thai,pendingVisible);
  const [syncingNow,setSyncingNow]=useState(false),[syncFeedback,setSyncFeedback]=useState('');
  // Sync state and failures show beside the refresh icon (SyncStatus); there is no separate paused banner or Retry.
  const online=useOnline();
  // sw.js asks each open tab for its running entry on activation so that build's cache is kept (R072).
  // APP-OFFLINE-05: a notification tap in an open tab arrives from sw.js; it opens in place, or waits while a form or command is active.
  const [incomingNotification,setIncomingNotification]=useState<{eventId:string;nonce:number}|null>(null),[notificationRequest,setNotificationRequest]=useState<{eventId:string;nonce:number}|null>(null);
  useEffect(()=>{if(!('serviceWorker' in navigator))return;const receive=(event:MessageEvent)=>{const data=event.data;if(data?.type==='GET_CLIENT_ENTRY'){event.ports[0]?.postMessage({entry:Array.from(document.scripts).map(script=>new URL(script.src||location.href)).find(url=>url.origin===location.origin&&/^\/assets\/[^/]+\.js$/.test(url.pathname))?.pathname??null});return}if(data?.type!=='NOTIFICATION_OPEN'||typeof data.eventId!=='string'||!/^[a-f0-9-]{36}$/.test(data.eventId))return;event.ports[0]?.postMessage({handled:true});setIncomingNotification({eventId:data.eventId,nonce:Date.now()})};navigator.serviceWorker.addEventListener('message',receive);return()=>navigator.serviceWorker.removeEventListener('message',receive)},[]);
  const [appUpdated,setAppUpdated]=useState(false);
  useEffect(()=>{let updated=false;try{updated=sessionStorage.getItem('mw-app-updated')==='1';sessionStorage.removeItem('mw-app-updated')}catch{/* The notice is optional. */}if(!updated)return;const show=setTimeout(()=>setAppUpdated(true),300),hide=setTimeout(()=>setAppUpdated(false),4300);return()=>{clearTimeout(show);clearTimeout(hide)}},[]);
  const openSavedChanges=()=>menuDrawer.close(()=>setSavedPayments(true));
  // UX-RECON-06: the header indicator opens the Saved changes page at the data-check line.
  const openDataCheck=()=>{openSavedChanges();revealWhenShown('#'+DATA_CHECK_WARNING_ID)};
  const [fullLoan,setFullLoan]=useState<string|null>(null);
  const [borrowerRecordRevision,setBorrowerRecordRevision]=useState(0);
  const [borrowerHistory,setBorrowerHistory]=useState<string|null>(null);
  const [notificationPayment,setNotificationPayment]=useState<string|null>(null);
  const [newLoan,setNewLoan]=useState<{borrowerId:string;label:string}|null>(null);
  const [borrowerEditor,setBorrowerEditor]=useState<string|null|undefined>(undefined);
  const [borrowerPayment,setBorrowerPayment]=useState<string|null>(null);
 const [savedPayments,setSavedPayments]=useState(false);
  const [aboutOverlay,setAboutOverlay]=useState(false),aboutTrigger=useRef<string|null>(null);
  const [status, setStatus] = useState('initializing');
  useLayoutEffect(()=>{clearCachedReadFailures(offlineRepository?.scopeName)},[view,activeBack?.navigationKey,managementSection,user?.uid]);
  useSwipeBack(workspace,searchOpen?searchBack:menuToggle,searchOpen?{token:searchBackToken.current,navigationKey:'search',disabled:false}:activeBack,(user?.uid??'')+':'+view+':'+(status==='ready'?'ready':'unavailable'));
  const menuDrawer=useMenuDrawer(menuDialog,(user?.uid??'')+':'+view+':'+status);
  const [temporarySignIn, setTemporarySignIn] = useState(false);
  const [signInError,setSignInError]=useState<{code?:string}|null>(null);
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
  const pendingReads=useRef(new Set<AbortController>());
  const config = useRef<ReturnType<typeof configuration> | null>(null);
  const currentUser = useRef<User | null>(null);
  const clearLoans = () => { setLoans([]); setSelectedLoan(null); setLoanCursor(null); setLoanAsOf(''); setLoanDetailAsOf(''); setLoanLoading(false); setLoanError(null); setLoanPage(1); };
  const cancelPending = () => { generation.current++;for(const controller of pendingReads.current)controller.abort();pendingReads.current.clear();pending.current?.abort(); pending.current = null; setBusy(false); };
  const clear = () => { setNewLoan(null);setFullLoan(null);setBorrowerEditor(undefined);setPostedNotice(null);setPostedDetails(false);setSavedPayments(false); setBorrowerPayment(null); setRootError(null); cancelPending(); clearLoans(); setItems([]); setSelected(null); setNextCursor(null); setAsOf(''); setBorrowerPage(1); };
  const closeBorrower = () => { cancelPending(); clearLoans(); setSelected(null); };
  const failLoans = (failure: ReadFailure<'not_found' | 'unavailable'>) => { clearLoans(); setLoanError(failure); };
  useEffect(() => {
    const disconnected = () => {
      offlineBlocked.current = true;
      if(liveOfflineEnabled&&currentUser.current){cancelPending();setStatus(previous=>previous==='ready'?'ready':'offline');}
      else {resetSearch();clear(); setCollectionStatus('idle'); setStatus('offline');}
      menuDialog.current?.close();
    };
    let checkingConnection=false;
    const connected=()=>{
      if(!liveOfflineEnabled||!navigator.onLine||checkingConnection)return;
      const blocked=offlineBlocked.current;offlineBlocked.current=false;
      if(pwaLatest.current.startup==='offline')pwaLatest.current.retryStartup();
      if(blocked){setAuthRevision(value=>value+1);return;}
      const repository=offlineRepositoryRef.current;if(!repository)return;
      checkingConnection=true;void repository.syncAuthorized().then(authorized=>{if(!authorized&&offlineRepositoryRef.current===repository)setAuthRevision(value=>value+1)}).catch(()=>{}).finally(()=>{checkingConnection=false});
    };
    const visible=()=>{if(document.visibilityState==='visible')connected()};
    window.addEventListener('offline', disconnected);
    window.addEventListener('online', connected);window.addEventListener('focus',connected);window.addEventListener('pageshow',connected);document.addEventListener('visibilitychange',visible);
    if (offlineBlocked.current) disconnected();
    return () => {window.removeEventListener('offline', disconnected);window.removeEventListener('online',connected);window.removeEventListener('focus',connected);window.removeEventListener('pageshow',connected);document.removeEventListener('visibilitychange',visible)};
  }, []);
  async function expireSession(failure: ReadFailure | null = null) {
    purgeKeepPending();
    resetSearch(); signingOut.current = true;
    clear(); currentUser.current = null; setUser(null); setStatus('signing_out');
    try {
      if (!authInstance.current) throw new Error('auth_unavailable');
      await signOut(authInstance.current);
      signingOut.current = false; setRootError(offlineBlocked.current ? null : failure); setStatus(offlineBlocked.current ? 'offline' : 'expired');
    } catch { setStatus('sign_out_error'); }
  }
  async function request<T>(signedInUser: User, path: string, localError?: (failure: ReadFailure<'not_found' | 'unavailable'>) => void, onDateChanged?: (failure: ReadFailure<'business_date_changed'>) => void, onCached?: (value:T)=>void): Promise<T | null> {
    if (pwa.startup!=='ready'&&pwa.startup!=='checking'&&pwa.startup!=='upgrading'&&!(liveOfflineEnabled&&pwa.startup==='offline')) return null;
    const controller = new AbortController();pendingReads.current.add(controller); pending.current = controller;
    const revision = generation.current;
    setRootError(null); setBusy(true);
    try {
      const repository=offlineRepositoryRef.current;
      const {response,data:result,fromCache}=await readCachedJson<any>({origin:config.current!.apiOrigin,offline:repository??undefined,awaitStartup,token:async()=>{await awaitStartup();if(currentUser.current!==signedInUser)throw Error('Session unavailable');return signedInUser.getIdToken()},authFailure:code=>{if(code===401)void expireSession();else {purgeKeepPending(repository);clear();setStatus('denied')}}},path,{signal:controller.signal,onCached:value=>{if(!controller.signal.aborted&&revision===generation.current&&currentUser.current===signedInUser&&value.ok===true&&value.source===applicationEnvironment){setStatus('ready');setBusy(false);onCached?.(value)}}});
      if (controller.signal.aborted || revision !== generation.current || currentUser.current !== signedInUser) return null;
      if (!response.ok) {
        if (response.status === 401) { await expireSession({ code: 'session_invalid', reference: responseReference(response) }); return null; }
        if (response.status === 409 && onDateChanged) { onDateChanged({ code: 'business_date_changed', reference: responseReference(response) }); return null; }
        if (localError && response.status !== 401 && response.status !== 403) { localError({ code: response.status === 404 ? 'not_found' : 'unavailable', reference: responseReference(response) }); return null; }
        if (response.status === 403) {purgeKeepPending();resetSearch();}
        clear(); setRootError({ code: response.status === 403 ? 'access_denied' : 'unavailable', reference: responseReference(response) });
        setStatus(response.status === 401 ? 'expired' : response.status === 403 ? 'denied' : 'error');
        return null;
      }
      if (controller.signal.aborted || revision !== generation.current || currentUser.current !== signedInUser) return null;
      if (result.ok !== true || result.source !== applicationEnvironment) throw new Error('invalid_response');
      if(!fromCache)void repository?.authorize().catch(()=>{});
      setStatus('ready');
      return result as T;
    } catch (error) {
      // R083: a read stopped by the startup gate with no saved data keeps the shown workspace (the startup banner explains).
      if (error instanceof Error && error.message === 'startup_pending') return null;
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      if (!controller.signal.aborted && revision === generation.current && ['auth/user-token-expired', 'auth/invalid-user-token', 'auth/user-disabled'].includes(code)) { await expireSession(); return null; }
      if (!controller.signal.aborted && revision === generation.current) { if (localError) localError({ code: 'unavailable' }); else { clear(); setStatus('error'); } }
      return null;
    } finally {pendingReads.current.delete(controller);if(revision===generation.current&&!pendingReads.current.size)setBusy(false); }
  }
  const collectionRequest = <T,>(path: string, onError: (failure: ReadFailure<CollectionReadError>) => void, onCached?: (value:T)=>void) => user
    ? request<T>(user, path, onError, failure => onError(failure),onCached) : Promise.resolve(null);
  function changeView(next: 'borrowers' | 'collection' | 'expenses' | 'cash' | 'dashboard' | 'upcoming' | 'loans' | 'payments' | 'management' | 'notifications' | 'about' | 'chat') {
    menuDrawer.close(()=>{
      setBorrowerEditor(undefined);
    setNotificationPayment(null);
    if (next === view && !savedPayments && !borrowerPayment && !fullLoan && !notificationPayment) return;
    resetSearch(); setCollectionStatus('idle');
    const change=()=>{flushSync(()=>{clear();setView(next)});if(next==='borrowers'&&user)void load(user)};const transition=(document as Document&{startViewTransition?:(callback:()=>void)=>unknown}).startViewTransition;if(transition&&!matchMedia('(prefers-reduced-motion: reduce)').matches)transition.call(document,change);else change();
    });
  }
  async function load(signedInUser: User, cursor?: string, page = 1, query = searchQuery.current) {
    if(page===1)borrowerCursors.current=[undefined];borrowerCursors.current[page-1]=cursor;
    cancelPending(); clearLoans(); setSelected(null);
    requestAnimationFrame(() => resetScroll(listPanel.current));
    const apply=(result:PageResult)=>{setItems(result.items);setNextCursor(result.nextCursor);setAsOf(result.asOf);setBorrowerPage(page)};
    const result = await request<PageResult>(signedInUser, '/api/borrowers?limit=25' + (query ? '&q=' + encodeURIComponent(query) : '') + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),undefined,undefined,apply);
    if(result)apply(result);
  }
  async function loadLoans(signedInUser: User, borrowerId: string, cursor?: string, page = 1, scrollToLoans = false) {
    if(page===1)loanCursors.current=[undefined];loanCursors.current[page-1]=cursor;
    setLoans([]); setSelectedLoan(null); setLoanError(null); setLoanCursor(null); setLoanAsOf(''); setLoanDetailAsOf(''); setLoanLoading(true);
    const revision = generation.current;
    const apply=(value:LoanPageResult)=>{if(revision!==generation.current)return;setLoans(value.items);setLoanCursor(value.nextCursor);setLoanAsOf(value.asOf);setLoanPage(page);setLoanLoading(false)};
    const result = await request<LoanPageResult>(signedInUser, '/api/borrowers/' + encodeURIComponent(borrowerId) + '/loans?limit=25' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), failLoans,undefined,apply);
    if (revision !== generation.current) return;
    setLoanLoading(false);
    if (result) { apply(result); if (scrollToLoans) setLoanPageRevision(value => value + 1); }
  }
  async function openBorrower(row: Borrower) {
    if (!user) return;
    cancelPending(); clearLoans(); setSelected(null);
    const detail = await request<DetailResult>(user, '/api/borrowers/' + encodeURIComponent(row.id),undefined,undefined,value=>setSelected(value.item));
    if (detail) { setSelected(detail.item); requestAnimationFrame(() => resetScroll(detailPanel.current)); await loadLoans(user, detail.item.id); }
  }
  async function openLoan(id: string) {
    if (!user || !selected) return;
    setSelectedLoan(null); setLoanError(null); setLoanDetailAsOf(''); setLoanLoading(true);
    const revision = generation.current;
    const result = await request<LoanDetailResult>(user, '/api/borrowers/' + encodeURIComponent(selected.id) + '/loans/' + encodeURIComponent(id), failLoans,undefined,value=>{if(revision===generation.current){setSelectedLoan(value.item);setLoanDetailAsOf(value.asOf);setLoanLoading(false)}});
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
        if(!next||currentUser.current&&currentUser.current.uid!==next.uid)purgeKeepPending();
        if(next&&offlineRepositoryRef.current?.revoked())void purgeTask.current.then(()=>{if(!disposed)setRepositoryRevision(value=>value+1)});
        if (offlineBlocked.current) { clear();currentUser.current=next;setUser(next);setStatus('offline');return; }
        resetSearch(); clear(); currentUser.current = next; setUser(next);setAuthRevision(value=>value+1);
        if (next) { setSignInError(null); setView(businessWorkspace?'dashboard':'borrowers'); setStatus('loading'); } else setStatus('signed_out');
      }, () => { if (!disposed && !offlineBlocked.current) { clear(); setStatus('auth_unavailable'); } });
    } catch { setStatus(offlineBlocked.current ? 'offline' : 'unavailable'); }
    return () => { disposed = true; unsubscribe?.(); generation.current++;for(const controller of pendingReads.current)controller.abort();pendingReads.current.clear();pending.current?.abort(); };
  }, []);
  // R083: while the build check runs, a device-authorized session shows its saved workspace; reads wait at the startup gate.
  // The borrower list loaded then completes itself once the check is ready, so it is not loaded twice.
  const loadedWhileChecking=useRef(false);
  useEffect(()=>{if(!user)return;let active=true;const loaded=loadedWhileChecking.current;if(pwa.startup!=='upgrading')loadedWhileChecking.current=false;if(liveOfflineEnabled&&(offlineBlocked.current||pwa.startup==='offline')){void offlineRepository?.syncAuthorized().then(authorized=>{if(!active||currentUser.current!==user)return;if(authorized){setStatus('ready');if(!businessWorkspace)void load(user)}else setStatus('offline')});return()=>{active=false}}
    if(pwa.startup==='checking'){if(!(liveOfflineEnabled&&offlineRepository))return;void offlineRepository.syncAuthorized().then(authorized=>{if(!active||!authorized||currentUser.current!==user)return;setStatus('ready');if(!businessWorkspace){loadedWhileChecking.current=true;void load(user)}}).catch(()=>{});return()=>{active=false}}
    if(pwa.startup!=='ready')return;if(businessWorkspace)setStatus('ready');else if(!loaded)void load(user)},[user,pwa.startup,authRevision,offlineRepository]);
  async function login() {
    if (!auth || offlineBlocked.current) return;
    clear(); setSignInError(null); setStatus('signing_in');
    try { const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' }); await signInWithPopup(auth, provider); }
    catch (error) { clear(); const code=typeof error==='object'&&error!==null&&'code' in error?String(error.code):undefined; recordClientEvent({kind:'sign-in',code:code??'unknown'}); setSignInError({code}); setStatus(offlineBlocked.current ? 'offline' : 'signed_out'); }
  }
  async function logout() {
    // Unsynced saved requests are never discarded by sign-out; the button is disabled while they exist and this re-check enforces it (fail closed).
    let pendingRows:unknown[];try{pendingRows=await offlineRepositoryRef.current?.list('pending')??[]}catch{setStatus('sign_out_error');return;}
    if(pendingRows.length){openSavedChanges();return;}
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
  const money = (value: string | null) => value === null ? t('Unavailable', 'ไม่มีข้อมูล') : new Intl.NumberFormat(thai ? 'th-TH' : 'en-TH', { style: 'currency', currency: 'THB', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(value));
  const date = (value: string | null) => value === null ? t('Unavailable', 'ไม่มีข้อมูล') : displayDate(value);
  useContextRefresh(status==='ready'&&view==='borrowers'&&!!selected&&!businessWorkspace&&!borrowerPayment&&!savedPayments&&borrowerEditor===undefined&&!newLoan&&!fullLoan&&!notificationPayment,t('First loans page / refresh','หน้าแรกของสัญญา / รีเฟรช'),()=>{if(user&&selected)void loadLoans(user,selected.id,undefined,1,true)});
  const [refreshFeedback,setRefreshFeedback]=useState('');
  useEffect(()=>{setRefreshFeedback('')},[view,activeBack?.navigationKey]);
  function refreshCurrentScreen(){
    pwa.checkUpdate();
    // One refresh icon does everything: it also wakes the saved-change coordinator (startSavedRequestSync) to send
    // saved changes, and syncs every local dataset domain; like the 30-second poll this runs beside an open edit.
    // The all-domain prepare goes first so the queued wake (resume) joins that cycle instead of starting a partial one.
    window.dispatchEvent(new CustomEvent('mw-offline-prepare',{detail:{all:true}}));
    if(pendingCount>0)window.dispatchEvent(new Event('mw-offline-queued'));
    const editing=!!workspace.current?.querySelector('form input:not([type="hidden"]):not(:disabled):not([readonly]),form textarea:not(:disabled):not([readonly]),form select:not(:disabled),.selected-payment');
    if(editing&&(!activeRefresh||activeRefresh.priority<10)){setRefreshFeedback(t('Your edits are kept. Finish this change before refreshing its source.','เก็บข้อมูลที่แก้ไขไว้แล้ว ทำรายการนี้ให้เสร็จก่อนรีเฟรชข้อมูลต้นทาง'));return;}
    setRefreshFeedback('');clearCachedReadFailures(offlineRepository?.scopeName);if(activeRefresh){activeRefresh.run();return;}
    if(!activeBack&&!searchOpen&&!savedPayments&&borrowerEditor===undefined&&!newLoan&&!fullLoan&&!borrowerPayment){if(view==='collection'){setCollectionRefresh(value=>value+1);return;}if(view==='borrowers'&&user){void load(user);return;}}
    setRefreshFeedback(t('This screen has no refreshable data. Your current entries are kept.','หน้านี้ไม่มีข้อมูลที่ต้องรีเฟรช เก็บข้อมูลที่กรอกไว้แล้ว'));
  }
  // SETTINGS-02: once the signed-out card shows, it carries the language choice; the menu stays only where it holds more (installed app, Back).
  const signedOutCard=!user&&!['loading','initializing','signing_in','signing_out'].includes(status)&&!['checking','upgrading','error'].includes(pwa.startup);
  // HDR-SYNC-05: while offline the banner explains an unavailable screen or a saved-data read, so the icon does not turn red
  // (read-cache.ts records no refresh failure for an offline read; a failure that persists shows again once online).
  const loadedState = pendingActivity>0 ? 'loading' : readRefreshFailed ? 'error' : ['loading', 'initializing', 'signing_in', 'signing_out'].includes(status) ? 'loading' : status !== 'ready' ? ['error', 'denied', 'sign_out_error', 'auth_unavailable', 'unavailable'].includes(status) ? 'error' : 'idle' : view === 'collection' ? collectionStatus : busy ? 'loading' : 'success';
  const headerState = loadedState==='error'&&!online ? 'idle' : loadedState;
  const refreshPull=useWorkspaceGestures(workspace,{refreshing:headerState==='loading',menuMotion:menuDrawer,scope:(user?.uid??'')+':'+view+':'+(activeBack?.navigationKey??'root')+':'+searchOpen+':'+status,canOpenMenu:status==='ready'&&!activeBack&&!searchOpen,onOpenMenu:()=>{if(matchMedia('(max-width:1050px)').matches){menuDrawer.open()}else setNavigationCollapsed(false)},refreshButtonRef:refreshButton,refreshIdentity:activeRefresh});
  const navigation = (location: 'desktop' | 'mobile-bottom' | 'drawer') => {
    if (status !== 'ready') return null;
    const routes = workspaceViews.filter(route => (!['expenses','cash','dashboard','upcoming','loans','payments','management'].includes(route.id)||businessWorkspace)&&(route.id!=='chat'||!!chatOrigin)).filter(route => location === 'desktop' || (location === 'mobile-bottom' ? route.frequent : !route.frequent));
    if (!routes.length) return null;
    return <nav className={location === 'mobile-bottom' ? 'live-bottom-nav' : 'live-vertical-nav'} aria-label={t('Workspace navigation', 'เมนูพื้นที่ทำงาน')}>{routes.map(route => <React.Fragment key={route.id}><button aria-label={t(route.en, route.th)} title={t(route.en, route.th)} aria-expanded={route.id==='management'?managementExpanded:undefined} aria-current={view === route.id&&route.id!=='management' ? 'page' : undefined} onClick={() => {if(route.id==='management'){if(!managementExpanded)void loadManagement().catch(()=>{});setManagementExpanded(value=>!value);if(!managementExpanded&&location==='desktop')changeView('management')}else {collapseTabletNavigation();changeView(route.id)}}}><span className="live-nav-icon" aria-hidden="true"><Icon name={route.icon}/></span><span className="live-nav-label">{t(route.en, route.th)}{route.id==='management'&&<Icon className="nav-disclosure-icon" name={managementExpanded?'up':'down'}/>}</span></button>{route.id==='management'&&managementExpanded&&managementViews.map(item=><button className="management-nav-item" key={item.id} aria-label={t(item.en,item.th)} title={t(item.en,item.th)} aria-current={view==='management'&&managementSection===item.id?'page':undefined} onClick={()=>{collapseTabletNavigation();setManagementSection(item.id);changeView('management')}}><span className="live-nav-icon" aria-hidden="true"><Icon name={item.icon}/></span><span className="live-nav-label">{t(item.en,item.th)}</span></button>)}</React.Fragment>)}</nav>;
  };
  const chooseLanguage = (value: boolean, compact: boolean) => {
    if(preferenceSave.blocked)return;
    if(value===thai){if(compact){setLanguageChoices(false);languageToggle.current?.focus({preventScroll:true})}return;}
    const previous=thai,revision=++languageRevision.current,repository=commandAccess?.offline,owner=currentUser.current;setThai(value); document.documentElement.lang = value ? 'th' : 'en';
    if(commandAccess)void preferenceSave.save({language:value?'ไทย':'English'}).catch(()=>{if(languageRevision.current!==revision||offlineRepositoryRef.current!==repository||currentUser.current!==owner)return;setThai(previous);document.documentElement.lang=previous?'th':'en'});
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
  // R072: About is available signed in or out. Outside the signed-in workspace it opens over the current card with a Back (Escape and browser Back too).
  const aboutTransient=['loading','initializing','signing_in','signing_out'].includes(status)||['checking','upgrading'].includes(pwa.startup);
  const aboutTopLevel=status==='ready'&&!!user&&!['checking','upgrading','error'].includes(pwa.startup),showAboutOverlay=aboutOverlay&&!aboutTopLevel&&!aboutTransient;
  // UX-RECON-02: the data-check line links to About, at Troubleshooting.
  const openTroubleshooting=()=>{openAbout('data-check');revealWhenShown('.about-troubleshooting')};
  const openAbout=(trigger:string)=>{if(aboutTopLevel){changeView('about');return}aboutTrigger.current=trigger;const show=()=>{try{history.pushState({mwAbout:true},'')}catch{/* Back still works from the header. */}setAboutOverlay(true)};if(menuDialog.current?.open)menuDrawer.close(show);else show()};
  const closeAbout=()=>{if(history.state?.mwAbout)history.back();else setAboutOverlay(false)};
  // biome-ignore lint/correctness/useExhaustiveDependencies: closeAbout reads only history and a state setter.
  useEffect(()=>{if(!aboutOverlay)return;const popped=()=>setAboutOverlay(false),onEscape=(event:KeyboardEvent)=>{if(event.key!=='Escape'||event.defaultPrevented||document.querySelector('dialog[open]'))return;event.preventDefault();closeAbout()};
    window.addEventListener('popstate',popped);document.addEventListener('keydown',onEscape);return()=>{window.removeEventListener('popstate',popped);document.removeEventListener('keydown',onEscape)}},[aboutOverlay]);
  // A session that restores while About is open closes it and pops its history entry, so browser Back is not spent on it.
  useEffect(()=>{if(!aboutTopLevel||!aboutOverlay)return;setAboutOverlay(false);try{if(history.state?.mwAbout)history.back()}catch{}},[aboutTopLevel,aboutOverlay]);
  const aboutWasOpen=useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: focus returns only when the overlay closes.
  useEffect(()=>{if(showAboutOverlay){aboutWasOpen.current=true;return}if(!aboutWasOpen.current)return;aboutWasOpen.current=false;if(aboutTopLevel)return;
    const triggers=Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-about-trigger]')).filter(button=>button.getClientRects().length>0);(triggers.find(button=>button.dataset.aboutTrigger===aboutTrigger.current)??triggers[0])?.focus()},[showAboutOverlay]);
  useEffect(()=>{if(pwa.startup==='error')recordClientEvent({kind:'startup',code:'error'})},[pwa.startup]);
  const aboutButton=(icon:boolean,place:string)=>!aboutTransient&&<button type="button" className={'secondary-button'+(icon?' live-account-icon':'')} data-about-trigger={place} aria-label={t('About','เกี่ยวกับ')} title={t('About','เกี่ยวกับ')} aria-current={showAboutOverlay||aboutTopLevel&&view==='about'?'page':undefined} onClick={()=>openAbout(place)}>{icon?<Icon name="about"/>:t('About','เกี่ยวกับ')}</button>;
  const accountControls = (compact:boolean,place:'sidebar'|'drawer') => {
    // The expanded desktop sidebar has no spare height (1280×800), so About sits as an icon beside the language choice.
    const aboutBesideLanguage=place==='sidebar'&&!compact&&status==='ready'&&!!user,languageGroup=(!signedOutCard||place==='sidebar')&&(!compact || languageChoices) && <div ref={compact ? languagePanel : undefined} id={compact ? 'live-language-choices' : undefined} className="language" aria-label={t('Language', 'ภาษา')} role="group" onKeyDown={event => { if (compact && event.key === 'Escape') { event.preventDefault(); setLanguageChoices(false); languageToggle.current?.focus({ preventScroll: true }); } }}><button disabled={preferenceSave.blocked} onClick={() => chooseLanguage(false, compact)} aria-pressed={!thai}>EN</button><button disabled={preferenceSave.blocked} onClick={() => chooseLanguage(true, compact)} aria-pressed={thai}>ไทย</button></div>;
    return <div className="live-account-controls">
    {status==='ready'&&user&&<WaitingToSyncButton repository={offlineRepository} thai={thai} compact={compact} dataCheck={!!offlinePreparation.dataCheckDomains} onClick={()=>menuDrawer.close(()=>setSavedPayments(true))}/>}
    {status==='ready'&&user&&import.meta.env.VITE_NOTIFICATIONS==='enabled'&&<button className="secondary-button" aria-label={t('Notifications','การแจ้งเตือน')} title={t('Notifications','การแจ้งเตือน')} aria-current={view==='notifications'?'page':undefined} onClick={()=>changeView('notifications')}>{compact?<Icon name="notifications"/>:t('Notifications','การแจ้งเตือน')}</button>}
    {!aboutBesideLanguage&&aboutButton(compact,place)}
    {compact && <button ref={languageToggle} className="secondary-button live-account-icon" aria-label={t('Language', 'ภาษา')} title={t('Language', 'ภาษา')} aria-expanded={languageChoices} aria-controls="live-language-choices" onClick={() => setLanguageChoices(value => !value)}><Icon name="language"/></button>}
    {preferenceSave.message&&<p role="status">{preferenceSave.message}</p>}{aboutBesideLanguage?<div className="live-account-row">{languageGroup}{aboutButton(true,place)}</div>:languageGroup}
    {pwa.canonical && <div className="live-pwa-controls">
      {pwa.canInstall && !pwa.standalone && <button className="secondary-button" aria-label={t('Install app', 'ติดตั้งแอป')} title={t('Install app', 'ติดตั้งแอป')} onClick={() => void pwa.install()}>{compact ? <Icon name="install"/> : t('Install app', 'ติดตั้งแอป')}</button>}
      {!pwa.canInstall && !pwa.standalone && <details><summary aria-label={t('Installation help', 'วิธีติดตั้ง')} title={t('Installation help', 'วิธีติดตั้ง')}>{compact ? <Icon name="details"/> : t('Installation help', 'วิธีติดตั้ง')}</summary><p>{t('Use your browser menu to install or Add to Home Screen, if supported.', 'หากเบราว์เซอร์รองรับ ให้ใช้เมนูเพื่อติดตั้งหรือเพิ่มไปยังหน้าจอหลัก')}</p></details>}
      {(pwa.waiting || pwa.reloadAvailable) && <button className="secondary-button" disabled={pwa.startup!=='ready'||pwa.activating||!pwa.safe} aria-label={pwa.reloadAvailable ? t('Reload app', 'โหลดแอปใหม่') : t('Update and reload', 'อัปเดตและโหลดใหม่')} title={pwa.reloadAvailable ? t('Reload app', 'โหลดแอปใหม่') : t('Update and reload', 'อัปเดตและโหลดใหม่')} onClick={pwa.update}>{compact ? <Icon name="app-update"/> : pwa.reloadAvailable ? t('Reload app', 'โหลดแอปใหม่') : t('Update and reload', 'อัปเดตและโหลดใหม่')}</button>}
      {pwa.unavailable && <p role="status">{t('Install or update is currently unavailable. You can keep using the online app.', 'ยังไม่สามารถติดตั้งหรืออัปเดตได้ คุณยังใช้แอปออนไลน์ต่อได้')}</p>}
    </div>}
    {user && <div className="live-account-signout-group">
    {!compact && signOutControl.note && <p id={'signout-note-'+place} className="live-account-signout-note">{signOutControl.note}</p>}
    {pendingVisible>0 && commandAccess && <button className="secondary-button live-account-sync-now" disabled={syncingNow} aria-label={syncNowLabel(pendingVisible,thai)} title={syncNowLabel(pendingVisible,thai)} onClick={()=>void syncNow()}>{compact ? <Icon name="sync"/> : t('Sync now','ซิงค์ตอนนี้')}</button>}
    {pendingVisible>0 && syncFeedback && <p role="status">{syncFeedback}</p>}
    <button className="secondary-button live-account-signout" disabled={signOutControl.disabled} aria-disabled={signOutControl.disabled} aria-label={signOutControl.label} aria-describedby={!compact&&signOutControl.note?'signout-note-'+place:undefined} title={compact&&signOutControl.note?signOutControl.note:signOutControl.label} onClick={logout}>{compact ? <Icon name="signout"/> : signOutControl.label}</button>
    {pendingVisible>0 && <button className="secondary-button live-account-review-saved" aria-label={t('Review saved changes','ตรวจรายการที่บันทึก')} title={t('Review saved changes','ตรวจรายการที่บันทึก')} onClick={openSavedChanges}>{compact ? <Icon name="waiting"/> : t('Review saved changes','ตรวจรายการที่บันทึก')}</button>}
    </div>}
  </div>;};
  const commandAccess:CommandAccess|undefined=user && commandOriginAllowed(import.meta.env.VITE_COMMAND_API_ORIGIN||'') && (businessWorkspace||import.meta.env.VITE_COMMAND_FIXTURE_BORROWER_ID) ? {origin:import.meta.env.VITE_COMMAND_API_ORIGIN,fixtureBorrowerId:import.meta.env.VITE_COMMAND_FIXTURE_BORROWER_ID??'',ownerTesting:businessWorkspace,offline:offlineRepository??undefined,openSaved:openSavedChanges,...(liveOfflineEnabled?{prepareSync:prepareQueuedSync}:{}),onPosted:id=>{clear();setView('collection');setCollectionRefresh(value=>value+1);setPostedNotice(id)},awaitStartup,token:async()=>{await awaitStartup();if(pwaLatest.current.startup!=='ready'||offlineBlocked.current||currentUser.current!==user)throw Error('Session unavailable');return user.getIdToken()},authFailure:code=>{if(code===401)void expireSession();else {purgeKeepPending();clear();setStatus('denied')}}} : undefined;
  const upcomingAccess=(signedInUser:User)=>({offline:offlineRepository??undefined,awaitStartup,token:async()=>{await awaitStartup();if(pwaLatest.current.startup!=='ready'||offlineBlocked.current||currentUser.current!==signedInUser)throw Error('Session unavailable');return signedInUser.getIdToken()},authFailure:(code:number)=>{if(code===401)void expireSession();else{purgeKeepPending();clear();setStatus('denied')}}});
  const chatAccess=user&&chatOrigin?{origin:chatOrigin,...upcomingAccess(user)}:undefined;
  const preparationAccess=useRef(commandAccess);preparationAccess.current=commandAccess;
  const troubleshootingContext=()=>({pwa,status,rootError,signInErrorCode:signInError?.code??null,uid:user?.uid??null,hasCommandAccess:!!commandAccess,repository:offlineRepository,preparation:offlineRepository?offlinePreparation:null});
  useEffect(()=>{
    if(!commandAccess||status!=='ready'||view!=='borrowers'||busy)return;
    const cursor=borrowerCursors.current[borrowerPage-1],stops=[subscribeOfflineDataset<PageResult>(commandAccess,'/api/borrowers?limit=25'+(appliedQuery?'&q='+encodeURIComponent(appliedQuery):'')+(cursor?'&cursor='+encodeURIComponent(cursor):''),value=>{setItems(value.items);setNextCursor(value.nextCursor);setAsOf(value.asOf)},undefined,{hold:()=>listPanel.current})];
    if(selected){const base='/api/borrowers/'+encodeURIComponent(selected.id),loanCursor=loanCursors.current[loanPage-1];stops.push(subscribeOfflineDataset<DetailResult>(commandAccess,base,value=>setSelected(value.item)));stops.push(subscribeOfflineDataset<LoanPageResult>(commandAccess,base+'/loans?limit=25'+(loanCursor?'&cursor='+encodeURIComponent(loanCursor):''),value=>{setLoans(value.items);setLoanCursor(value.nextCursor);setLoanAsOf(value.asOf)},undefined,{hold:()=>detailPanel.current}));if(selectedLoan)stops.push(subscribeOfflineDataset<LoanDetailResult>(commandAccess,base+'/loans/'+encodeURIComponent(selectedLoan.id),value=>{setSelectedLoan(value.item);setLoanDetailAsOf(value.asOf)}))}
    return()=>stops.forEach(stop=>{stop()});
  },[offlineRepository,status,view,appliedQuery,borrowerPage,loanPage,selected?.id,selectedLoan?.id,busy]);
  useEffect(()=>{if(status!=='ready'||startupHeld||!commandAccess||!liveOfflineEnabled)return;return startOfflinePreparation({...commandAccess,token:async()=>{const access=preparationAccess.current;if(!access)throw Error('Session unavailable');return access.token()},authFailure:code=>preparationAccess.current?.authFailure(code)},{readOrigin:import.meta.env.VITE_API_ORIGIN})},[user?.uid,offlineRepository,status==='ready'&&!startupHeld]);
  const preparingSync=useRef<{repository:typeof offlineRepository;task:Promise<void>}|null>(null);
  async function prepareQueuedSync(){
    const repository=offlineRepository;
    if(!liveOfflineEnabled||!repository||!user||currentUser.current!==user||!navigator.onLine)throw Error('Connection required');
    offlineBlocked.current=false;
    // R083: a queued sync waits for the startup check; an offline or failed check is retried and this attempt stops.
    if(pwaLatest.current.startup==='offline'||pwaLatest.current.startup==='error')pwaLatest.current.retryStartup();
    await awaitStartup();
    if(await repository.syncAuthorized())return;
    if(preparingSync.current?.repository===repository)return preparingSync.current.task;
    const task=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{
      const token=await user.getIdToken();if(currentUser.current!==user||offlineRepositoryRef.current!==repository||controller.signal.aborted)throw Error('Session unavailable');
      const response=await fetch(import.meta.env.VITE_COMMAND_API_ORIGIN+'/api/preferences',{headers:{Authorization:'Bearer '+token},signal:controller.signal,cache:'no-store',credentials:'omit',redirect:'error'});
      if(currentUser.current!==user||offlineRepositoryRef.current!==repository)throw Error('Session unavailable');
      if(response.status===401||response.status===403){commandAccess?.authFailure(response.status);throw Error('Authentication required')}
      if(!response.ok)throw Error('Connection unavailable');await repository.authorize();
    }finally{clearTimeout(timer)}})();
    preparingSync.current={repository,task};try{await task}finally{if(preparingSync.current?.task===task)preparingSync.current=null}
  }
  const preferenceSave=usePreferenceSave(commandAccess,thai);
  useEffect(()=>{const language=preferenceSave.pending?.command?.inputs?.language;if(language){languageRevision.current++;setThai(language==='ไทย');document.documentElement.lang=language==='ไทย'?'th':'en'}},[preferenceSave.pending]);
  const latestCommandAccess=useRef(commandAccess);latestCommandAccess.current=commandAccess;
  async function syncNow(){
    const access=latestCommandAccess.current;if(!access||syncingNow)return;setSyncingNow(true);setSyncFeedback('');
    try{const result=await syncSavedRequests(access);window.dispatchEvent(new Event('mw-offline-saved'));if(result.reason==='offline'){setSyncFeedback(t('Waiting for a connection. Saved changes remain on this device.','รอการเชื่อมต่อ รายการที่บันทึกยังอยู่บนอุปกรณ์'));return;}if(result.reason==='connection'&&pwaLatest.current.startup!=='ready'){setSyncFeedback(t('Checking the app version. Try again in a moment.','กำลังตรวจสอบเวอร์ชันแอป โปรดลองอีกครั้งในอีกสักครู่'));return;}if(result.remaining>0)openSavedChanges();}catch{}
    finally{setSyncingNow(false)}
  }
  useEffect(()=>{
    if(!liveOfflineEnabled||status!=='ready'||pwa.startup!=='ready'||!commandAccess?.offline)return;
    const initial=commandAccess;
    return startSavedRequestSync({...initial,prepareSync:()=>{const current=latestCommandAccess.current;if(!current||current.offline!==initial.offline)throw Error('Session unavailable');return current.prepareSync?.()??Promise.resolve()},token:()=>{const current=latestCommandAccess.current;if(!current||current.offline!==initial.offline)throw Error('Session unavailable');return current.token()},authFailure:code=>{const current=latestCommandAccess.current;if(current&&current.offline===initial.offline)current.authFailure(code)}});
  },[user?.uid,offlineRepository,status,pwa.startup]);
  useEffect(()=>{setNotificationPayment(null);setIncomingNotification(null);setNotificationRequest(null)},[user?.uid]);
  const notificationsEnabled=import.meta.env.VITE_NOTIFICATIONS==='enabled';
  const openNotification=(request:{eventId:string;nonce:number})=>{setIncomingNotification(null);changeView('notifications');setNotificationRequest(request)};
  // biome-ignore lint/correctness/useExhaustiveDependencies: route only on arrival, session readiness or when the form blocker clears.
  useEffect(()=>{if(incomingNotification&&notificationsEnabled&&status==='ready'&&commandAccess&&pwa.safe)openNotification(incomingNotification)},[incomingNotification,status,!!commandAccess,pwa.safe]);
  useEffect(()=>status==='ready'&&businessWorkspace&&commandAccess?preloadManagementWhenIdle():undefined,[status==='ready',!!commandAccess]);
  useEffect(()=>{
    if(!user){preferenceOwner.current=null;return;}
    if(status!=='ready'||!commandAccess?.ownerTesting)return;
    const applyPreference=preferenceOwner.current!==user.uid;preferenceOwner.current=user.uid;
    let active=true;const revision=languageRevision.current,done=beginRequest(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    const current=()=>active&&currentUser.current===user&&offlineRepositoryRef.current===commandAccess.offline&&revision===languageRevision.current;
    const pendingLanguage=async()=>{const rows=await commandAccess.offline?.list('pending');return rows?.find(row=>row.value.command?.operation==='preference.update')?.value.command.inputs.language};
    const apply=(language:string|undefined)=>{if(current()&&applyPreference&&['English','ไทย'].includes(language??'')){setThai(language==='ไทย');document.documentElement.lang=language==='ไทย'?'th':'en'}};
    void(async()=>{try{
      const saved=await commandAccess.offline?.snapshot<{language:string}>('preference-language');
      const queued=await pendingLanguage();
      if(await commandAccess.offline?.authorized())apply(queued??saved?.value.language);
      const {response,data,fromCache}=await readCachedJson<any>(commandAccess,'/api/preferences',{signal:controller.signal});
      if(!active||!response.ok)return;
      // Pending selection may predate this effect or arrive during the read.
      const latestQueued=await pendingLanguage();
      const value=latestQueued??(fromCache&&saved?saved.value.language:data.item?.language);
      if(current()&&!latestQueued&&!fromCache&&['English','ไทย'].includes(value))await commandAccess.offline?.saveSnapshot('preference-language',{charges:[],language:value});
      if(active&&liveOfflineEnabled&&!fromCache)await commandAccess.offline?.authorize();
      apply(value);
    }catch{}finally{clearTimeout(timer);done()}})();
    return()=>{active=false;controller.abort()};
  },[user,status,authRevision]);
  // R083: the saved workspace stays during the check and an upgrade. A failed check keeps it, with a banner, only when
  // it was shown during the check; otherwise the startup card replaces it as before.
  const workspaceVisible=!!user&&status==='ready',workspaceShown=useRef(false);
  if(!workspaceVisible)workspaceShown.current=false;else if(pwa.startup==='checking')workspaceShown.current=true;
  const startupCard=['checking','upgrading'].includes(pwa.startup)&&!workspaceVisible||pwa.startup==='error'&&!(workspaceVisible&&workspaceShown.current);
  const businessView=commandAccess?businessWorkspaceView({view,managementSection,access:commandAccess,thai,query:appliedQuery,readOrigin:import.meta.env.VITE_API_ORIGIN,onLanguage:value=>{setThai(value);document.documentElement.lang=value?'th':'en'}}):null;
  return <div className="app-shell live-shell" data-preview-theme={applicationEnvironment} data-pull-phase={refreshPull?.phase} style={{'--workspace-pull':(refreshPull?.distance??0)+'px'} as React.CSSProperties}><div className="workspace">
    <div className="workspace-pull-feedback" role="status" aria-live="polite" aria-atomic="true">{refreshPull&&refreshPull.phase!=='settling'&&<span className={'workspace-pull-cue'+(refreshPull.armed?' armed':'')}><Icon name={refreshPull.phase==='refreshing'||refreshPull.armed?'refresh':'down'}/><span>{refreshPull.phase==='refreshing'?t('Refreshing…','กำลังรีเฟรช…'):refreshPull.armed?t('Release to refresh','ปล่อยเพื่อรีเฟรช'):t('Pull to refresh','ดึงลงเพื่อรีเฟรช')}</span></span>}</div>
    <header ref={topbar} className="topbar">
    {searchOpen && status === 'ready' ? <form className="live-search" role="search" aria-label={t('Borrower name search', 'ค้นหาชื่อผู้กู้')} onSubmit={event => { event.preventDefault(); submitSearch(searchDraft); }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); closeSearch(); } if (event.key === 'Enter' && (event.nativeEvent.isComposing || composing.current)) event.preventDefault(); }}>
      <button ref={searchBack} type="button" aria-label={t('Back from search', 'กลับจากการค้นหา')} title={t('Back from search', 'กลับจากการค้นหา')} onClick={closeSearch}><Icon name="back"/></button>
      <input ref={searchInput} type="search" aria-label={t('Search Thai or English name', 'ค้นหาชื่อไทยหรืออังกฤษ')} placeholder={t('Thai or English name', 'ชื่อไทยหรืออังกฤษ')} value={searchDraft} maxLength={512} onCompositionStart={() => { composing.current = true; setSearchComposing(true); cancelSearchTimer(); }} onCompositionEnd={event => { composing.current = false; setSearchComposing(false); setSearchDraft(event.currentTarget.value); }} onChange={event => { cancelSearchTimer(); event.target.setCustomValidity(''); setSearchDraft(event.target.value); }} />
      <button type="button" aria-label={t('Clear search', 'ล้างการค้นหา')} title={t('Clear search', 'ล้างการค้นหา')} onClick={() => { composing.current = false; setSearchComposing(false); setSearchDraft(''); submitSearch(''); searchInput.current?.focus(); }}><Icon name="clear"/></button>
      <button type="submit" aria-label={t('Submit search', 'ค้นหา')} title={t('Submit search', 'ค้นหา')}><span aria-hidden="true" className={searchPending || headerState === 'loading' ? 'collection-spinner' : ''}>{!(searchPending || headerState === 'loading')&&<Icon name="search"/>}</span></button>
      <span className="live-status-text" role="status" aria-live="polite">{searchPending || headerState === 'loading' ? t('Loading…', 'กำลังโหลด…') : headerState === 'error' ? t('Could not update', 'อัปเดตไม่สำเร็จ') : t('Updated', 'อัปเดตแล้ว')}</span>
    </form> : <>
    {(!signedOutCard||activeBack||(pwa.canonical&&(!pwa.standalone||pwa.waiting||pwa.reloadAvailable||pwa.unavailable)))&&<button ref={menuToggle} className={"live-menu-toggle secondary-button"+(activeBack?" has-back":"")} disabled={activeBack?.disabled} aria-label={activeBack?.label??t('Open navigation', 'เปิดเมนู')} onClick={event => activeBack?activeBack.run(event):menuDrawer.open()}><Icon name={activeBack?"back":"menu"}/></button>}
    <LiveBrand logo={logo} alt={t('MW Credit','MW สินเชื่อ')} title={showAboutOverlay?t('About','เกี่ยวกับ'):user?liveTitle(view,managementSection,t):t('MW Credit','MW สินเชื่อ')} query={view==='chat'&&user&&!showAboutOverlay?chatTitle:appliedQuery}/>
    <div className="live-header-actions">{(pwa.activating||pwa.reloading||pwa.startup==='upgrading'||pwa.startup==='checking'&&!workspaceVisible)&&<span className="app-update-status" role="status">{pwa.startup==='checking'?t('Checking app…','กำลังตรวจสอบแอป…'):pwa.activating||pwa.reloading?t('Updating app… you will return to this screen.','กำลังอัปเดตแอป… จะกลับมาที่หน้าจอนี้'):t('Updating app…','กำลังอัปเดตแอป…')}</span>}{status === 'ready' && !['expenses','cash','dashboard','upcoming','notifications','about','chat'].includes(view) && <button ref={searchToggle} className="live-header-refresh" aria-label={t('Search borrowers', 'ค้นหาผู้กู้')} title={t('Search borrowers', 'ค้นหาผู้กู้')} onClick={() => { setSearchDraft(searchQuery.current); setSearchOpen(true); }}><Icon name="search"/></button>}<span className="header-sync-cell"><SyncStatus preparation={offlinePreparation} thai={thai} visible={status==='ready'||offlinePreparation.syncActive}/></span>{status==='ready'&&user&&<DataCheckIndicator preparation={offlinePreparation} thai={thai} onOpen={openDataCheck}/>}{(user||headerState==='loading')&&<button ref={refreshButton} className={"live-header-refresh collection-update"+(headerState==='error'?' refresh-failed':'')} data-refresh-state={headerState} aria-busy={headerState==='loading'} disabled={status!=='ready'||startupHeld||headerState==='loading'} aria-label={activeRefresh?.label??(view === 'collection' ? t('Refresh Collection — return to first page', 'รีเฟรชงานติดตาม — กลับหน้าแรก') : t('Refresh Borrowers — return to first page', 'รีเฟรชผู้กู้ — กลับหน้าแรก'))} title={headerState==='error'?t('Refresh failed — tap to retry','รีเฟรชไม่สำเร็จ — แตะเพื่อลองอีกครั้ง'):activeRefresh?.label??(view === 'collection' ? t('Refresh Collection — return to first page', 'รีเฟรชงานติดตาม — กลับหน้าแรก') : t('Refresh Borrowers — return to first page', 'รีเฟรชผู้กู้ — กลับหน้าแรก'))} onClick={refreshCurrentScreen}><span aria-hidden="true" className={headerState==='loading'?'collection-spinner':''}>{headerState!=='loading'&&<Icon name="refresh"/>}</span>{headerState==='error'&&<span className="refresh-failure-badge" aria-hidden="true"><Icon name="warning"/></span>}<span className="live-status-text" role="status" aria-live="polite">{refreshFeedback||(headerState==='loading'?t('Loading…','กำลังโหลด…'):headerState==='error'?t('Could not update','อัปเดตไม่สำเร็จ'):t('Ready','พร้อม'))}</span></button>}</div>
    </>}
  </header><div className={'live-body ' + (navigationCollapsed ? 'nav-collapsed' : '')}><aside id="live-desktop-navigation" className="live-desktop-nav"><button className="live-nav-collapse" aria-expanded={!navigationCollapsed} aria-controls="live-desktop-navigation" aria-label={navigationCollapsed ? t('Expand navigation', 'ขยายเมนู') : t('Collapse navigation', 'ย่อเมนู')} title={navigationCollapsed ? t('Expand navigation', 'ขยายเมนู') : t('Collapse navigation', 'ย่อเมนู')} onClick={() => setNavigationCollapsed(value => !value)}><Icon name={navigationCollapsed?'panel-open':'panel-close'}/></button>{navigation('desktop')}{accountControls(navigationCollapsed,'sidebar')}</aside><main ref={workspace} data-workspace={view} data-management-section={managementSection} onClickCapture={event => { if (searchOpen && event.target instanceof Element && event.target.closest('button:not(:disabled)')) finishSearchNavigation(); }}>
    {refreshFeedback&&<p role="status" className="refresh-feedback">{refreshFeedback}</p>}
    {status==='ready'&&<SyncedToast thai={thai}/>}{status==='ready'&&user&&<DataCheckToast preparation={offlinePreparation} thai={thai}/>}<p role="status" className={'sync-toast'+(appUpdated?'':' idle')}>{appUpdated?t('App updated.','อัปเดตแอปแล้ว'):''}</p>
    {pwa.updateReady&&pwa.safe&&<output className="app-update-banner"><span>{t('A new version is ready.','มีเวอร์ชันใหม่พร้อมใช้')}</span><button type="button" className="secondary-button" onClick={pwa.update}>{t('Reload now','โหลดใหม่เลย')}</button><button type="button" className="secondary-button" onClick={pwa.dismissUpdate}>{t('Later','ไว้ทีหลัง')}</button></output>}
    {pwa.startup==='error'&&!startupCard&&!showAboutOverlay&&<output className="app-update-banner startup-error-banner"><span>{t("Couldn't check the app version. Changes are paused.",'ตรวจสอบเวอร์ชันแอปไม่สำเร็จ หยุดการบันทึกไว้ก่อน')}</span><button type="button" className="secondary-button" onClick={pwa.retryStartup}>{t('Retry','ลองอีกครั้ง')}</button><button type="button" className="secondary-button" data-about-trigger="startup" onClick={()=>openAbout('startup')}>{t('About','เกี่ยวกับ')}</button></output>}
    {status==='ready'&&incomingNotification&&notificationsEnabled&&!pwa.safe&&<p role="status" className="offline-preparation-status notification-waiting-status">{t('A notification is waiting. Finish or leave this form to open it.','มีการแจ้งเตือนรออยู่ ทำรายการนี้ให้เสร็จหรือออกจากหน้านี้เพื่อเปิด')}<button type="button" onClick={()=>openNotification(incomingNotification)}>{t('Open notification','เปิดการแจ้งเตือน')}</button></p>}
    {status==='ready'&&liveOfflineEnabled&&!online&&<p role="status" className="offline-mode-status">{t('You are offline. Payments and changes are saved on this device and sync when you reconnect.','ขณะนี้ออฟไลน์ รายการรับชำระและการแก้ไขจะบันทึกไว้ในอุปกรณ์นี้ และซิงค์เมื่อกลับมาเชื่อมต่อ')}</p>}
    {status==='ready'&&cachedReadFailure&&<p role="status" className="cached-read-status">{t('Showing saved data. Refresh when connected to get the latest.','กำลังแสดงข้อมูลที่บันทึกไว้ รีเฟรชเมื่อเชื่อมต่อเพื่อรับข้อมูลล่าสุด')}</p>}
    {temporarySignIn && <p role="status" className="live-scope">{t('This browser cannot remember sign-in; you will need to sign in again after refreshing.', 'เบราว์เซอร์นี้ไม่สามารถจดจำการลงชื่อเข้าใช้ได้ คุณต้องลงชื่อเข้าใช้อีกครั้งหลังรีเฟรช')}</p>}
    {status==='ready'&&postedNotice&&<div className="payment-success" role="status">{t('Payment received','รับชำระแล้ว')} <button className="text-action" onClick={()=>setPostedDetails(value=>!value)}>{t('Payment details','รายละเอียดรับชำระ')}</button></div>}{status==='ready'&&postedNotice&&postedDetails&&commandAccess&&<PaymentResult access={commandAccess} requestId={postedNotice} thai={thai}/>}
    {showAboutOverlay?<><HeaderBack navigationKey="about" aria-label={user?t('Back','กลับ'):t('Back to sign-in','กลับไปหน้าลงชื่อเข้าใช้')} onClick={closeAbout}><Icon name="back"/></HeaderBack><About pwa={pwa} thai={thai} email={user?.email??null} signedIn={!!user} logo={logo} hasCommandAccess={!!commandAccess} pendingVisible={pendingVisible} online={online} troubleshooting={troubleshootingContext}/></>:startupCard?<StartupStatus startup={pwa.startup} t={t} canUseSaved={!!user} onRetry={pwa.retryStartup} onAbout={()=>openAbout('startup')} onUseSaved={()=>{offlineBlocked.current=true;setStatus('offline');pwa.continueSavedOffline()}}/>:status === 'ready' ? notificationPayment&&commandAccess ? <NotificationPaymentRecord access={commandAccess} id={notificationPayment} thai={thai} onBack={()=>setNotificationPayment(null)}/> : newLoan&&commandAccess ? <LoanForm access={commandAccess} borrowerId={newLoan.borrowerId} borrowerLabel={newLoan.label} thai={thai} onBack={()=>setNewLoan(null)} onSaved={id=>{replaceBackTransition('root');setNewLoan(null);setFullLoan(id)}}/> : fullLoan&&commandAccess ? <FullLoanRecord access={commandAccess} id={fullLoan} thai={thai} onBack={()=>setFullLoan(null)}/> : borrowerEditor!==undefined&&commandAccess ? <BorrowerRecord key={borrowerEditor??'new'} access={commandAccess} id={borrowerEditor??undefined} thai={thai} onBack={()=>setBorrowerEditor(undefined)} onSaved={()=>{setBorrowerEditor(undefined);if(user)void load(user)}}/> : savedPayments&&commandAccess ? <OfflinePayments access={commandAccess} thai={thai} onTroubleshooting={openTroubleshooting}/> : borrowerPayment&&commandAccess ? <SelectedCharges access={commandAccess} borrowerId={borrowerPayment} thai={thai} onBack={()=>setBorrowerPayment(null)}/> : view==='notifications' ? null : view==='about' ? <About pwa={pwa} thai={thai} email={user?.email??null} signedIn={!!user} logo={logo} hasCommandAccess={!!commandAccess} pendingVisible={pendingVisible} online={online} onReviewSaved={openSavedChanges} troubleshooting={troubleshootingContext}/> : view==='chat' ? chatAccess ? <React.Suspense fallback={<p className="live-empty" role="status">{t('Loading…','กำลังโหลด…')}</p>}><ChatWorkspace access={chatAccess} thai={thai} onTitle={setChatTitle} openRequest={chatOpen}/></React.Suspense> : null : businessView ? businessView : view === 'collection' ? <CollectionRecords thai={thai} request={collectionRequest} cancel={cancelPending} onStatus={setCollectionStatus} refreshToken={collectionRefresh} query={appliedQuery} commandAccess={commandAccess} /> : <><div className={'work-grid ' + (selected ? 'has-detail' : '')}><section ref={listPanel} tabIndex={0} className="list-panel borrower-directory" aria-label={t('Borrower list', 'รายชื่อผู้กู้')}><div className="section-heading root-record-heading"><h2>{t('Borrower directory', 'รายชื่อผู้กู้')}</h2>{commandAccess?.ownerTesting&&<RecordAction icon="add" className="icon-action" aria-label={t('Add borrower','เพิ่มผู้กู้')} title={t('Add borrower','เพิ่มผู้กู้')} onClick={()=>setBorrowerEditor(null)}></RecordAction>}</div><p className="list-meaning-legend">{t('Left: principal outstanding · Right: interest earned','ซ้าย: เงินต้นคงเหลือ · ขวา: ดอกเบี้ยที่ได้รับ')}</p>{items.length ? items.map((row, index) => <React.Fragment key={row.id}>{(index === 0 || items[index - 1].hasActiveLoan !== row.hasActiveLoan) && <h3 className={'record-group-heading ' + (row.hasActiveLoan === true ? 'group-active' : row.hasActiveLoan === false ? 'group-inactive' : 'group-unknown')}>{row.hasActiveLoan === true ? t('Active borrowers', 'ผู้กู้ที่มีสัญญา') : row.hasActiveLoan === false ? t('Inactive borrowers', 'ผู้กู้ที่ไม่มีสัญญา') : t('Loan status unavailable', 'ไม่มีข้อมูลสถานะสัญญา')}</h3>}<article className={'borrower-tile '+(row.hasActiveLoan===false?'inactive ':'')+(selected?.id===row.id?'selected':'')}><button className="borrower-tile-main" disabled={busy} onClick={()=>{setBorrowerHistory(null);void openBorrower(row)}}><span><strong>{row.borrowerDisplayName??row.name??t('Unnamed borrower','ไม่ระบุชื่อผู้กู้')}</strong><span title={t('Principal outstanding','เงินต้นคงเหลือ')}>{money(row.outstandingPrincipal)}</span></span><strong className={row.totalProfitEarned==null?'':Number(row.totalProfitEarned)>0?'profit-positive':Number(row.totalProfitEarned)<0?'profit-negative':''} title={t('Total Interest Earned','ดอกเบี้ยรวมที่ได้รับ')}>{money(row.totalProfitEarned??null)}</strong></button>{commandAccess?.ownerTesting&&<button className="icon-action" aria-label={t('New loan for ','เพิ่มสินเชื่อให้ ')+(row.borrowerDisplayName??row.name??t('Unnamed borrower','ไม่ระบุชื่อผู้กู้'))} onClick={()=>setNewLoan({borrowerId:row.id,label:row.borrowerDisplayName??row.name??t('Unnamed borrower','ไม่ระบุชื่อผู้กู้')})}><Icon name="new-loan"/></button>}</article></React.Fragment>) : !busy && <p className="live-empty">{appliedQuery ? t('No matching borrowers.', 'ไม่พบผู้กู้ที่ตรงกับการค้นหา') : t('No visible borrower records.', 'ไม่พบรายการผู้กู้ที่แสดงได้')}</p>}<CompactPager busy={busy} previous={borrowerPage>1?()=>{if(user)void load(user,borrowerCursors.current[borrowerPage-2],borrowerPage-1)}:undefined} next={nextCursor?()=>{if(user)void load(user,nextCursor,borrowerPage+1)}:undefined} previousLabel={t('Previous borrowers page','หน้าก่อนของผู้กู้')} nextLabel={t('Next borrowers page','หน้าถัดไปของผู้กู้')}/></section><section ref={detailPanel} tabIndex={0} className={'detail-panel ' + (!selected ? 'unselected' : '')} aria-label={t('Borrower details', 'รายละเอียดผู้กู้')}>{selected ? commandAccess?.ownerTesting ? <SharedBorrowerDetail key={selected.id} access={commandAccess} id={selected.id} label={selected.borrowerDisplayName??selected.name??undefined} thai={thai} onBack={closeBorrower}/> : <><HeaderBack navigationKey="borrower-detail" className="back-button icon-action" aria-label={t('Back to list','กลับไปรายการ')} onClick={closeBorrower}><Icon name="back"/></HeaderBack><h2>{selected.borrowerDisplayName??selected.name}</h2><div className="detail-amounts"><div><span>{t('Principal outstanding','เงินต้นคงเหลือ')}</span><strong>{money(selected.outstandingPrincipal)}</strong></div></div><p>{t('Created','วันที่สร้าง')} · {date(selected.createdDate)}</p>{selected.note&&<div className="issue-note"><strong>{t('Borrower note','หมายเหตุผู้กู้')}</strong><p>{selected.note}</p></div>}{user&&!selectedLoan&&<BorrowerUpcoming key={selected.id} id={selected.id} thai={thai} access={upcomingAccess(user)}/>}<LoanRecords thai={thai} page={loanPage} items={loans} selected={selectedLoan} busy={busy} loading={loanLoading} error={loanError} nextCursor={loanCursor} listAsOf={loanAsOf} detailAsOf={loanDetailAsOf} onSelect={id => void openLoan(id)} onBack={() => { cancelPending(); setSelectedLoan(null); setLoanDetailAsOf(''); setLoanError(null); setLoanLoading(false); }} onRefresh={() => user && void loadLoans(user, selected.id, undefined, 1, true)} onPrevious={loanPage>1?()=>{if(user)void loadLoans(user,selected.id,loanCursors.current[loanPage-2],loanPage-1,true)}:undefined} onNext={() => user && loanCursor && void loadLoans(user, selected.id, loanCursor, loanPage + 1, true)} /></> : <p>{t('Select a borrower to view details.', 'เลือกผู้กู้เพื่อดูรายละเอียด')}</p>}</section></div></> : ['loading','initializing','signing_in','signing_out'].includes(status) ? null : <section className="access-blocked" role="status"><h2>{status === 'offline' ? t('Connection required', 'ต้องเชื่อมต่ออินเทอร์เน็ต') : status === 'sign_out_error' ? t('Sign-out could not be completed', 'ไม่สามารถออกจากระบบได้สำเร็จ') : status === 'signing_out' ? t('Signing out…', 'กำลังออกจากระบบ…') : status === 'auth_unavailable' ? t('Sign-in is unavailable in this browser', 'ไม่สามารถลงชื่อเข้าใช้ในเบราว์เซอร์นี้ได้') : status === 'unavailable' ? t(applicationEnvironment==='prod'?'Production connection is not configured':'DEV connection is not configured',applicationEnvironment==='prod'?'ยังไม่ได้ตั้งค่าการเชื่อมต่อระบบจริง':'ยังไม่ได้ตั้งค่าการเชื่อมต่อ DEV') : status === 'denied' ? t('This account does not have access', 'บัญชีนี้ไม่มีสิทธิ์เข้าถึง') : status === 'expired' ? t('Please sign in again', 'กรุณาลงชื่อเข้าใช้อีกครั้ง') : status === 'error' ? t('Unable to load borrower records', 'ไม่สามารถโหลดข้อมูลผู้กู้ได้') : ['loading', 'initializing', 'signing_in'].includes(status) ? t('Connecting…', 'กำลังเชื่อมต่อ…') : t('Sign in to continue', 'ลงชื่อเข้าใช้เพื่อดำเนินการต่อ')}</h2><ErrorReference failure={rootError} thai={thai} />{status!=='offline'&&savedPayments&&user&&offlineRepository&&commandOriginAllowed(import.meta.env.VITE_COMMAND_API_ORIGIN||'')&&<OfflinePayments thai={thai} access={{origin:import.meta.env.VITE_COMMAND_API_ORIGIN,fixtureBorrowerId:import.meta.env.VITE_COMMAND_FIXTURE_BORROWER_ID??'',ownerTesting:businessWorkspace,offline:offlineRepository,offlineOnly:true,token:async()=>{throw Error('Offline')},authFailure:()=>{}}}/>}{status === 'offline' && <>{user&&offlineRepository&&commandOriginAllowed(import.meta.env.VITE_COMMAND_API_ORIGIN||'')&&<OfflinePayments thai={thai} access={commandAccess??{origin:import.meta.env.VITE_COMMAND_API_ORIGIN,fixtureBorrowerId:import.meta.env.VITE_COMMAND_FIXTURE_BORROWER_ID??'',ownerTesting:businessWorkspace,offline:offlineRepository,offlineOnly:true,token:async()=>{throw Error('Offline')},authFailure:()=>{}}}/>}<p>{t('Reconnect to load current records.', 'เชื่อมต่ออีกครั้งเพื่อโหลดข้อมูลปัจจุบัน')}</p><button className="secondary-button" onClick={() => window.location.reload()}>{t('Reconnect', 'เชื่อมต่ออีกครั้ง')}</button></>}{status === 'sign_out_error' && <button className="secondary-button" onClick={logout}>{t('Retry sign out', 'ลองออกจากระบบอีกครั้ง')}</button>}{status === 'auth_unavailable' && <button className="secondary-button" onClick={() => window.location.reload()}>{t('Retry sign-in setup', 'ลองตั้งค่าการลงชื่อเข้าใช้อีกครั้ง')}</button>}{['signed_out', 'expired', 'denied'].includes(status) && <button className="secondary-button" onClick={login}>{t('Continue with Google', 'ดำเนินการต่อด้วย Google')}</button>}{['signed_out', 'expired', 'denied'].includes(status) && signInError && (()=>{const failure=signInFailureMessage(signInError.code,thai);return <p role="alert" className="sign-in-failure">{failure.text}{failure.code&&<> <code>{failure.code}</code></>}</p>})()}{!user && <fieldset className="language access-language" aria-label={t('Language', 'ภาษา')}><button type="button" disabled={preferenceSave.blocked} onClick={() => chooseLanguage(false, false)} aria-pressed={!thai}>EN</button><button type="button" disabled={preferenceSave.blocked} onClick={() => chooseLanguage(true, false)} aria-pressed={thai}>ไทย</button></fieldset>}{!user&&<button type="button" className="text-action access-about" data-about-trigger="card" onClick={()=>openAbout('card')}>{t('About','เกี่ยวกับ')}</button>}{status === 'error' && user && <button className="secondary-button" onClick={() => { if (view === 'collection') { clear(); setStatus('ready'); setCollectionRefresh(value => value + 1); } else void load(user); }}>{t('Try again', 'ลองอีกครั้ง')}</button>}</section>}

  {status==='ready'&&commandAccess&&import.meta.env.VITE_NOTIFICATIONS==='enabled'&&<div hidden={view!=='notifications'||!!notificationPayment||!!fullLoan}><Notifications visible={view==='notifications'&&!notificationPayment&&!fullLoan} openRequest={notificationRequest} key={user?.uid} access={commandAccess} thai={thai} onTarget={target=>{if(target.kind==='chat'){if(!chatOrigin)return;setNotificationPayment(null);setFullLoan(null);setView('chat');setChatOpen({threadId:target.id,nonce:Date.now()});return}setView('notifications');if(target.kind==='loan'){setNotificationPayment(null);setFullLoan(target.id)}else{setFullLoan(null);setNotificationPayment(target.id)}}}/></div>}
  </main></div><dialog ref={menuDialog} className="live-menu-dialog" onClose={() => menuToggle.current?.focus({ preventScroll: true })} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), summary'));
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} onClick={event => { if (event.target === event.currentTarget) menuDrawer.close(); }} aria-label={t('Navigation menu', 'เมนูนำทาง')}><button autoFocus className="secondary-button" onClick={() => menuDrawer.close()}>{t('Close menu', 'ปิดเมนู')}</button>{navigation('drawer')}{accountControls(false,'drawer')}</dialog>{navigation('mobile-bottom')}</div></div>;
}
createRoot(document.getElementById('root')!).render(<App />);
