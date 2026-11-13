import {Icon} from './Icon';
import {subscribeOfflineDataset} from './read-cache';
import {RecordAction} from './RecordAction';
import {HeaderBack} from './HeaderBack';
import {ChargeRecord} from './ChargeRecord';
import {LoanRecord} from './LoanRecord';
import {CollectionNote} from './CollectionNote';
import {CollectionChatSummary,NameWithChatMark,type GroupChat} from './CollectionChatSummary';
import {CHAT_SEEN_EVENT,chatMarkShown,markChatSeen,readChatSeen,sessionChatSeen} from './chat-seen';
import {flushChatSeen,queueChatSeen,syncChatSeen} from './chat-seen-sync';
import {SharedBorrowerDetail} from './SharedBorrowerDetail';
import {displayDate} from './display-date';
import {CollectionReceipts} from './CollectionReceipts';
import {PaymentRecord} from './PaymentRecord';
import {useContextRefresh} from './context-refresh';
import {CompactPager} from './CompactPager';
import {borrowerCount,borrowerRange} from './borrower-count';
import {PaymentHistory} from './PaymentHistory';
import {SelectedCharges,type CommandAccess} from './SelectedCharges';
import {LateChargeStepper,LateChargeSaving,LATE_STEP,lateAtFloor,lateNote,useLateChargeShortcut,type LatePending} from './LateChargeStepper';
import {useOnline} from './online-status';
import {wholeText} from './whole-number-input';
import { ErrorReference, type ReadFailure } from './ReadFailure';
import { UpcomingCharges, type UpcomingSummary, type UpcomingDetail } from './UpcomingCharges';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {useListReturn} from './list-return';

type CollectionStatus = 'not_paid' | 'partially_paid' | 'overdue' | 'long_overdue' | 'fully_paid';
// R146: chatSummaryAt is the group chat summary's last substantive message time (list mark); the detail carries groupChat.
// R149: chatSeenAt is this user's own seen time from the server (omitted by a service or database without V147).
type Summary = { id: string; displayName: string; chatSummaryAt?: string | null; chatSeenAt?: string | null; status: CollectionStatus; overdueDays?: number | null; sinceLastPaymentDays?: number | null; neverPaid?: boolean | null; amountDue: string | null; amountCollected: string | null; amountRemaining: string | null; prepaidToday?: string | null; prepaidOnly?: boolean; prepaidPaymentDate?: string | null; prepaidSource?: 'rebate_offset'; groupRemaining?:string|null;groupCollected?:string|null };
// R097: exact sum of two API decimal strings; null when either is unavailable.
const addDecimal=(a:string|null,b:string|null)=>{if(typeof a!=='string'||typeof b!=='string')return null;const scale=Math.max((a.split('.')[1]??'').length,(b.split('.')[1]??'').length),units=(v:string)=>{const [i,f='']=v.replace('-','').split('.'),n=BigInt(i+f.padEnd(scale,'0'));return v.startsWith('-')?-n:n},sum=units(a)+units(b),digits=(sum<0n?-sum:sum).toString().padStart(scale+1,'0');return (sum<0n?'-':'')+(scale?digits.slice(0,-scale)+'.'+digits.slice(-scale):digits)};
// R097: the board row's right amount adds what was paid earlier toward today's charges; group totals stay cash today.
// A row without prepaidToday (older or partial payloads) keeps amountCollected as it is.
const rowPaid=(row:Summary)=>row.prepaidToday===undefined?row.amountCollected:addDecimal(row.amountCollected,row.prepaidToday);
type Charge = { id: string; loanId: string; loanDisplayKey: string; chargeDate: string; paymentStatus: string; paymentDate: string | null; amountRemaining: string | null; totalPaid: string | null; receivedToday: string | null; lateChargeDue?: string; lateChargeRemaining?: string };
// R118: what was paid on a row's late charge (due less remaining), the stepper's floor; '0' when unreadable.
const latePaidOf=(charge:Charge)=>{const due=wholeText(charge.lateChargeDue??'0')??'0',left=wholeText(charge.lateChargeRemaining??'0')??'0';return /^\d+$/.test(due)&&/^\d+$/.test(left)&&BigInt(due)>=BigInt(left)?(BigInt(due)-BigInt(left)).toString():'0'};
type Envelope = { ok: true; source: 'dev'; businessDate: string; asOf: string; nextCursor: string | null };
type BoardResult = Envelope & { items: Summary[] };
type DetailResult = Envelope & { borrower: Summary; items: Charge[]; groupChat?: GroupChat | null };
export type CollectionReadError = 'not_found' | 'unavailable' | 'business_date_changed';
export type CollectionRequest = <T>(path: string, onError: (failure: ReadFailure<CollectionReadError>) => void, onCached?: (value:T)=>void) => Promise<T | null>;
export function CollectionRecords({ thai, request, cancel, onStatus, refreshToken, query, commandAccess }: { thai: boolean; request: CollectionRequest; cancel: () => void; onStatus: (value: 'idle' | 'loading' | 'success' | 'error') => void; refreshToken: number; query: string; commandAccess?: CommandAccess }) {
  const t = (en: string, th: string) => thai ? th : en;
  const [borrowerOpen,setBorrowerOpen]=useState(false),[loanOpen,setLoanOpen]=useState<string|null>(null);
  const [paymentOpen,setPaymentOpen]=useState(false),[receiptRecord,setReceiptRecord]=useState<string|null>(null);
  const pendingPayment=(()=>{try{return /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(sessionStorage.getItem('mw-credit.pending-command')??'')}catch{return false}})();
  const [items, setItems] = useState<Summary[]>([]);
  const [selected, setSelected] = useState<Summary | null>(null);
  const [charges, setCharges] = useState<Charge[]>([]);
  // R146: the selected borrower's group chat summary (from the detail envelope), which borrowers' cards are expanded
  // (kept while the page stays open) and what this device has already shown (list mark; null = storage blocked, no marks).
  const [groupChat, setGroupChat] = useState<GroupChat | null>(null);
  const chatScope = commandAccess?.offline?.scopeName ?? 'local';
  const [chatSeen, setChatSeen] = useState(() => readChatSeen(chatScope));
  const [chatSession, setChatSession] = useState(() => sessionChatSeen(chatScope));
  useEffect(() => { const refresh = () => { setChatSeen(readChatSeen(chatScope)); setChatSession(sessionChatSeen(chatScope)); }; refresh(); window.addEventListener(CHAT_SEEN_EVENT, refresh); window.addEventListener('storage', refresh); return () => { window.removeEventListener(CHAT_SEEN_EVENT, refresh); window.removeEventListener('storage', refresh); }; }, [chatScope]);
  // R149: what this device showed is also sent to the server for the user's other devices (only with a signed-in
  // offline scope and the command service). Unsent values go again when the page opens, comes online or becomes visible;
  // a device working offline only queues them.
  const chatSync = useRef<{ scope: string; access: CommandAccess; send: boolean } | null>(null);
  chatSync.current = commandAccess?.offline ? { scope: commandAccess.offline.scopeName, access: commandAccess, send: !commandAccess.offlineOnly } : null;
  const chatServerSeen = useRef<Summary[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: sends again when the signed-in scope changes or the device leaves offline-only work; the access itself is read from the ref
  useEffect(() => { const flush = () => { const sync = chatSync.current; if (sync?.send && document.visibilityState !== 'hidden') void flushChatSeen(sync.scope, sync.access); }; flush(); window.addEventListener('online', flush); document.addEventListener('visibilitychange', flush); return () => { window.removeEventListener('online', flush); document.removeEventListener('visibilitychange', flush); }; }, [chatScope, commandAccess?.offlineOnly]);
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
  const lastBoardKey=useRef('');
  // R102: set while the automatic first-page reload after a stale-cursor 400 runs; cleared by the next answered board.
  const staleCursorReload=useRef(false);

  const [chargePage, setChargePage] = useState(1);
  const [businessDate, setBusinessDate] = useState('');
  const [_asOf, setAsOf] = useState('');
  const [_chargeAsOf, setChargeAsOf] = useState('');
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
  // R118 (Echo LC-COL-1..6): the late-charge shortcut reads the charge live (its version and fields) before Confirm.
  const online=useOnline();
  const late=useLateChargeShortcut(commandAccess,thai);
  const revision = useRef(0);
  const listPanel = useRef<HTMLElement | null>(null);
  const detailPanel = useRef<HTMLElement | null>(null);
  // UX-REFRESH-06: background updates wait while the list or the detail rows are touched or scrolled.
  const listHold = { hold: () => listPanel.current }, detailHold = { hold: () => detailPanel.current };
  // R131: Back returns to the opened row: board tile → borrower (the board is hidden on a phone), and the borrower's links
  // (name, loan, charge, receipt) whose page replaces the whole workspace, so both panels are kept.
  const boardReturn = useListReturn(), detailReturn = useListReturn();
  const leaveDetail = (target: EventTarget | string) => detailReturn.leave(target, { keep: [listPanel.current] });
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
  // R118 (LC-COL-R2-1): the refresh after a late-charge step briefly shortens the list (upcoming reloads), which clamps the
  // restored position; it is applied again on every commit of that refresh, before paint, until the refresh settles.
  const reapplyAfterReload=useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: charges and upcoming are the commits of the refresh to follow; the position itself is read from refs
  useLayoutEffect(()=>{
    if(!reapplyAfterReload.current||selectedCharge||upcomingDetail)return;
    if(window.innerWidth>1050&&detailPanel.current)detailPanel.current.scrollTop=savedDetailScroll.current;else window.scrollTo({top:savedDetailScroll.current});
    if(!busy)reapplyAfterReload.current=false;
  },[charges,upcoming,busy,selectedCharge,upcomingDetail]);
  function reset(keepBoard=false) { setPaymentOpen(false); previews.current = null; setUpcoming(null); setUpcomingDetail(null); setUpcomingError(null); setUpcomingPage(1); setSelectedCharge(null); setChildError(null); if(!keepBoard){setItems([]);setCursor(null);setBusinessDate('');setAsOf('');setPage(1)}setSelected(null);setCharges([]);setGroupChat(null);setChargeCursor(null);setChargeAsOf('');setChargePage(1); }
  function fail(code: ReadFailure<CollectionReadError>) { reset(); setError(code); setUpdateState('error'); }
  async function loadBoard(next?: string, pageNumber = 1) {
    if(pageNumber===1)boardCursors.current=[undefined];boardCursors.current[pageNumber-1]=next;
    cancel(); const current = ++revision.current,key=query+'|'+(next??'');reset(lastBoardKey.current===key);lastBoardKey.current=key;setError(null); setBusy(true); setUpdateState('loading');
    setScrollTarget(value => ({ kind: 'list', sequence: value.sequence + 1 }));
    const apply=(value:BoardResult)=>{if(current!==revision.current)return;setItems(value.items);setCursor(value.nextCursor);setPage(pageNumber);setBusinessDate(value.businessDate);setAsOf(value.asOf);setBusy(false)};
    // R102: a 400 on a cursor request is a cursor from before a release (the board keyset is versioned): reload the first
    // page once, replacing the list. A 400 without a cursor, a second consecutive 400 and every other error stay errors.
    const onError=(code:ReadFailure<CollectionReadError>)=>{if(current!==revision.current)return;if(code.status===400&&next&&!staleCursorReload.current){staleCursorReload.current=true;void loadBoard(undefined,1);return}staleCursorReload.current=false;fail(code)};
    const result = await request<BoardResult>('/api/collection?limit=100' + (query ? '&q=' + encodeURIComponent(query) : '') + (next ? '&cursor=' + encodeURIComponent(next) : ''), onError,apply);
    if (current !== revision.current) return;
    setBusy(false);
    if (result) { staleCursorReload.current=false;setUpdateState('success');apply(result); }
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: collection board and detail subscriptions keyed by the narrow identities (commandAccess?.offline, selected?.id, upcomingDetail?.dueDate); commandAccess, selected, upcomingDetail and the hold callbacks are recreated every render and must not resubscribe on each one
  useEffect(()=>{
    if(!commandAccess||busy)return;
    const boardCursor=boardCursors.current[page-1],stops=[subscribeOfflineDataset<BoardResult>(commandAccess,'/api/collection?limit=100'+(query?'&q='+encodeURIComponent(query):'')+(boardCursor?'&cursor='+encodeURIComponent(boardCursor):''),value=>{setItems(value.items);setCursor(value.nextCursor);setBusinessDate(value.businessDate);setAsOf(value.asOf)},undefined,listHold)];
    if(selected&&!paymentOpen&&!pendingPayment){
      const base='/api/collection/'+encodeURIComponent(selected.id),cursor=chargeCursors.current[chargePage-1];
      stops.push(subscribeOfflineDataset<DetailResult>(commandAccess,base+'/charges?limit=10'+(cursor?'&cursor='+encodeURIComponent(cursor):''),value=>{setSelected(value.borrower);setCharges(value.items);setChargeCursor(value.nextCursor);setChargeAsOf(value.asOf);
        // R146: a new summary replaces the card in place (detailHold already waits while the detail is touched or scrolled);
        // not while a late-charge refresh is restoring the scroll position, which a height change would break.
        if(!reapplyAfterReload.current)setGroupChat(value.groupChat??null)},undefined,detailHold));
      stops.push(subscribeOfflineDataset<UpcomingSummary>(commandAccess,base+'/upcoming',value=>{setUpcoming(value);previews.current={borrowerId:selected.id,businessDate:value.businessDate,asOf:value.asOf,receivedAt:performance.now(),items:value.previews??[]}},undefined,detailHold));
      if(upcomingDetail){const next=upcomingCursors.current[upcomingPage-1];stops.push(subscribeOfflineDataset<UpcomingDetail>(commandAccess,base+'/upcoming/'+encodeURIComponent(upcomingDetail.dueDate)+'?limit=25'+(next?'&cursor='+encodeURIComponent(next):''),setUpcomingDetail,undefined,detailHold))}
    }
    return()=>stops.forEach(stop=>{stop()});
  },[commandAccess?.offline,query,page,chargePage,selected?.id,busy,paymentOpen,pendingPayment,upcomingDetail?.dueDate,upcomingPage]);
  async function fetchUpcoming(row: Summary, day: string, current: number,onUnavailable?:()=>void) {
    previews.current = null; setUpcoming(null); setUpcomingError(null);
    const apply=(value:UpcomingSummary)=>{if(current===revision.current&&value.businessDate===day)setUpcoming(value)};
    const result = await request<UpcomingSummary>('/api/collection/' + encodeURIComponent(row.id) + '/upcoming?businessDate=' + encodeURIComponent(day), code => {
      if (current !== revision.current) return;
      if (code.code === 'business_date_changed') {onUnavailable?.();fail(code); return; }
      setUpcomingError(code);
      if (code.code === 'not_found') {onUnavailable?.();setSelected(null); setCharges([]); setChargeAsOf(''); setChildError(code); }
    },apply);
    if (current !== revision.current) return false;
    if (result && result.businessDate !== day) {onUnavailable?.();fail({ code: 'business_date_changed' }); return false; }
    if (result) { setUpcoming(result); previews.current = { borrowerId: row.id, businessDate: result.businessDate, asOf: result.asOf, receivedAt: performance.now(), items: result.previews ?? [] }; }
    return result !== null;
  }
  async function loadCharges(row: Summary, next?: string, pageNumber = 1, keepCharge = false) {
    if(pageNumber===1)chargeCursors.current=[undefined];chargeCursors.current[pageNumber-1]=next;
    cancel(); const current = ++revision.current;
    previews.current = null; setSelected(row); if(!keepCharge)setSelectedCharge(null); setUpcoming(null); setUpcomingDetail(null); setUpcomingError(null);
    setChildError(null);if(selected?.id!==row.id)setGroupChat(null);if(selected?.id!==row.id||chargePage!==pageNumber){setCharges([]);setChargeCursor(null);setChargeAsOf('')}setError(null); setBusy(true); setUpdateState('loading');
    // Keep the shared charge detail mounted while refreshing its Collection context.
    if(!keepCharge)setScrollTarget(value => ({ kind: 'detail', sequence: value.sequence + 1 }));
    let parentUnavailable = false;
    let upcomingTask:Promise<boolean>|null=null;
    const apply=(value:DetailResult)=>{if(current!==revision.current)return;if(!reapplyAfterReload.current)setGroupChat(value.groupChat??null);setSelected(value.borrower);setCharges(value.items);setChargeCursor(value.nextCursor);setChargePage(pageNumber);setBusinessDate(value.businessDate);setChargeAsOf(value.asOf);setBusy(false)};
    const result = await request<DetailResult>('/api/collection/' + encodeURIComponent(row.id) + '/charges?limit=10' + (next ? '&cursor=' + encodeURIComponent(next) : ''), code => {
      if (current !== revision.current) return;
      if (code.code === 'business_date_changed') { parentUnavailable = true; fail(code); return; }
      setCharges([]); setChargeCursor(null); setChargeAsOf(''); setChildError(code);
      if (code.code === 'not_found') { parentUnavailable = true; setSelected(null); }
    },value=>{apply(value);if(current===revision.current)upcomingTask=fetchUpcoming(value.borrower,value.businessDate,current,()=>{parentUnavailable=true})});
    if (current !== revision.current) return;
    if (result && businessDate && result.businessDate !== businessDate) {cancel();revision.current++;fail({ code: 'business_date_changed' }); setBusy(false); return; }
    if (parentUnavailable) {cancel();revision.current++;setSelectedCharge(null);setBusy(false); setUpdateState('error'); return; }
    if (result) apply(result);
    const upcomingOk = await (upcomingTask??fetchUpcoming(result?.borrower ?? row, result?.businessDate ?? businessDate, current,()=>{parentUnavailable=true}));
    if (current !== revision.current) return;
    if(parentUnavailable){cancel();revision.current++;setSelected(null);setBusy(false);setUpdateState('error');return;}
    setBusy(false); setUpdateState(result && upcomingOk ? 'success' : 'error');
  }
  async function chargeChanged() {
    if(!selected)return;
    const row=selected,boardPage=page,boardCursor=boardCursors.current[page-1];
    const reload=loadCharges(row,chargeCursors.current[chargePage-1],chargePage,true),current=revision.current;
    await reload;
    if(current!==revision.current)return;
    // A full page reread also refreshes server-calculated status groups and their whole-group totals.
    const result=await request<BoardResult>('/api/collection?limit=100'+(query?'&q='+encodeURIComponent(query):'')+(boardCursor?'&cursor='+encodeURIComponent(boardCursor):''),failure=>{if(current===revision.current)setError(failure)});
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
    const apply=(value:UpcomingDetail)=>{if(current===revision.current&&value.businessDate===businessDate){setUpcomingDetail(value);setUpcomingPage(pageNumber);setBusy(false)}};
    const result = await request<UpcomingDetail>('/api/collection/' + encodeURIComponent(selected.id) + '/upcoming/' + encodeURIComponent(dueDate) + '?businessDate=' + encodeURIComponent(businessDate) + '&limit=25' + (next ? '&cursor=' + encodeURIComponent(next) : ''), code => {
      if (current !== revision.current) return;
      if (code.code === 'business_date_changed') fail(code); else setUpcomingError(code);
    },apply);
    if (current !== revision.current) return;
    setBusy(false);
    if (result && result.businessDate !== businessDate) { fail({ code: 'business_date_changed' }); return; }
    if (result) { setUpcomingDetail(result); setUpcomingPage(pageNumber); setUpdateState('success'); setScrollTarget(value => ({ kind: 'detail', sequence: value.sequence + 1 })); }
    else setUpdateState('error');
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshToken and query are the reload triggers for the board; loadBoard is recreated every render
  useEffect(() => { void loadBoard(); return () => { revision.current++; }; }, [refreshToken, query]);
  const money = (value: string | null) => value === null ? t('Unavailable', 'ไม่มีข้อมูล') : Number(value)===0?<span className="zero-currency">฿0</span>:new Intl.NumberFormat(thai ? 'th-TH' : 'en-TH', { style: 'currency', currency: 'THB', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(value));
  const date = (value: string | null) => value === null ? t('Unavailable', 'ไม่มีข้อมูล') : displayDate(value);
  // R137: a long overdue tile says how long since the borrower last paid (never paid: since the first charge); a cached
  // pre-R137 row without the field keeps the R102 days-overdue text.
  const longOverdueDays = (row: Summary) => typeof row.sinceLastPaymentDays === 'number'
    ? ' · ' + (row.neverPaid ? t(`Never paid · ${row.sinceLastPaymentDays} days`, `ยังไม่เคยชำระ · ${row.sinceLastPaymentDays} วัน`) : t(`No payment for ${row.sinceLastPaymentDays} days`, `ไม่ได้ชำระมา ${row.sinceLastPaymentDays} วัน`))
    : typeof row.overdueDays === 'number' ? ' · ' + row.overdueDays + t(' days', ' วัน') : '';
  const statusLabel = (value: CollectionStatus) => ({ not_paid: t('Not paid', 'ยังไม่ชำระ'), partially_paid: t('Partially paid', 'ชำระบางส่วน'), overdue: t('Overdue', 'เกินกำหนด'), long_overdue: t('Long overdue', 'เกินกำหนดนาน'), fully_paid: t('Fully paid', 'ชำระครบ') })[value];
  const paymentLabel = (value: string) => value === 'รอชำระ' ? t('Pending', 'รอชำระ') : value === 'ชำระบางส่วน' ? t('Partially paid', 'ชำระบางส่วน') : t('Paid', 'ชำระแล้ว');
  const amounts = (row: Summary) => <dl className="collection-amounts"><div><dt>{t('Amount due', 'ยอดที่ต้องชำระ')}</dt><dd className={row.amountDue!==null&&Number(row.amountDue)===0?'zero-currency':''}>{money(row.amountDue)}</dd></div><div><dt>{t('Collected today', 'รับชำระวันนี้')}</dt><dd className={row.amountCollected!==null&&Number(row.amountCollected)===0?'zero-currency':''}>{money(row.amountCollected)}</dd></div><div><dt>{t('Remaining to collect', 'ยอดคงเหลือที่ต้องรับชำระ')}</dt><dd className={row.amountRemaining!==null&&Number(row.amountRemaining)===0?'zero-currency':''}>{money(row.amountRemaining)}</dd></div></dl>;

  useContextRefresh(!!selected&&!paymentOpen&&!receiptRecord&&!selectedCharge&&!loanOpen&&!borrowerOpen,upcomingDetail?t('First upcoming details page / refresh','หน้าแรกของรายละเอียดล่วงหน้า / รีเฟรช'):t('First charges page / refresh','หน้าแรกยอดเรียกเก็บ / รีเฟรช'),()=>{if(upcomingDetail)void openUpcoming(upcomingDetail.dueDate,undefined,1,true);else if(selected)void loadCharges(selected)});
  // R118: the shortcut shows where Receive does, online only (LC-COL-2, LC-COL-4).
  const lateShortcut=!!commandAccess&&!!selected&&(!!commandAccess.ownerTesting||commandAccess.fixtureBorrowerId===selected.id)&&online&&!commandAccess.offlineOnly;
  // R118 (Echo LC-BUSY-1/2/7): a saving step dims the pair with the spinner on the tapped button (the +50 button of a row
  // without one reads "Saving…"); a held one is dimmed without it; a refused one is plain disabled until the refresh lands.
  const savingOf=(pending:LatePending|undefined)=>!pending||pending.state==='reverted'?null:pending.state==='held'?'held' as const:pending.direction;
  const lateLine=(charge:Charge)=>{const due=wholeText(charge.lateChargeDue??'0')??'0',paid=latePaidOf(charge),context=charge.loanDisplayKey+' '+date(charge.chargeDate),pending=late.pending[charge.id],saving=savingOf(pending),locked=busy||!!late.busy||!!late.held[charge.id];
    return <div className="charge-late-line" aria-busy={saving?true:undefined}>{due==='0'?<button type="button" className={'secondary-button'+(saving?' saving':'')} disabled={locked||!!saving} aria-label={t('Increase late charge by '+LATE_STEP+' for ','เพิ่มค่าปรับล่าช้า '+LATE_STEP+' สำหรับ ')+context} onClick={()=>void stepLateCharge(charge,LATE_STEP)}>{saving&&saving!=='held'?<><span className="collection-spinner" aria-hidden="true"></span>{t('Saving…','กำลังบันทึก…')}</>:t('+'+LATE_STEP+' Late charge','+'+LATE_STEP+' ค่าปรับล่าช้า')}</button>
      :<LateChargeStepper value={due} floor={paid} thai={thai} context={context} disabled={locked} saving={saving} describedBy={lateAtFloor(due,paid)?'charge-late-note-'+charge.id:undefined} onChange={next=>void stepLateCharge(charge,BigInt(next)>BigInt(due)?LATE_STEP:-LATE_STEP)}/>}</div>;};
  const upcomingView = (detail: UpcomingDetail | null) => <UpcomingCharges thai={thai} access={commandAccess} borrowerId={selected?.id} summary={upcoming} detail={detail} page={upcomingPage} busy={busy} error={upcomingError} onDate={value => void openUpcoming(value)} onBack={() => { cancel(); revision.current++; setBusy(false); setUpdateState('idle'); restoreDetailScroll.current = true; setUpcomingError(null); setUpcomingDetail(null); }} onRefresh={() => void refreshUpcoming()} onDetailRefresh={() => upcomingDetail && void openUpcoming(upcomingDetail.dueDate, undefined, 1, true)} onPrevious={upcomingPage>1&&upcomingDetail?()=>void openUpcoming(upcomingDetail.dueDate,upcomingCursors.current[upcomingPage-2],upcomingPage-1,true):undefined} onNext={() => upcomingDetail?.nextCursor && void openUpcoming(upcomingDetail.dueDate, upcomingDetail.nextCursor, upcomingPage + 1)} />;
  // R118 owner feedback: a tap applies at once (no Confirm page) and reports in a bottom toast; the row then refreshes in
  // place, the list keeping its scroll position (LC-COL-R2-1) through the refresh that briefly shortens it.
  async function stepLateCharge(charge:Charge,step:number){
    await late.step(charge.id,step,selected?.displayName??'',{due:wholeText(charge.lateChargeDue??'0')??'0',paid:latePaidOf(charge),reread:true,refresh:async outcome=>{
     // R118 part B: an applied step patches its row from the charge read back after the POST (no list reload) and refreshes
     // the board totals in the background, without holding the buttons.
     const item=outcome.item;
     if(outcome.result==='applied'&&item){
      const remaining=(()=>{const due=wholeText(item.lateChargeDue??'0'),paid=wholeText(item.lateChargePaid??'0');return /^\d+$/.test(due??'')&&/^\d+$/.test(paid??'')?(BigInt(due!)-BigInt(paid!)).toString():item.lateChargeRemaining??null})();
      setCharges(old=>old.map(row=>row.id===charge.id?{...row,lateChargeDue:item.lateChargeDue??row.lateChargeDue,lateChargeRemaining:remaining??row.lateChargeRemaining,amountRemaining:item.amountRemaining??row.amountRemaining,totalPaid:item.totalPaid??row.totalPaid}:row));
      void refreshBoardTotals();return;
     }
     // Anything else (refused, nothing to change, or an applied step whose read-back failed) reloads the list in place,
     // keeping its scroll position.
     if(['applied','unchanged','refused'].includes(outcome.result)){savedDetailScroll.current=window.innerWidth>1050?detailPanel.current?.scrollTop??0:window.scrollY;reapplyAfterReload.current=true;await chargeChanged();}
    }});
  }
  /** R118 part B: the board's status groups and totals, and the selected borrower's amounts, read again in the background. */
  async function refreshBoardTotals(){
    const current=revision.current,boardPage=page,boardCursor=boardCursors.current[page-1];
    const result=await request<BoardResult>('/api/collection?limit=100'+(query?'&q='+encodeURIComponent(query):'')+(boardCursor?'&cursor='+encodeURIComponent(boardCursor):''),()=>{});
    if(!result||current!==revision.current)return;
    setItems(result.items);setCursor(result.nextCursor);setPage(boardPage);setAsOf(result.asOf);
    setSelected(prior=>{const row=prior&&result.items.find(item=>item.id===prior.id);return row?{...prior,...row}:prior});
  }
  if(loanOpen&&commandAccess)return <LoanRecord access={commandAccess} id={loanOpen} thai={thai} onBack={()=>{setLoanOpen(null);detailReturn.restore()}}/>;
  if(borrowerOpen&&selected&&commandAccess)return <SharedBorrowerDetail access={commandAccess} id={selected.id} label={selected.displayName} thai={thai} onBack={()=>{setBorrowerOpen(false);detailReturn.restore()}}/>;
  if(selectedCharge&&commandAccess)return <ChargeRecord key={selectedCharge.id} access={commandAccess} id={selectedCharge.id} thai={thai} backLabel={t('Back to charges','กลับรายการเรียกเก็บ')} onChanged={()=>void chargeChanged()} onBack={()=>{restoreDetailScroll.current=true;setSelectedCharge(null);detailReturn.restore()}}/>;
  if(receiptRecord&&commandAccess)return <PaymentRecord access={commandAccess} id={receiptRecord} thai={thai} onBack={()=>{setReceiptRecord(null);detailReturn.restore()}}/>;
  if(paymentOpen&&commandAccess)return <SelectedCharges access={commandAccess} borrowerId={selected?.id??commandAccess.fixtureBorrowerId} thai={thai} onBack={()=>{setPaymentOpen(false);if(selected)void loadCharges(selected);else void loadBoard()}}/>;
  // R148: the summary card and the borrower note are siblings in one fragment, so their keys carry a prefix. With the same
  // key (the borrower id) on both, React kept the previous borrower's card mounted and the cards stacked up (owner account).
  // R146: one clock reading per render for the card's freshness and the list mark's 72-hour window.
  const chatNow=Date.now();chatServerSeen.current=items;
  return <>{late.toastElement}<section className="collection-workspace" aria-label={t('Collection workspace', 'พื้นที่งานติดตาม')}>


    {commandAccess&&pendingPayment&&<button type="button" className="secondary-button" onClick={()=>setPaymentOpen(true)}>{t('Check pending payment status','ตรวจสอบคำขอรับชำระที่ค้างอยู่')}</button>}
    {error && <div className="access-blocked" role="status"><h2>{error.code === 'business_date_changed' ? t('The business date has changed', 'วันที่ทำรายการเปลี่ยนแล้ว') : error.code === 'not_found' ? t('This borrower is no longer in Collection', 'ผู้กู้รายนี้ไม่อยู่ในงานติดตามแล้ว') : t('Collection is unavailable', 'ไม่สามารถโหลดงานติดตามได้')}</h2><ErrorReference failure={error} thai={thai} /><p>{t('Refresh the first page to reload Collection.', 'รีเฟรชหน้าแรกเพื่อโหลดงานติดตามอีกครั้ง')}</p><button type="button" className="secondary-button" onClick={() => void loadBoard()}>{t('Refresh Collection', 'รีเฟรชงานติดตาม')}</button></div>}
    {childError?.code === 'not_found' && <div role="status"><ErrorReference failure={childError} thai={thai} />{selected&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>void loadCharges(selected)}>{t('Retry charges','ลองโหลดยอดเรียกเก็บอีกครั้ง')}</button>}<p>{t('This borrower is no longer in Collection. Refresh the list.', 'ผู้กู้รายนี้ไม่อยู่ในงานติดตามแล้ว กรุณารีเฟรชรายการ')}</p></div>}
    {!error && <div className={'work-grid collection-grid ' + (selected ? 'has-detail' : '')}>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard-scrollable list panel; tabIndex lets keyboard users scroll it */}<section className="list-panel" aria-busy={busy && !selected} ref={listPanel} tabIndex={0} aria-label={t('Collection borrower list', 'รายชื่อผู้กู้งานติดตาม')}>
        <div className="section-heading"><h2>{t('Collection borrowers', 'ผู้กู้งานติดตาม')}</h2></div>{items.length>0&&<p className="list-count">{page>1||cursor?borrowerRange(page,items.length,thai):borrowerCount(items.length,thai)}</p>}
        {!busy && !items.length && <p className="live-empty">{query ? t('No matching borrowers.', 'ไม่พบผู้กู้ที่ตรงกับการค้นหา') : t('No borrowers in Collection today.', 'ไม่มีผู้กู้ในงานติดตามวันนี้')}</p>}
        <p className="list-meaning-legend">{t('Left: remaining · Right: collected today','ซ้าย: คงเหลือ · ขวา: รับชำระวันนี้')}</p>{items.map((row,index)=><React.Fragment key={row.id}>{(index===0||items[index-1].status!==row.status)&&<h3 className={'record-group-heading collection-status-'+row.status}><span>{statusLabel(row.status)}</span><strong className={row.status==='fully_paid'&&Number(row.groupCollected)>0?'paid-group-total':''}>{row.status==='fully_paid'?<>{t('Collected','รับแล้ว')} {money(row.groupCollected??null)}</>:<>{t('Remaining','คงเหลือ')} {money(row.groupRemaining??null)}</>}</strong></h3>}<article className={'collection-compact-tile collection-status-'+row.status+(selected?.id===row.id?' selected':'')}><button type="button" className="collection-tile-main" data-record-id={row.id} disabled={busy} onClick={event=>{boardReturn.leave(event.currentTarget,{top:false});void loadCharges(row)}}><strong>{chatMarkShown(chatSeen,row.id,row.chatSummaryAt,chatNow,row.chatSeenAt,chatSession)?<NameWithChatMark name={row.displayName}/>:row.displayName}</strong>{chatMarkShown(chatSeen,row.id,row.chatSummaryAt,chatNow,row.chatSeenAt,chatSession)&&<span className="visually-hidden">{t(', New group chat summary',', มีสรุปแชทกลุ่มใหม่')}</span>}<span className={row.amountRemaining!==null&&Number(row.amountRemaining)===0?'zero-currency':''}>{money(row.amountRemaining)}</span><span className="collection-tile-status">{row.prepaidOnly?t('Paid in advance','ชำระล่วงหน้าแล้ว')+(row.prepaidSource==='rebate_offset'?t(' · rebate offset',' · หักค่าแนะนำ'):'')+(row.prepaidPaymentDate?' · '+date(row.prepaidPaymentDate):''):statusLabel(row.status)+(row.status==='long_overdue'?longOverdueDays(row):'')}</span></button><div className="collection-tile-right"><span className="visually-hidden">{t('Paid amount','ยอดชำระ')}</span><strong className={rowPaid(row)!==null&&Number(rowPaid(row))===0?'zero-currency':Number(rowPaid(row))>0?'positive-paid':''}>{money(rowPaid(row))}</strong>{commandAccess&&(commandAccess.ownerTesting||commandAccess.fixtureBorrowerId===row.id)&&<button type="button" className="secondary-button icon-action" disabled={busy} aria-label={t('Receive payment for ','รับชำระให้ ')+row.displayName} title={t('Receive payment','รับชำระ')} onClick={()=>{cancel();revision.current++;previews.current=null;setSelected(row);setBusy(false);setUpdateState('idle');setPaymentOpen(true)}}><Icon name="receive"/></button>}</div></article></React.Fragment>)}
        {/* R115, R131: pages of up to 100 borrowers (the API cap) with previous/next at the end, like the Borrowers list; the
            search stays applied across pages, and a new search or refresh starts again at page 1. */}<CompactPager busy={busy} previous={page>1?()=>void loadBoard(boardCursors.current[page-2],page-1):undefined} next={cursor?()=>void loadBoard(cursor,page+1):undefined} previousLabel={t('Previous borrowers page','หน้าผู้กู้ก่อนหน้า')} nextLabel={t('Next borrowers page','หน้าผู้กู้ถัดไป')}/>
      </section>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard-scrollable detail panel; tabIndex lets keyboard users scroll it */}<section className={'detail-panel ' + (!selected ? 'unselected' : '')} aria-busy={busy && !!selected} ref={detailPanel} tabIndex={0} aria-label={t('Collection charge details', 'รายละเอียดยอดเรียกเก็บงานติดตาม')}>
        {selected ? selectedCharge ? <article className="collection-charge-detail" aria-label={t('Charge detail', 'รายละเอียดยอดเรียกเก็บ')}><HeaderBack navigationKey="collection-charge-detail" className="icon-action" aria-label={t('Back to charges', 'กลับรายการเรียกเก็บ')} onClick={() => { restoreDetailScroll.current = true; setSelectedCharge(null); }}><Icon name="back"/></HeaderBack><h2>{t('Charge detail', 'รายละเอียดยอดเรียกเก็บ')}</h2><h3>{selectedCharge.loanDisplayKey}</h3><dl><div><dt>{t('Charge date', 'วันที่เรียกเก็บ')}</dt><dd>{date(selectedCharge.chargeDate)}</dd></div><div><dt>{t('Payment status', 'สถานะชำระเงิน')}</dt><dd>{paymentLabel(selectedCharge.paymentStatus)}</dd></div>{selectedCharge.paymentDate !== null && <div><dt>{t('Payment date', 'วันที่ชำระเงิน')}</dt><dd>{date(selectedCharge.paymentDate)}</dd></div>}<div><dt>{t('Amount remaining', 'ยอดคงเหลือ')}</dt><dd>{money(selectedCharge.amountRemaining)}</dd></div><div><dt>{t('Total paid', 'ยอดชำระรวม')}</dt><dd>{money(selectedCharge.totalPaid)}</dd></div><div><dt>{t('Received today', 'รับชำระวันนี้')}</dt><dd>{money(selectedCharge.receivedToday)}</dd></div></dl></article> : upcomingDetail ? upcomingView(upcomingDetail) : <><div className="payment-context collection-context"><HeaderBack navigationKey="collection-summary" className="secondary-button icon-action" aria-label={t('Back to Collection','กลับงานติดตาม')} title={t('Back to Collection','กลับงานติดตาม')} onClick={() => { cancel(); revision.current++; previews.current = null; setChildError(null); setSelected(null); setSelectedCharge(null); setUpcoming(null); setUpcomingDetail(null); setUpcomingError(null); setCharges([]); setChargeCursor(null); setChargeAsOf(''); setBusy(false); setUpdateState('idle'); boardReturn.restore(); }}><Icon name="back"/></HeaderBack>{commandAccess?<button type="button" className={'collection-name-link collection-status-'+selected.status} data-record-id={'borrower:'+selected.id} onClick={event=>{leaveDetail(event.currentTarget);setBorrowerOpen(true)}}>{selected.displayName}</button>:<strong className={'collection-status-'+selected.status}>{selected.displayName}</strong>}{commandAccess&&<PaymentHistory compact access={commandAccess} borrowerId={selected.id} thai={thai}/>}</div>{amounts(selected)}<CollectionChatSummary key={'chat-summary:'+selected.id} groupChat={groupChat} borrowerId={selected.id} thai={thai} now={chatNow} onShown={at=>{markChatSeen(chatScope,selected.id,at);const sync=chatSync.current,known=chatServerSeen.current.find(row=>row.id===selected.id)?.chatSeenAt;if(sync?.send)void syncChatSeen(sync.scope,sync.access,selected.id,at,known);else if(sync)queueChatSeen(sync.scope,selected.id,at,known)}}/>{commandAccess?.ownerTesting&&<CollectionNote key={'note:'+selected.id} access={commandAccess} id={selected.id} thai={thai}/>}<div className="related-loans-heading collection-charges-heading"><h3>{t('Today’s charges', 'ยอดเรียกเก็บวันนี้')}</h3>{commandAccess&&(commandAccess.ownerTesting||commandAccess.fixtureBorrowerId===selected.id)&&<RecordAction icon="receive" className="secondary-button icon-action" aria-label={t('Receive selected charges','รับชำระรายการที่เลือก')} title={t('Receive selected charges','รับชำระรายการที่เลือก')} onClick={()=>{cancel();revision.current++;previews.current=null;setBusy(false);setUpdateState('idle');setPaymentOpen(true)}}></RecordAction>}</div>
          {childError?.code === 'unavailable' && <div role="status"><ErrorReference failure={childError} thai={thai} />{selected&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>void loadCharges(selected)}>{t('Retry charges','ลองโหลดยอดเรียกเก็บอีกครั้ง')}</button>}<p>{t('Unable to load charges. Refresh the charges page to try again.', 'ไม่สามารถโหลดรายการเรียกเก็บได้ กรุณารีเฟรชหน้ายอดเรียกเก็บเพื่อลองอีกครั้ง')}</p></div>}
          {charges.map(charge=><article className="collection-charge collection-charge-row" key={charge.id}><span className="charge-row-left"><strong>{date(charge.chargeDate)}</strong>{commandAccess?<button type="button" className="record-field-link charge-loan-link" data-record-id={charge.id+':loan'} disabled={busy} onClick={event=>{leaveDetail(event.currentTarget);setLoanOpen(charge.loanId)}}>{charge.loanDisplayKey}</button>:<span>{charge.loanDisplayKey}</span>}{charge.paymentStatus==='ชำระแล้ว'&&charge.paymentDate!==null&&businessDate!==''&&charge.paymentDate<businessDate&&<small className="charge-prepaid-note">{t('Paid in advance','ชำระล่วงหน้า')} · {date(charge.paymentDate)}</small>}{late.pending[charge.id]&&late.pending[charge.id].state!=='reverted'?<small className="charge-prepaid-note charge-late-note" id={'charge-late-note-'+charge.id}>{t('Late charge ','ค่าปรับล่าช้า ')}<LateChargeSaving pending={late.pending[charge.id]} thai={thai}/></small>:lateNote(wholeText(charge.lateChargeDue??'0'),latePaidOf(charge),thai)&&<small className="charge-prepaid-note charge-late-note" id={'charge-late-note-'+charge.id}>{lateNote(wholeText(charge.lateChargeDue??'0'),latePaidOf(charge),thai)}</small>}</span><span className="charge-row-right"><strong className={'charge-remaining '+(charge.amountRemaining!==null&&Number(charge.amountRemaining)===0?'zero-currency':'')}>{money(charge.amountRemaining)}</strong><strong className={'charge-received '+(charge.totalPaid!==null&&Number(charge.totalPaid)===0?'zero-currency':'')}>{money(charge.totalPaid)}</strong></span>{lateShortcut&&lateLine(charge)}<button type="button" className="charge-tile-action" disabled={busy} aria-label={t('Charge details for ','รายละเอียดรายการเรียกเก็บ ')+charge.loanDisplayKey+' '+date(charge.chargeDate)} data-record-id={charge.id} onClick={event=>{savedDetailScroll.current=window.innerWidth>1050?detailPanel.current?.scrollTop??0:window.scrollY;if(commandAccess)leaveDetail(event.currentTarget);setSelectedCharge(charge);setScrollTarget(value=>({kind:'detail',sequence:value.sequence+1}))}}></button></article>)}
          <CompactPager busy={busy} previous={chargePage>1?()=>void loadCharges(selected,chargeCursors.current[chargePage-2],chargePage-1):undefined} next={chargeCursor?()=>void loadCharges(selected,chargeCursor,chargePage+1):undefined} previousLabel={t('Previous charges page','หน้ายอดเรียกเก็บก่อนหน้า')} nextLabel={t('Next charges page','หน้าถัดไปของยอดเรียกเก็บ')}/>
{commandAccess?.ownerTesting&&charges.length>0&&<CollectionReceipts access={commandAccess} borrowerId={selected.id} businessDate={businessDate} chargeIds={charges.map(row=>row.id)} thai={thai} onOpen={value=>{leaveDetail(value);setReceiptRecord(value)}}/>}
{upcomingView(null)}
        </> : <p>{t('Select a borrower to view today’s collection charges.', 'เลือกผู้กู้เพื่อดูยอดเรียกเก็บในงานติดตามวันนี้')}</p>}
      </section>
    </div>}
  </section></>;
}
