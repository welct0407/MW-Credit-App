import {useAppUpdateBlock} from './app-update-safety';
import {Icon} from './Icon';
import {ReceiptPicker} from './ReceiptPicker';
import {readOfflineDataset} from './offline-dataset';
import {syncSavedRequest,savedRejectionMessage,isBusyOutcome} from './offline-sync';
import {RecordAction} from './RecordAction';
import {HeaderBack} from './HeaderBack';
import {displayTimestamp,displayValue} from './display-date';
import {beginRequest} from './request-activity';
import {CompactPager} from './CompactPager';
import {PaymentResult} from './PaymentResult';
import {confirmOwnPayment,verifiedOwnReceipt,type OwnReceipt} from './own-write-apply';
import {useOnline} from './online-status';
import {RECOGNITION_DEADLINE_MS} from './recognition-timing';
import type {OwnerOfflineRepository} from './owner-offline';
import {useEffect,useRef,useState} from 'react';
type ChargeRow={id:string;chargeDate:string;loanDisplayKey:string;amountRemaining:string;principalRemaining:string;interestRemaining:string};
/** R101: a loan's next projected charge, not yet booked: the charge row shape plus its loan (the payment books it). */
type UpcomingRow=ChargeRow&{loanId:string};
type Draft={preferredReceivingAccountId?:string|null;nextCursor?:string|null;asOf?:string;businessDate:string;borrower:{id:string;displayName:string};charges:ChargeRow[];upcoming?:UpcomingRow[];accounts:{id:string;label:string}[]};
type Allocation={chargeId:string;principal:string;interest:string;expectedPrincipalRemaining:string;expectedInterestRemaining:string;chargeDate:string};
type Materialize={loanId:string;chargeId:string;chargeDate:string;principalDue:string;interestDue:string};
type Command={schemaVersion:3|4|5|6|7|8|9;requestId:string;borrowerId:string;selectedChargeIds?:string[];allocations?:Allocation[];cashAccountId:string;paymentDate:string;amountReceived:string;paymentMethod:'Bank Transfer'|'Cash'|'Net-off at Disbursement';allocationMethod?:'Selected Charges'|'Single Full'|'Receive All';notes:string|null;receiptId:string|null;bankReference?:string|null;transferTime?:string|null;payerLines?:{before:string|null;after:string}|null;materialize?:Materialize[]};
/** R075 slip recognition for the uploaded receipt; cleared with the receipt. Nothing here writes. */
type SlipField='amount'|'account'|'reference'|'date';
type Recognition={receiptId:string;phase:'reading'|'failed'|'unconfirmed'|'done';provider?:string|null;filled?:SlipField[];autoSkipped?:boolean;slipAmount?:string|null;slipAccountId?:string|null;slipReference?:string|null;referenceExists?:boolean;dateNotUsed?:string|null;autoOutcome?:'empty'|'failed';accountNote?:'unmatched'|'ambiguous'|null;slipPayer?:string|null;payerBefore?:string|null;payerAfter?:string|null;payerFirst?:boolean};
/** R095 payer name as the command and server accept it: one trimmed NFC line of 1 to 200 bytes without control characters. */
const payerText=(value:unknown)=>typeof value==='string'&&value!==''&&value===value.trim()&&!/\s\s/.test(value)&&value===value.normalize('NFC')&&new TextEncoder().encode(value).length<=200&&!/[\u0000-\u001f\u007f-\u009f]/.test(value)?value:null;
/** R095 revision 2: the route's learned payer lines (1 to 5 lines, at most 1000 bytes), or null. */
const payerLinesText=(value:unknown)=>{if(typeof value!=='string')return null;const lines=value.split('\n');return lines.length>=1&&lines.length<=5&&lines.every(line=>payerText(line)!==null)&&new TextEncoder().encode(value).length<=1000?value:null};
const previousDay=(day:string)=>{const value=new Date(day+'T00:00:00Z');value.setUTCDate(value.getUTCDate()-1);return value.toISOString().slice(0,10)};
const slipDays=(businessDate:string)=>[businessDate,previousDay(businessDate)];
const normalizedReference=(value:string)=>value.replace(/[\s-]/g,'').toUpperCase();
type Outcome={status:'posted'|'rejected';paymentId:string|null;code:string|null;recordedAt:string};
export type CommandAccess={origin:string;fixtureBorrowerId:string;ownerTesting?:boolean;offline?:OwnerOfflineRepository;offlineOnly?:boolean;prepareSync?:()=>Promise<void>;awaitStartup?:()=>Promise<void>;onPosted?:(requestId:string)=>void;openSaved?:()=>void;token:()=>Promise<string>;authFailure:(status:number)=>void};
const pendingKey='mw-credit.pending-command';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function SelectedCharges({access,borrowerId,thai,onBack,onPosted}:{access:CommandAccess;borrowerId:string;thai:boolean;onBack:()=>void;onPosted?:(requestId:string)=>void}) {
 // The sync-outcome listener is registered once; thaiNow carries the current language into its blocked message.
 const thaiNow=useRef(thai);thaiNow.current=thai;
 const t=(en:string,th:string)=>thai?th:en;
 const queueEnabled=!!access.offline,online=useOnline();
 const [draft,setDraft]=useState<Draft|null>(null),[selected,setSelected]=useState<string[]>([]),[account,setAccount]=useState(''),[notes,setNotes]=useState('');
 const [state,setState]=useState<'loading'|'edit'|'review'|'sending'|'unknown'|'busy'|'posted'|'rejected'|'conflict'|'error'|'queued'>('loading');
 useAppUpdateBlock(['loading','edit','review','sending','unknown','busy','conflict'].includes(state));
 const [draftSaveFailed,setDraftSaveFailed]=useState(false);
 const [error,setError]=useState(''),[receipt,setReceipt]=useState<string|null>(null),[preview,setPreview]=useState<string|null>(null),[uploading,setUploading]=useState(false),[preparingReceipt,setPreparingReceipt]=useState(false),[uploadFailed,setUploadFailed]=useState(false);
 const [checking,setChecking]=useState(false),[receiptReadError,setReceiptReadError]=useState(''),[verifiedPreview,setVerifiedPreview]=useState<string|null>(null);
 const notifiedPosted=useRef<string|null>(null);
 const confirming=useRef(false),autosaveSuspended=useRef(false),legacyDraft=useRef(false);
 const checkOperation=useRef(0),checkingRef=useRef(false);
 const [outcome,setOutcome]=useState<Outcome|null>(null),[checked,setChecked]=useState(false),[storageBlocked,setStorageBlocked]=useState(false);
 const command=useRef<Command|null>(null),requestId=useRef<string>(crypto.randomUUID()),generation=useRef(0),uploadGeneration=useRef(0);
 // R078 follow-up: the server's descriptor (sha256, sizeBytes) of the uploaded receipt, to verify the picked file locally.
 const receiptDescriptor=useRef<OwnReceipt['descriptor']>(null);
 const [selectionRows,setSelectionRows]=useState<Draft['charges']>([]),[savedAt,setSavedAt]=useState<number|null>(null),[localImage,setLocalImage]=useState<Blob|null>(null);
 const [allMode,setAllMode]=useState(false);
 const [changedBalances,setChangedBalances]=useState<{operation:number;generation:number;charges:Draft['charges'];upcoming:UpcomingRow[];businessDate:string}|null>(null),[unavailableLines,setUnavailableLines]=useState<string[]>([]);
 // R101: the next projected charge of each loan (first scope=all page); kept across charge pages, they are not paged.
 const [upcoming,setUpcoming]=useState<UpcomingRow[]>([]);
 const [received,setReceived]=useState(''),[allocations,setAllocations]=useState<Allocation[]>([]);
 const [paymentMethod,setPaymentMethod]=useState<Command['paymentMethod']>('Bank Transfer'),[reviewing,setReviewing]=useState(false);
 const [bankReference,setBankReference]=useState(''),[transferTime,setTransferTime]=useState(''),[slipDate,setSlipDate]=useState<string|null>(null);
 const [recognition,setRecognition]=useState<Recognition|null>(null),recognitionTouched=useRef(new Set<string>()),[autoEmpty,setAutoEmpty]=useState(false);
 // R076: true once the receiving account is changed by hand in this form session; a preselected default or restored account is not a choice.
 const accountChosen=useRef(false);
 const reviewOperation=useRef(0),autosaveChain=useRef(Promise.resolve()),autosaveTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const pageCursors=useRef<(string|undefined)[]>([undefined]);const [pageIndex,setPageIndex]=useState(0),[paging,setPaging]=useState(false);
 const [scope,setScope]=useState<'due'|'future'|'all'>('all');
 const _allocationMethod=allMode?'Receive All':selected.length===1?'Single Full':'Selected Charges';
 const _selectedRows=selectionRows;
 const integer=(value:string)=>/^(0|[1-9][0-9]{0,16})$/.test(value);
 const allocated=allocations.reduce((sum,row)=>sum+(integer(row.principal)?BigInt(row.principal):0n)+(integer(row.interest)?BigInt(row.interest):0n),0n);
 const total=integer(received)?received:'0';
 // R101: next-charge rows not already shown as recorded charges; an allocated next-charge line that is no longer offered
 // (selectionRows remembers it with its loanId) stays visible as unavailable until it is removed.
 const recordedIds=new Set(draft?.charges.map(row=>row.id)??[]);
 const shownUpcoming=upcoming.filter(row=>!recordedIds.has(row.id));
 const staleProjected=allocations.filter(line=>!recordedIds.has(line.chargeId)&&!shownUpcoming.some(row=>row.id===line.chargeId)&&selectionRows.some(row=>row.id===line.chargeId&&'loanId' in row)).map(line=>line.chargeId);
 const projectedIds=new Set([...shownUpcoming.map(row=>row.id),...staleProjected]);
 const blockedLines=[...unavailableLines,...staleProjected];
 const materialize:Materialize[]=allocations.flatMap(line=>{const row=shownUpcoming.find(row=>row.id===line.chargeId);return row?[{loanId:row.loanId,chargeId:row.id,chargeDate:row.chargeDate,principalDue:row.principalRemaining,interestDue:row.interestRemaining}]:[]});
 const projectedAllocated=allocations.some(line=>projectedIds.has(line.chargeId));
 const validPlan=['Bank Transfer','Cash'].includes(paymentMethod)&&integer(received)&&BigInt(total)>0n&&BigInt(total)<=92233720368547758n&&allocated===BigInt(total)&&allocations.length>0&&allocations.length<=10000&&allocations.every(row=>!blockedLines.includes(row.chargeId)&&integer(row.principal)&&integer(row.interest)&&BigInt(row.principal)+BigInt(row.interest)>0n&&BigInt(row.principal)<=BigInt(row.expectedPrincipalRemaining)&&BigInt(row.interest)<=BigInt(row.expectedInterestRemaining));
 const referenceText=normalizedReference(bankReference),bankTransfer=paymentMethod==='Bank Transfer';
 const slipFieldsValid=!bankTransfer||((referenceText===''||/^[A-Z0-9]{6,100}$/.test(referenceText))&&(transferTime===''||/^([01]\d|2[0-3]):[0-5]\d$/.test(transferTime)));
 // The slip date is the payment date only within {business date, the day before}; otherwise the business date.
 const paymentDate=draft?(slipDate&&slipDays(draft.businessDate).includes(slipDate)?slipDate:draft.businessDate):'';
 const recognized=recognition?.phase==='done'?recognition:null;
 const amountMismatch=!!recognized?.slipAmount&&received!==''&&received!==recognized.slipAmount;
 const accountMismatch=!!recognized?.slipAccountId&&account!==''&&account!==recognized.slipAccountId;
 const duplicateReference=!!recognized?.referenceExists&&bankTransfer&&referenceText!==''&&referenceText===recognized.slipReference;
 // R095 revision 2: the slip payer name is information only. A bank transfer carries the learned payer lines; the database
 // writes them only while the borrower's column still holds what the route read.
 const slipPayer=recognized?.slipPayer??null,payerLearns=!!slipPayer&&bankTransfer&&!!recognized?.payerAfter;
 const money=(value:string)=>{if(typeof value!=='string'||!/^-?[0-9]+$/.test(value))return t('Unavailable','ไม่มีข้อมูล');const n=BigInt(value),abs=n<0n?-n:n;return (n<0n?'-':'')+'฿'+abs.toLocaleString(thai?'th-TH':'en-US')};
 async function call(path:string,init:RequestInit={}) {
  if(access.offlineOnly||!navigator.onLine)throw Error('Offline');
  const done=beginRequest(),controller=new AbortController(),deadline=Date.now()+15000,timer=setTimeout(()=>controller.abort(),15000);
  try {
   const token=await access.token();
   const response=await fetch(access.origin+path,{...init,signal:controller.signal,headers:{'X-MW-Wake-Deadline':String(deadline),...init.headers,Authorization:'Bearer '+token}});
   const data=await response.json();
   if(response.status===401||response.status===403){access.authFailure(response.status);throw Error('access_denied');}
   return {response,data};
  } finally {clearTimeout(timer);done();}
 }
 function retainPending(){try{sessionStorage.setItem(pendingKey,requestId.current)}catch{setStorageBlocked(true)}}
 function clearPending(){try{sessionStorage.removeItem(pendingKey)}catch{}void access.offline?.remove('pending',requestId.current).catch(()=>{})}
 // biome-ignore lint/correctness/useExhaustiveDependencies: restores pending payments and saved drafts once per borrower; access, the offline helpers, queueEnabled, call, integer, t and thai are recreated every render and must not restart the restore
 useEffect(()=>{
  const current=++generation.current;accountChosen.current=false;
  void(async()=>{
   try{
    const pending=(await access.offline?.list('pending'))?.filter(row=>(row.value.domain===undefined||row.value.domain==='payment')&&!!(row.value.command??row.value).schemaVersion&&row.value.recoveryKind!=='action');
    let prior:string|null=null;try{prior=sessionStorage.getItem(pendingKey)}catch{setStorageBlocked(true)}
    const retained=pending?.find(row=>(row.value.command??row.value).borrowerId===borrowerId)||pending?.[0];
    if(current!==generation.current)return;
    if(retained){command.current=retained.value.command??retained.value;requestId.current=command.current!.requestId;if(retained.sync?.state==='blocked'){setState('rejected');setError(savedRejectionMessage({code:retained.sync.code,data:retained.sync.outcome},thai));}else setState(queueEnabled?'queued':'unknown');return;}
    if(prior&&uuid.test(prior)){requestId.current=prior;setState('unknown');return;}
    const saved=await access.offline?.draft<any>(borrowerId);
    let data:Draft;
    if(access.offlineOnly||!navigator.onLine){
     if(!await access.offline?.authorized())throw Error();
     const prepared=await readOfflineDataset(access,'/api/payment-drafts/'+encodeURIComponent(borrowerId)+'?scope=all');const snapshot=prepared?null:await access.offline!.snapshot<Draft>(borrowerId);if(!prepared&&!snapshot)throw Error();data=prepared??snapshot!.value;setSavedAt(snapshot?.savedAt??Date.parse(prepared.asOf));
    }else{
     const response=await call('/api/payment-drafts/'+encodeURIComponent(borrowerId)+'?scope=all');if(!response.response.ok)throw Error();data=response.data;
     if(current!==generation.current)return;
     try{await access.offline?.saveSnapshot(borrowerId,data)}catch{setStorageBlocked(true)}
    }
    if(current!==generation.current)return;setDraft(data);setUpcoming(Array.isArray(data.upcoming)?data.upcoming:[]);setAccount(saved?.value.account??(data.accounts.some(row=>row.id===data.preferredReceivingAccountId)?data.preferredReceivingAccountId!:''));
    if(saved){legacyDraft.current=saved.value.formVersion===5||(saved.value.received===undefined&&saved.value.allocations===undefined);setReceived(saved.value.received??'');setAllocations(saved.value.allocations??[]);setNotes(saved.value.notes);setPaymentMethod(saved.value.paymentMethod??'Bank Transfer');setSelectionRows(saved.value.selectionRows);setSelected(saved.value.selectionRows.map((row:any)=>row.id));setLocalImage(saved.value.image??null);setAllMode(saved.value.allMode===true);setScope('all');if(saved.value.image)setPreview(URL.createObjectURL(saved.value.image));
     setBankReference(typeof saved.value.bankReference==='string'?saved.value.bankReference:'');setTransferTime(saved.value.image&&typeof saved.value.transferTime==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(saved.value.transferTime)?saved.value.transferTime:'');setSlipDate(saved.value.image&&typeof saved.value.slipDate==='string'&&slipDays(data.businessDate).includes(saved.value.slipDate)?saved.value.slipDate:null);}
    if(saved&&legacyDraft.current&&(saved.value.selectionRows?.length??0)>0){
     setError(t('Saved selection needs conversion review with current component balances.','รายการที่บันทึกไว้ต้องตรวจสอบการแปลงด้วยยอดเงินต้นและดอกเบี้ยปัจจุบัน'));
     if(!access.offlineOnly&&navigator.onLine){
      const ids=saved.value.selectionRows.map((row:any)=>row.id),method=ids.length===1?'Single Full':'Selected Charges';
      const refreshed=await call('/api/payment-drafts/'+encodeURIComponent(borrowerId)+'/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selectedChargeIds:ids,allocationMethod:method})});
      if(current!==generation.current)return;
      if(refreshed.response.ok&&refreshed.data.charges.every((row:any)=>integer(row.principalRemaining)&&integer(row.interestRemaining))){
       const lines=refreshed.data.charges.map((row:any)=>({chargeId:row.id,principal:row.principalRemaining,interest:row.interestRemaining,expectedPrincipalRemaining:row.principalRemaining,expectedInterestRemaining:row.interestRemaining,chargeDate:row.chargeDate}));
       setAllocations(lines);setSelectionRows(refreshed.data.charges);setReceived(lines.reduce((sum:bigint,row:Allocation)=>sum+BigInt(row.principal)+BigInt(row.interest),0n).toString());legacyDraft.current=false;
      }
     }
    }
    setState('edit');
   }catch{if(current===generation.current){setError(t('Unable to load payment draft.','ไม่สามารถโหลดร่างการรับชำระได้'));setState('error')}}
  })();
  return()=>{generation.current++;uploadGeneration.current++;};
 },[borrowerId]);
 const latestDraft=useRef({formVersion:legacyDraft.current?5:6,notes,account,selectionRows,selectedChargeIds:selected,allMode,scope,paymentMethod,received,allocations,image:localImage,bankReference,transferTime,slipDate});
 latestDraft.current={formVersion:legacyDraft.current?5:6,notes,account,selectionRows,selectedChargeIds:selected,allMode,scope,paymentMethod,received,allocations,image:localImage,bankReference,transferTime,slipDate};
 // biome-ignore lint/correctness/useExhaustiveDependencies: autosave debounce: the listed form fields are the save triggers and latestDraft holds the value; access.offline and borrowerId are fixed for the open form
 useEffect(()=>{
  if(state!=='edit'||command.current||autosaveSuspended.current||!draft||!access.offline)return;
  const current=generation.current;
  autosaveTimer.current=setTimeout(()=>{autosaveChain.current=autosaveChain.current.catch(()=>{}).then(async()=>{if(current!==generation.current||command.current||autosaveSuspended.current)return;const value=latestDraft.current;await access.offline!.saveDraft(borrowerId,value);if(current===generation.current&&latestDraft.current===value)setDraftSaveFailed(false)}).catch(()=>{if(current===generation.current&&!command.current){setDraftSaveFailed(true);window.dispatchEvent(new Event('mw-offline-save-failed'))}});},400);
  return()=>clearTimeout(autosaveTimer.current);
 },[notes,account,selectionRows,allMode,localImage,paymentMethod,received,allocations,bankReference,transferTime,slipDate,state,draft]);
 const editable=useRef(false);editable.current=state==='edit'||state==='review';
 useEffect(()=>{
  const saveOnDisconnect=()=>{const current=generation.current;if(editable.current&&access.offline&&!command.current&&!autosaveSuspended.current){autosaveChain.current=autosaveChain.current.catch(()=>{}).then(async()=>{if(current!==generation.current||command.current||!editable.current||autosaveSuspended.current)return;const value=latestDraft.current;await access.offline!.saveDraft(borrowerId,value);if(current===generation.current&&latestDraft.current===value)setDraftSaveFailed(false)});void autosaveChain.current.then(()=>window.dispatchEvent(new Event('mw-offline-saved'))).catch(()=>{if(current===generation.current&&!command.current){setDraftSaveFailed(true);window.dispatchEvent(new Event('mw-offline-save-failed'))}})}};
  const leaving=(event:BeforeUnloadEvent)=>{if(editable.current||command.current&&state==='unknown'){event.preventDefault();event.returnValue='';}};
  window.addEventListener('offline',saveOnDisconnect);window.addEventListener('beforeunload',leaving);
  return()=>{window.removeEventListener('offline',saveOnDisconnect);window.removeEventListener('beforeunload',leaving);};
 },[access.offline,borrowerId,state]);
 async function discardDraft(){
  if(command.current)return;autosaveSuspended.current=true;clearTimeout(autosaveTimer.current);uploadGeneration.current++;setState('loading');
  try{await autosaveChain.current;await access.offline?.remove('draft',borrowerId);setReceived('');setAllocations([]);setUnavailableLines([]);setChangedBalances(null);setSelected([]);setSelectionRows([]);setNotes('');setReceipt(null);setLocalImage(null);setPreview(null);setAllMode(false);setUploading(false);setUploadFailed(false);setDraftSaveFailed(false);setError('');setBankReference('');setTransferTime('');setSlipDate(null);setRecognition(null);accountChosen.current=false;}catch{setError(t('The draft could not be cleared.','ล้างร่างไม่สำเร็จ'));}finally{setState('edit')}
 }
 async function refreshSelection(){
  const operation=++reviewOperation.current;
  if(access.offlineOnly||!navigator.onLine){if(queueEnabled&&draft&&!legacyDraft.current&&validPlan&&draft.accounts.some(row=>row.id===account)&&!uploading&&!uploadFailed&&!changedBalances)return true;setState('edit');setError(t('A valid saved allocation plan is required before offline review.','ต้องมีแผนจัดสรรที่บันทึกและใช้ได้ก่อนตรวจสอบออฟไลน์'));return false;}
  if(localImage&&!receipt&&!queueEnabled){setError(t('Upload the saved receipt or explicitly remove it before review.','อัปโหลดหลักฐานที่บันทึกไว้หรือนำออกก่อนตรวจสอบ'));return false;}
  const current=generation.current;
  try{const {response,data}=await call('/api/payment-drafts/'+encodeURIComponent(borrowerId)+'/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amountReceived:received,allocations,...(materialize.length?{materialize}:{})})});
   if(current!==generation.current||operation!==reviewOperation.current)return false;
   if(!response.ok||data.businessDate!==draft?.businessDate||!data.accounts?.some((row:any)=>row.id===account)){
    if(data.code==='plan_changed'&&Array.isArray(data.charges))setChangedBalances({operation,generation:current,charges:data.charges,upcoming:Array.isArray(data.upcoming)?data.upcoming:[],businessDate:data.businessDate});
    setState('edit');setError(t('The allocation plan changed. Refresh balances and review each amount again.','แผนรับชำระเปลี่ยน กรุณารีเฟรชยอดและตรวจสอบแต่ละรายการอีกครั้ง'));return false;
   }return true;
  }catch{if(current!==generation.current||operation!==reviewOperation.current)return false;setState('edit');setError(t('Connect and refresh before reviewing.','เชื่อมต่อและรีเฟรชก่อนตรวจสอบ'));return false;}
 }
 function useCurrentBalances(){
  if(!changedBalances||command.current||changedBalances.operation!==reviewOperation.current||changedBalances.generation!==generation.current)return;
  const current=changedBalances;reviewOperation.current++;
  const unavailable:string[]=[];
  // R101: a next charge booked meanwhile is a recorded charge now; it leaves `upcoming` and shows once, without the badge.
  const nextUpcoming=current.upcoming.filter(row=>!current.charges.some(item=>item.id===row.id));
  const next=allocations.map(line=>{const row=current.charges.find(row=>row.id===line.chargeId)??nextUpcoming.find(row=>row.id===line.chargeId);if(!row||!integer(row.principalRemaining)||!integer(row.interestRemaining)){unavailable.push(line.chargeId);return line;}return {...line,expectedPrincipalRemaining:row.principalRemaining,expectedInterestRemaining:row.interestRemaining,chargeDate:row.chargeDate};});
  const booked=current.charges.filter(row=>selectionRows.some(item=>item.id===row.id&&'loanId' in item));
  setAllocations(next);setUnavailableLines(unavailable);setChangedBalances(null);setState('edit');setUpcoming(nextUpcoming);
  setSelectionRows(old=>old.map(row=>current.charges.find(item=>item.id===row.id)??nextUpcoming.find(item=>item.id===row.id)??row));
  setDraft(old=>old?{...old,businessDate:current.businessDate,charges:[...old.charges.map(row=>current.charges.find(item=>item.id===row.id)??row),...booked.filter(row=>!old.charges.some(item=>item.id===row.id))]}:old);
  setError(t('Current balances adopted. Paid amounts are unchanged; resolve unavailable or over-limit lines, then review again.','ใช้ยอดปัจจุบันแล้ว ยอดจัดสรรไม่เปลี่ยน กรุณาแก้ไขรายการที่ใช้ไม่ได้หรือเกินยอด แล้วตรวจสอบอีกครั้ง'));
 }
 async function autoAssign(slipAmount?:string):Promise<'assigned'|'empty'|'failed'|'skipped'>{
  if(slipAmount===undefined&&allocations.some(row=>(integer(row.principal)&&BigInt(row.principal)>0n)||(integer(row.interest)&&BigInt(row.interest)>0n))&&!window.confirm(projectedAllocated?t('Replace the current allocation plan with Auto-assign? Next charges you ticked will be cleared.','แทนที่แผนจัดสรรปัจจุบันด้วยการจัดสรรอัตโนมัติหรือไม่ งวดถัดไปที่เลือกไว้จะถูกล้าง'):t('Replace the current allocation plan with Auto-assign?','แทนที่แผนจัดสรรปัจจุบันด้วยการจัดสรรอัตโนมัติหรือไม่')))return 'skipped';
  const amount=slipAmount??received;
  if(!integer(amount)||BigInt(amount)<=0n)return 'skipped';const current=generation.current,operation=++reviewOperation.current;setAutoEmpty(false);
  try{const {response,data}=await call('/api/payment-drafts/'+encodeURIComponent(borrowerId)+'/auto-assign',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amountReceived:amount})});if(current!==generation.current||operation!==reviewOperation.current)return 'skipped';if(!response.ok||!Array.isArray(data?.allocations))throw Error();legacyDraft.current=false;setUnavailableLines([]);setChangedBalances(null);setAllocations(data.allocations);setSelectionRows(data.charges.filter((row:any)=>data.allocations.some((line:Allocation)=>line.chargeId===row.id)));setSelected(data.allocations.map((line:Allocation)=>line.chargeId));setError('');
   // Auto-assign covers charges due by the business date only; say so instead of leaving ฿0 allocated silently.
   if(!data.allocations.length){setAutoEmpty(true);return 'empty';}return 'assigned';}catch{if(current===generation.current&&operation===reviewOperation.current)setError(t('Unable to auto-assign. Refresh and try again.','จัดสรรอัตโนมัติไม่สำเร็จ กรุณารีเฟรชและลองอีกครั้ง'));return 'failed';}
 }
 function editLine(row:Draft['charges'][number],field:'principal'|'interest',value:string){
  if(!integer(row.principalRemaining)||!integer(row.interestRemaining)){setError(t('Refresh current balances online before editing this saved charge.','รีเฟรชยอดปัจจุบันขณะออนไลน์ก่อนแก้ไขรายการที่บันทึกไว้'));return;}
  legacyDraft.current=false;reviewOperation.current++;setError('');setAutoEmpty(false);
  setAllocations(old=>{const existing=old.find(line=>line.chargeId===row.id)??{chargeId:row.id,principal:'0',interest:'0',expectedPrincipalRemaining:row.principalRemaining,expectedInterestRemaining:row.interestRemaining,chargeDate:row.chargeDate};const next={...existing,[field]:value};return [...old.filter(line=>line.chargeId!==row.id),...(next.principal==='0'&&next.interest==='0'?[]:[next])];});
  setSelectionRows(old=>old.some(item=>item.id===row.id)?old:[...old,row]);
 }
 function toggleLine(row:Draft['charges'][number],checked:boolean){
  legacyDraft.current=false;reviewOperation.current++;setAutoEmpty(false);
  if(!checked){setAllocations(old=>old.filter(line=>line.chargeId!==row.id));return;}
  if(!integer(row.principalRemaining)||!integer(row.interestRemaining))return;
  const available=BigInt(total)-allocated;if(available<=0n)return;
  const interest=available<BigInt(row.interestRemaining)?available:BigInt(row.interestRemaining),rest=available-interest,principal=rest<BigInt(row.principalRemaining)?rest:BigInt(row.principalRemaining);
  setAllocations(old=>[...old.filter(line=>line.chargeId!==row.id),{chargeId:row.id,principal:principal.toString(),interest:interest.toString(),expectedPrincipalRemaining:row.principalRemaining,expectedInterestRemaining:row.interestRemaining,chargeDate:row.chargeDate}]);setSelectionRows(old=>old.some(item=>item.id===row.id)?old:[...old,row]);
 }
 async function chargePage(index:number){
  if(paging)return;
  const cursor=index>pageIndex?draft?.nextCursor:pageCursors.current[index];if(index>pageIndex&&!cursor)return;
  const current=generation.current;setPaging(true);
  try{const path='/api/payment-drafts/'+encodeURIComponent(borrowerId)+'?scope=all'+(cursor?'&cursor='+encodeURIComponent(cursor):'');const cached=access.offlineOnly||!navigator.onLine?await readOfflineDataset(access,path):null;const {response,data}=cached?{response:{ok:true},data:cached}:await call(path);if(current!==generation.current)return;if(!response.ok)throw Error();pageCursors.current[index]=cursor??undefined;setDraft(data);if(Array.isArray(data.upcoming))setUpcoming(data.upcoming);setPageIndex(index)}catch{if(current===generation.current)setError(t('Unable to load the page.','โหลดหน้านี้ไม่ได้'));}finally{if(current===generation.current)setPaging(false)}
 }
 const autoBlocked=!!access.offlineOnly||!online||!integer(received)||BigInt(total)<=0n;
 async function review(){if(reviewing)return;setState('review');setReviewing(true);try{await refreshSelection()}finally{setReviewing(false)}}
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
 async function upload(file:File|undefined){
  const seq=++uploadGeneration.current,current=generation.current;setUploading(false);setReceipt(null);setPreview(null);setUploadFailed(false);setRecognition(null);setSlipDate(null);setTransferTime('');
  setLocalImage(file??null);receiptDescriptor.current=null;if(!file)return;
  if(access.offlineOnly||!navigator.onLine){if(['image/png','image/jpeg'].includes(file.type)&&file.size>0&&file.size<=5242880){setPreview(URL.createObjectURL(file));return;}setUploadFailed(true);return;}
  if(!navigator.onLine||!['image/png','image/jpeg'].includes(file.type)||!file.size||file.size>5242880){setUploadFailed(true);setError(t('Choose a PNG or JPEG up to 5 MiB while online.','เลือก PNG หรือ JPEG ไม่เกิน 5 MiB ขณะออนไลน์'));return;}
  setPreview(URL.createObjectURL(file));setUploading(true);const id=crypto.randomUUID();
  try{const {response,data}=await call('/api/payment-commands/'+requestId.current+'/receipts/'+id,{method:'POST',headers:{'Content-Type':file.type,'X-Borrower-ID':borrowerId},body:file});if(!response.ok)throw Error();if(seq!==uploadGeneration.current||current!==generation.current)return;receiptDescriptor.current=data?.receipt??null;setReceipt(id);setError('');void recognize(id,seq);}
  catch{if(seq===uploadGeneration.current&&current===generation.current){setUploadFailed(true);setError(t('Receipt upload failed. Retry or remove the receipt before confirming.','อัปโหลดหลักฐานไม่สำเร็จ ลองอีกครั้งหรือนำหลักฐานออกก่อนยืนยัน'));}}
  finally{if(seq===uploadGeneration.current&&current===generation.current)setUploading(false);}
 }
 // R075: read the uploaded slip once; fill only empty fields, never block review or confirm.
 async function recognize(id:string,seq:number){
  const current=generation.current;recognitionTouched.current=new Set();setRecognition({receiptId:id,phase:'reading'});
  const stale=()=>seq!==uploadGeneration.current||current!==generation.current||!!command.current;
  const done=beginRequest(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),RECOGNITION_DEADLINE_MS);
  try{
   if(access.offlineOnly||!navigator.onLine)throw Error('Offline');
   const token=await access.token();
   const response=await fetch(access.origin+'/api/payment-commands/'+requestId.current+'/receipts/'+id+'/recognition',{method:'POST',headers:{Authorization:'Bearer '+token,'X-Borrower-ID':borrowerId},cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});
   if(response.status===401||response.status===403){access.authFailure(response.status);throw Error('access_denied');}
   const data=await response.json();
   if(stale())return;
   if(response.ok&&data?.status==='unrecognized'){setRecognition({receiptId:id,phase:'unconfirmed'});return;}
   if(!response.ok||data?.status!=='recognized'||!data.suggestion||typeof data.suggestion!=='object')throw Error('unavailable');
   applyRecognition(id,data);
  }catch{if(!stale())setRecognition({receiptId:id,phase:'failed'});}
  finally{clearTimeout(timer);done();}
 }
 function applyRecognition(id:string,data:any){
  if(!draft)return;
  const s=data.suggestion,latest=latestDraft.current,touched=recognitionTouched.current,filled:SlipField[]=[];
  const text=(value:unknown)=>typeof value==='string'?value:null;
  const amount=text(s.amountReceived),accountId=text(s.cashAccountId),reference=text(s.bankReference),day=text(s.paymentDate),time=text(s.transferTime);
  const slipAmount=amount&&/^[1-9][0-9]{0,16}$/.test(amount)?amount:null;
  const slipAccountId=accountId&&draft.accounts.some(row=>row.id===accountId)?accountId:null;
  const slipReference=reference&&/^[A-Z0-9]{6,100}$/.test(reference)?reference:null;
  const slipDay=day&&slipDays(draft.businessDate).includes(day)?day:null;
  const slipTime=time&&/^([01]\d|2[0-3]):[0-5]\d$/.test(time)?time:null;
  // A field typed during recognition counts as not empty.
  const amountFilled=!!slipAmount&&latest.received===''&&!touched.has('amount');
  if(amountFilled){legacyDraft.current=false;reviewOperation.current++;setReceived(slipAmount!);filled.push('amount');}
  // R076: the slip's matched account replaces an empty or preselected account; an account chosen by hand stays (mismatch note).
  if(slipAccountId&&latest.account!==slipAccountId&&!accountChosen.current){setAccount(slipAccountId);filled.push('account');}
  if(!touched.has('method')&&latest.paymentMethod!=='Bank Transfer'){reviewOperation.current++;setPaymentMethod('Bank Transfer');}
  if(slipReference&&normalizedReference(latest.bankReference)===''&&!touched.has('reference')){setBankReference(slipReference);filled.push('reference');}
  if(slipDay){setSlipDate(slipDay);filled.push('date');}
  // The slip transfer time has no form field: it is carried with an accepted slip date into the command (Created At).
  setTransferTime(slipTime&&slipDay?slipTime:'');
  const autoRun=amountFilled&&latest.allocations.length===0&&!access.offlineOnly&&navigator.onLine;
  const provider=typeof data.provider==='string'&&/^[a-z][a-z0-9_-]{0,31}$/.test(data.provider)?data.provider.charAt(0).toUpperCase()+data.provider.slice(1):null;
  const warnings:any[]=Array.isArray(data.warnings)?data.warnings:[],outside=warnings.find(w=>w?.code==='date_outside_window');
  // A slip date outside {business date, day before} is never used; name it when it was readable.
  const outsideDate=text(outside?.date)??(day&&!slipDay?day:null);
  const dateNotUsed=outside||(day&&!slipDay)?(outsideDate&&/^\d{4}-\d{2}-\d{2}$/.test(outsideDate)?outsideDate:''):null;
  // The slip printed a recipient number that matched no account, or more than one: say so under Receiving account.
  const accountNote=slipAccountId?null:warnings.some(w=>w?.code==='account_ambiguous')?'ambiguous':warnings.some(w=>w?.code==='account_unmatched')||accountId?'unmatched':null;
  // R095: the payer name read from the slip and the payer lines a posted payment would store; nothing when no name was read.
  const payer=data.payer&&typeof data.payer==='object'?data.payer:null,slipPayer=payerText(payer?.slipName),payerAfter=slipPayer?payerLinesText(payer?.after):null;
  const payerBefore=typeof payer?.before==='string'?payer.before:null,payerFirst=Array.isArray(payer?.lines)&&payer.lines.length===0;
  setRecognition({receiptId:id,phase:'done',provider,filled,autoSkipped:amountFilled&&!autoRun,slipAmount,slipAccountId,slipReference,referenceExists:warnings.some(w=>w?.code==='reference_exists'),dateNotUsed,accountNote,slipPayer,payerBefore,payerAfter,payerFirst});
  if(autoRun)void autoAssign(slipAmount!).then(outcome=>{if(outcome==='empty'||outcome==='failed')setRecognition(old=>old?.receiptId===id&&old.phase==='done'?{...old,autoOutcome:outcome}:old)});
 }
 function result(data:any){
  if(data.kind==='recorded'){if(data.originalOutcome.status==='rejected')setError(savedRejectionMessage({data},thai));setOutcome(data.originalOutcome);setState(data.originalOutcome.status);if(!queueEnabled||data.originalOutcome.status==='posted')clearPending();if(data.originalOutcome.status==='posted'&&notifiedPosted.current!==requestId.current){notifiedPosted.current=requestId.current;
   // R078 follow-up: applied and its receipt stored now (this screen closes once the payment is announced).
   void confirmOwnPayment(access,requestId.current,command.current?.receiptId?{receiptId:command.current.receiptId,file:localImage,descriptor:receiptDescriptor.current}:undefined);(onPosted??access.onPosted)?.(requestId.current);}}
  else if(data.code==='command_conflict'||data.kind==='conflict'){setState('conflict');if(!queueEnabled)clearPending();}
  // W4-UX-02/03: busy is a known non-outcome (nothing applied); the same command is retried, never "outcome unknown".
  else if(data.code==='command_busy'){setState('busy');setError('');}
  else{setState('unknown');setChecked(data.kind==='unresolved');}
 }
 async function confirm(){if(confirming.current)return;confirming.current=true;setReviewing(true);try{await confirmOnce()}finally{confirming.current=false;setReviewing(false)}}
 async function confirmOnce(){
  if((access.offlineOnly||!navigator.onLine)&&!queueEnabled)return;
  if(!command.current && !(await refreshSelection()))return;
  if(!command.current){if(!draft||!validPlan||uploading||preparingReceipt||uploadFailed)return;if(!slipFieldsValid)return;command.current={schemaVersion:7,requestId:requestId.current,borrowerId,allocations:allocations.map(row=>({...row})),cashAccountId:account,paymentDate,amountReceived:received,paymentMethod,notes:notes===''?null:notes,receiptId:receipt??(queueEnabled&&localImage?crypto.randomUUID():null),bankReference:bankTransfer&&referenceText?referenceText:null,transferTime:bankTransfer&&transferTime?transferTime:null,...(payerLearns?{schemaVersion:8,payerLines:{before:recognized!.payerBefore??null,after:recognized!.payerAfter!}}:{}),
   // R101 v9 = v8 plus materialize, only when a next-charge line is allocated (payerLines then null unless learning).
   ...(materialize.length?{schemaVersion:9,payerLines:payerLearns?{before:recognized!.payerBefore??null,after:recognized!.payerAfter!}:null,materialize:materialize.map(row=>({...row}))}:{})};}
  if(queueEnabled){
   clearTimeout(autosaveTimer.current);autosaveSuspended.current=true;await autosaveChain.current;
   try{
    const existing=await access.offline!.pending(requestId.current);
    if(!existing){await access.offline!.savePending(requestId.current,{domain:'payment',recoveryKind:'payment',command:command.current,...(localImage&&!receipt?{receipt:{id:command.current!.receiptId!,image:localImage,borrowerId}}:{})});}
    await access.offline!.remove('draft',borrowerId).catch(()=>{});
    retainPending();setState('queued');setError('');window.dispatchEvent(new Event('mw-offline-saved'));
    const outcome=await syncSavedRequest(access,requestId.current);
    if(outcome.kind==='blocked'){setState('rejected');setError(savedRejectionMessage(outcome,thai));}
    else if(isBusyOutcome(outcome)){setState('busy');setError('');}
    else if(outcome.data)result(outcome.data);
   }catch{setStorageBlocked(true);setState('unknown');setChecked(false);retainPending();setError(t('The confirmed payment could not be saved on this device. Keep this reference and retry only this same request after checking its status.','บันทึกคำขอรับชำระที่ยืนยันในอุปกรณ์ไม่สำเร็จ เก็บหมายเลขอ้างอิงและลองเฉพาะคำขอเดิมหลังตรวจสอบสถานะ'));}
   return;
  }
  clearTimeout(autosaveTimer.current);await autosaveChain.current;
  try{if(access.offline){await access.offline.savePending(requestId.current,command.current);await access.offline.remove('draft',borrowerId)}}catch{setStorageBlocked(true);setState('unknown');setChecked(false);retainPending();setError(t('The original command is locked. Storage could not be completed and no payment was sent by this attempt. Keep the reference, check status, and retry only this same command.','คำขอเดิมถูกล็อก บันทึกในอุปกรณ์ไม่สำเร็จและครั้งนี้ยังไม่ได้ส่งรับชำระ เก็บหมายเลขอ้างอิง ตรวจสอบสถานะ แล้วลองเฉพาะคำขอเดิม'));return;}
  checkOperation.current++;setChecking(false);retainPending();setState('sending');setChecked(false);setError('');const current=generation.current;
  try{const {data}=await call('/api/payment-commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command.current)});if(current===generation.current)result(data)}
  catch{if(current===generation.current)setState('unknown');}
 }
 const resultNow=useRef(result);resultNow.current=result;
 useEffect(()=>{const completed=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.requestId===requestId.current){if(detail.kind==='blocked'){setState('rejected');setError(savedRejectionMessage(detail,thaiNow.current));}else if(detail.data)resultNow.current(detail.data)}};window.addEventListener('mw-offline-sync-outcome',completed);return()=>window.removeEventListener('mw-offline-sync-outcome',completed)},[]);
 async function check(){
  if(checkingRef.current)return;checkingRef.current=true;
  const current=generation.current,operation=++checkOperation.current;setChecking(true);setError('');setChecked(false);
  try{const {response,data}=await call('/api/payment-commands/'+requestId.current);if(current!==generation.current||operation!==checkOperation.current)return;if(!response.ok)throw Error();result(data)}
  catch{if(current===generation.current&&operation===checkOperation.current)setError(t('Status is unavailable. Keep this reference and check again.','ไม่สามารถตรวจสอบสถานะได้ เก็บหมายเลขอ้างอิงนี้และลองอีกครั้ง'));}
  finally{if(current===generation.current&&operation===checkOperation.current){checkingRef.current=false;setChecking(false);}}
 }
 // biome-ignore lint/correctness/useExhaustiveDependencies: loads the stored receipt once the payment is posted (state is the trigger); localImage, access and t are read at that moment on purpose
 useEffect(()=>{
  if(state!=='posted'||!command.current?.receiptId)return;
  const current=generation.current,controller=new AbortController();let objectUrl:string|undefined,active=true;
  const timer=setTimeout(()=>controller.abort(),15000);setReceiptReadError('');
  void(async()=>{
   try{
    // R078 follow-up: the picked file is shown when it is byte-identical to the stored receipt (upload sha256 and
    // size); otherwise the verified copy is downloaded once and shared with the payment result and the offline seed.
    const image=await verifiedOwnReceipt(access,requestId.current,command.current!.receiptId!,{file:localImage,descriptor:receiptDescriptor.current});if(!image)throw Error();if(current!==generation.current||controller.signal.aborted)return;
    objectUrl=URL.createObjectURL(image);setVerifiedPreview(objectUrl);
   }catch{if(current===generation.current&&active)setReceiptReadError(t('Payment remains Posted. The receipt could not be loaded.','ผลรับชำระยังคงบันทึกแล้ว แต่ไม่สามารถโหลดหลักฐานได้'));}
   finally{clearTimeout(timer);}
  })();
  return()=>{active=false;clearTimeout(timer);controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[state]);

 // R101 wording (Echo W-01, W-02, W-03, A-01).
 const nextChargeBadge=t('Next charge · not yet due','งวดถัดไป · ยังไม่ครบกำหนด');
 const nextChargeHelp=t('Not yet due: confirming creates this charge and pays it.','ยังไม่ครบกำหนด: เมื่อยืนยัน ระบบจะสร้างรายการเรียกเก็บนี้และรับชำระทันที');
 const nextChargeLabel=t(', next charge, not yet due',' งวดถัดไป ยังไม่ครบกำหนด');
 const payAheadHint=shownUpcoming.length>0?t(' Tick a next charge below to pay early.',' เลือกงวดถัดไปด้านล่างเพื่อชำระล่วงหน้า'):'';
 // One allocation row; a next charge carries the badge after the loan key and the not-yet-due suffix on its labels.
 const allocationRow=(row:ChargeRow,projected:boolean)=>{const line=allocations.find(line=>line.chargeId===row.id),suffix=projected?nextChargeLabel:'';return <article className="payment-allocation-row" key={row.id}><div><label><input type="checkbox" aria-label={t('Allocate to ','จัดสรรให้ ')+row.loanDisplayKey+' '+row.chargeDate+suffix} aria-describedby={projected?'next-charge-help':undefined} checked={!!line} onChange={event=>toggleLine(row,event.target.checked)}/><span>{displayValue(row.chargeDate)}</span></label><strong>{row.loanDisplayKey}</strong>{projected&&<small className="next-charge-badge">{nextChargeBadge}</small>}{blockedLines.includes(row.id)&&<span role="status">{t('Unavailable — remove this allocation before review','รายการใช้ไม่ได้ กรุณานำยอดจัดสรรนี้ออกก่อนตรวจสอบ')}</span>}</div><label><span>{t('Principal','เงินต้น')} ({t('Max','สูงสุด')} {money(row.principalRemaining)})</span><input aria-label={t('Principal for ','เงินต้นสำหรับ ')+row.loanDisplayKey+' '+row.chargeDate+suffix} inputMode="numeric" value={line?.principal??'0'} onChange={event=>editLine(row,'principal',event.target.value)}/></label><label><span>{t('Interest','ดอกเบี้ย')} ({t('Max','สูงสุด')} {money(row.interestRemaining)})</span><input aria-label={t('Interest for ','ดอกเบี้ยสำหรับ ')+row.loanDisplayKey+' '+row.chargeDate+suffix} inputMode="numeric" value={line?.interest??'0'} onChange={event=>editLine(row,'interest',event.target.value)}/></label></article>};
 const copyReference=<button type="button" className="secondary-button" onClick={()=>void navigator.clipboard?.writeText(requestId.current)}>{t('Copy','คัดลอก')}</button>;
 return <section onChangeCapture={()=>{autosaveSuspended.current=false}} className="selected-payment" aria-label={t('Selected charges payment','รับชำระรายการที่เลือก')}>

 <div className="payment-context">{<HeaderBack navigationKey="payment-receiving" disabled={['sending','unknown'].includes(state)} className="secondary-button icon-action" aria-label={t('Back to Collection','กลับงานติดตาม')} title={t('Back to Collection','กลับงานติดตาม')} onClick={onBack}><Icon name="back"/></HeaderBack>}<strong>{draft?.borrower.displayName??t('Receive payment','รับชำระเงิน')}</strong>{state==='edit'&&<div className="borrower-direct-actions"><RecordAction icon="clear" className="secondary-button" onClick={()=>void discardDraft()}>{t('Clear draft','ล้างร่าง')}</RecordAction></div>}</div>
 {savedAt&&<p>{t('Offline saved copy — not current','สำเนาออฟไลน์ — ไม่ใช่ข้อมูลปัจจุบัน')}: {displayTimestamp(savedAt)}</p>}
 {error&&<p role="alert">{error}</p>}{draftSaveFailed&&['edit','review'].includes(state)&&<p role="alert">{t('Changes are not saved on this device. Keep this form open.','การเปลี่ยนแปลงยังไม่ถูกบันทึกในอุปกรณ์ โปรดเปิดหน้านี้ไว้')}</p>}

 {state==='edit'&&draft&&<>

 {slipPayer&&<p className="field-summary">{t('Payer on slip: ','ผู้โอนในสลิป: ')}<strong className="field-summary-value">{slipPayer}</strong></p>}
 {payerLearns&&<p className="field-help" role="status">{recognized?.payerFirst?t("Will be saved as this borrower's payer name.",'จะบันทึกเป็นชื่อผู้โอนของผู้กู้รายนี้'):t('Will be added as another payer for this borrower.','จะเพิ่มเป็นผู้โอนอีกคนของผู้กู้รายนี้')}</p>}
 <label className="payment-received-input"><span className="field-title">{t('Amount received','ยอดรับชำระ')}</span><input required inputMode="numeric" value={received} onChange={event=>{recognitionTouched.current.add('amount');legacyDraft.current=false;reviewOperation.current++;setAutoEmpty(false);setReceived(event.target.value)}}/></label>
 {recognized?.filled?.includes('amount')&&received===recognized.slipAmount&&<p className="field-help">{t('Filled from slip.','กรอกจากสลิป')}</p>}
 {amountMismatch&&<p className="field-help recognition-note" role="status">{t('Slip shows a different amount: ','สลิปแสดงยอดที่ต่างกัน: ')}{money(recognized!.slipAmount!)}. <button type="button" className="secondary-button" onClick={()=>{legacyDraft.current=false;reviewOperation.current++;setReceived(recognized!.slipAmount!)}}>{t('Use slip amount','ใช้ยอดตามสลิป')}</button></p>}
 {autoBlocked&&<p className="field-help" id="auto-assign-help">{access.offlineOnly||!online?t('Auto-assign needs a connection. Allocate each charge below.','การจัดสรรอัตโนมัติต้องเชื่อมต่ออินเทอร์เน็ต กรุณาจัดสรรแต่ละรายการด้านล่าง'):t('Enter the amount received to use Auto-assign.','กรอกยอดรับชำระก่อน จึงจะใช้การจัดสรรอัตโนมัติได้')}</p>}
 <div className="payment-selection-header allocation-summary"><button type="button" className="secondary-button allocation-auto-button" disabled={autoBlocked} aria-describedby={autoBlocked?'auto-assign-help':undefined} onClick={()=>void autoAssign()}>{t('Auto-assign','จัดสรรอัตโนมัติ')}</button><button type="button" className="secondary-button icon-action" aria-label={t('Clear allocations','ล้างการจัดสรร')} title={t('Clear allocations','ล้างการจัดสรร')} onClick={()=>{reviewOperation.current++;legacyDraft.current=false;setAllocations([]);setSelected([]);setSelectionRows([]);setUnavailableLines([]);setChangedBalances(null);setAllMode(false)}}><Icon name="clear"/></button><output aria-live="polite"><span>{t('Received','รับชำระ')}<strong>{money(total)}</strong></span><span>{t('Allocated','จัดสรรแล้ว')}<strong>{money(allocated.toString())}</strong></span><span>{t('Remaining','คงเหลือ')}<strong>{money((BigInt(total)-allocated).toString())}</strong></span></output><button type="button" className="secondary-button payment-review-button" aria-label={t('Review payment','ตรวจสอบการรับชำระ')} disabled={(!queueEnabled&&(access.offlineOnly||!online))||!validPlan||!account||uploading||preparingReceipt||uploadFailed||!slipFieldsValid||new TextEncoder().encode(notes).length>65536||notes.includes('\0')} onClick={()=>void review()}><Icon name="review"/><span>{t('Review','ตรวจสอบ')}</span></button></div>
 {autoEmpty&&recognized?.autoOutcome!=='empty'&&<p className="field-help" role="status">{t('No charges are due by today, so Auto-assign allocated nothing. Allocate each charge below.','ไม่มีรายการครบกำหนดภายในวันนี้ จึงไม่ได้จัดสรรอัตโนมัติ กรุณาจัดสรรแต่ละรายการด้านล่าง')}{payAheadHint}</p>}
 {changedBalances&&changedBalances.operation===reviewOperation.current&&changedBalances.generation===generation.current&&!command.current&&<button type="button" className="secondary-button" onClick={useCurrentBalances}>{t('Use current balances','ใช้ยอดคงเหลือปัจจุบัน')}</button>}
 {/* biome-ignore lint/a11y/noNoninteractiveTabindex lint/a11y/useSemanticElements: keyboard-scrollable allocation region; tabIndex lets keyboard users scroll it and the div keeps the existing scroll styling */}<div className="payment-charge-scroll" role="region" tabIndex={0} aria-label={t('Payment allocation','จัดสรรการรับชำระ')}>{draft.charges.map(row=>allocationRow(row,false))}{(shownUpcoming.length>0||staleProjected.length>0)&&<><h4>{t('Pay ahead','ชำระล่วงหน้า')}</h4><p className="field-help" id="next-charge-help">{nextChargeHelp}</p>{shownUpcoming.map(row=>allocationRow(row,true))}{staleProjected.map(id=>{const line=allocations.find(line=>line.chargeId===id)!;return allocationRow(selectionRows.find(row=>row.id===id)??{id,chargeDate:line.chargeDate,loanDisplayKey:'',amountRemaining:'0',principalRemaining:line.expectedPrincipalRemaining,interestRemaining:line.expectedInterestRemaining},true)})}</>}</div>
 <CompactPager busy={paging} previous={pageIndex>0?()=>void chargePage(pageIndex-1):undefined} next={draft.nextCursor?()=>void chargePage(pageIndex+1):undefined} previousLabel={t('Previous charge page','หน้ารายการก่อนหน้า')} nextLabel={t('Next charge page','หน้ารายการถัดไป')}/>
 <label><span className="field-title">{t('Payment method','วิธีชำระเงิน')}</span><select required value={paymentMethod==='Net-off at Disbursement'?'':paymentMethod} onChange={event=>{recognitionTouched.current.add('method');reviewOperation.current++;setPaymentMethod(event.target.value as Command['paymentMethod'])}}><option value="" disabled>{t('Choose payment method','เลือกวิธีชำระเงิน')}</option><option value="Bank Transfer">{t('Bank Transfer','โอนเงิน')}</option><option value="Cash">{t('Cash','เงินสด')}</option></select></label>
 {slipDate&&paymentDate===slipDate&&<p className="field-summary">{t('Payment date','วันที่รับชำระ')}: <strong className="field-summary-value">{displayValue(paymentDate)}</strong> ({t('slip','สลิป')}){paymentDate!==draft.businessDate&&<> · {t('business date','วันทำการ')} {displayValue(draft.businessDate)}</>}</p>}
 <label><span className="field-title">{t('Receiving account','บัญชีรับชำระ')}</span><select required value={account} onChange={event=>{recognitionTouched.current.add('account');accountChosen.current=true;setAccount(event.target.value)}}><option value="">{t('Select account','เลือกบัญชี')}</option>{draft.accounts.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
 {accountMismatch&&<p className="field-help recognition-note" role="status">{t('Slip shows a different account: ','สลิปแสดงบัญชีที่ต่างกัน: ')}{draft.accounts.find(row=>row.id===recognized!.slipAccountId)?.label}. <button type="button" className="secondary-button" onClick={()=>{accountChosen.current=true;setAccount(recognized!.slipAccountId!)}}>{t('Use slip account','ใช้บัญชีตามสลิป')}</button></p>}
 {recognized?.accountNote&&<p className="field-help recognition-note" role="status">{recognized.accountNote==='ambiguous'?t('Slip account matches more than one account — check the receiving account.','บัญชีในสลิปตรงกับหลายบัญชี — กรุณาตรวจสอบบัญชีรับชำระ'):t('Slip account not matched — check the receiving account.','บัญชีในสลิปไม่ตรงกับบัญชีรับชำระ — กรุณาตรวจสอบบัญชีรับชำระ')}</p>}
 {bankTransfer&&<>
 <label><span className="field-title">{t('Bank reference','เลขอ้างอิงธนาคาร')}</span><input className="slip-reference" inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={120} value={bankReference} aria-invalid={referenceText!==''&&!/^[A-Z0-9]{6,100}$/.test(referenceText)} onChange={event=>{recognitionTouched.current.add('reference');setBankReference(event.target.value)}}/></label>
 {referenceText!==''&&!/^[A-Z0-9]{6,100}$/.test(referenceText)&&<p className="field-help">{t('Use 6–100 letters or digits, or leave it empty.','ใช้ตัวอักษรหรือตัวเลข 6–100 ตัว หรือเว้นว่าง')}</p>}
 {duplicateReference&&<p className="field-help" role="status">{t('This reference is already on a recorded payment.','เลขอ้างอิงนี้มีอยู่ในรายการรับชำระที่บันทึกแล้ว')}</p>}
 </>}
 <label><span className="field-title">{t('Notes','หมายเหตุ')}</span><textarea value={notes} onChange={event=>setNotes(event.target.value)}/></label>
 {/* R076: recognition messages sit directly above the receipt preview so they are seen with the slip. */}
 {recognition?.phase==='reading'&&<p className="field-help" role="status">{t('Reading slip…','กำลังอ่านสลิป…')}</p>}
 {recognition?.phase==='failed'&&<p className="field-help" role="status">{t('Slip not read — enter details manually.','อ่านสลิปไม่ได้ — กรุณากรอกรายละเอียดเอง')}</p>}
 {recognition?.phase==='unconfirmed'&&<p className="field-help" role="status">{t('The slip does not show a completed transfer — enter details manually.','สลิปไม่แสดงการโอนที่สำเร็จ — กรุณากรอกรายละเอียดเอง')}</p>}
 {recognized&&<p className="field-help recognition-note" role="status">{recognized.filled?.length?<>{t('From slip','จากสลิป')}{recognized.provider?` (${recognized.provider})`:''}: {recognized.filled.map(field=>({amount:t('amount','ยอด'),account:t('account','บัญชี'),reference:t('reference','เลขอ้างอิง'),date:t('date','วันที่')})[field]).join(', ')}. {t('Check before review.','ตรวจสอบก่อนกดตรวจสอบรายการ')}</>:t('Slip read; no empty fields to fill. Check before review.','อ่านสลิปแล้ว ไม่มีช่องว่างให้กรอก ตรวจสอบก่อนกดตรวจสอบรายการ')}{recognized.autoSkipped?' '+t('Auto-assign skipped: allocations already entered.','ไม่ได้จัดสรรอัตโนมัติ เพราะมีการจัดสรรอยู่แล้ว'):''}{recognized.autoOutcome==='empty'?' '+t('Auto-assign found no charges due by today — allocate below.','ไม่มีรายการครบกำหนดภายในวันนี้ให้จัดสรรอัตโนมัติ — กรุณาจัดสรรด้านล่าง')+payAheadHint:recognized.autoOutcome==='failed'?' '+t('Auto-assign did not run — use Auto-assign or allocate below.','จัดสรรอัตโนมัติไม่สำเร็จ — กด จัดสรรอัตโนมัติ หรือจัดสรรด้านล่าง'):''}</p>}
 {typeof recognized?.dateNotUsed==='string'&&<p className="field-help" role="status">{recognized.dateNotUsed?`${t('Slip date not used: ','ไม่ได้ใช้วันที่ตามสลิป: ')}${displayValue(recognized.dateNotUsed)}.`:t('Slip date not used.','ไม่ได้ใช้วันที่ตามสลิป')}</p>}
 <ReceiptPicker thai={thai} attached={!!(receipt||localImage||uploadFailed||uploading)} preview={preview} busy={uploading} onPreparing={setPreparingReceipt} onPick={file=>void upload(file)} onRemove={()=>{uploadGeneration.current++;setReceipt(null);setLocalImage(null);setPreview(null);setUploadFailed(false);setUploading(false);setError('');setRecognition(null);setSlipDate(null);setTransferTime('')}}/>
 {localImage&&!receipt&&!access.offlineOnly&&<button type="button" className="secondary-button" disabled={uploading} onClick={()=>void upload(new File([localImage],'receipt',{type:localImage.type}))}>{t('Upload saved receipt','อัปโหลดหลักฐานที่บันทึกไว้')}</button>}

 </>}
 {state==='review'&&draft&&<><ul>{allocations.map(row=><li key={row.chargeId}>{selectionRows.find(charge=>charge.id===row.chargeId)?.loanDisplayKey??t('Loan unavailable','ไม่มีข้อมูลสินเชื่อ')}{projectedIds.has(row.chargeId)&&<> <small className="next-charge-badge">{nextChargeBadge}</small></>} · {displayValue(row.chargeDate)} · {t('Principal','เงินต้น')} {money(row.principal)} · {t('Interest','ดอกเบี้ย')} {money(row.interest)}</li>)}</ul>{projectedAllocated&&<p className="field-help">{nextChargeHelp}</p>}<p className="field-summary">{t('Amount to receive','ยอดรับชำระ')}: <strong className="field-summary-value">{money(total)}</strong></p><p className="field-summary">{t('Receiving account','บัญชีรับชำระ')}: <strong className="field-summary-value">{draft.accounts.find(row=>row.id===account)?.label}</strong></p><p className="field-summary">{t('Payment date','วันที่รับชำระ')}: <strong className="field-summary-value">{displayValue(paymentDate)}</strong>{paymentDate!==draft.businessDate&&<> ({t('slip','สลิป')}) · {t('business date','วันทำการ')} {displayValue(draft.businessDate)}</>}</p>{bankTransfer&&referenceText&&<p className="field-summary">{t('Bank reference','เลขอ้างอิงธนาคาร')}: <strong className="field-summary-value">{referenceText}</strong></p>}{payerLearns&&<p className="field-summary">{t('Payer added: ','เพิ่มผู้โอน: ')}<strong className="field-summary-value">{slipPayer}</strong></p>}<p className="field-summary">{t('Payment method','วิธีชำระเงิน')}: <strong className="field-summary-value">{paymentMethod==='Cash'?t('Cash','เงินสด'):t('Bank Transfer','โอนเงิน')}</strong></p>{notes&&<><p className="field-summary">{t('Notes','หมายเหตุ')}:</p><pre>{notes}</pre></>}{preview&&<img className="payment-receipt-preview" src={preview} alt={t('Selected receipt','หลักฐานที่เลือก')}/>}{queueEnabled&&!online&&<p className="field-help" role="status">{t('Offline: this payment will be saved on this device and sent when you reconnect. Receipt upload and notifications happen after it syncs.','ออฟไลน์: รายการรับชำระนี้จะบันทึกไว้ในอุปกรณ์และส่งเมื่อกลับมาเชื่อมต่อ การอัปโหลดหลักฐานและการแจ้งเตือนจะเกิดขึ้นหลังซิงค์')}</p>}{duplicateReference&&<p className="field-help" role="status">{t('This reference is already on a recorded payment.','เลขอ้างอิงนี้มีอยู่ในรายการรับชำระที่บันทึกแล้ว')}</p>}{accountMismatch&&<p className="field-help">{t('Slip shows a different account: ','สลิปแสดงบัญชีที่ต่างกัน: ')}{draft.accounts.find(row=>row.id===recognized!.slipAccountId)?.label}.</p>}{amountMismatch&&<p className="field-help">{t('Slip shows a different amount: ','สลิปแสดงยอดที่ต่างกัน: ')}{money(recognized!.slipAmount!)}.</p>}<div className="payment-review-actions"><button type="button" className="secondary-button" disabled={reviewing} onClick={()=>{reviewOperation.current++;setState('edit')}}>{t('Edit','แก้ไข')}</button><button type="button" className="secondary-button payment-confirm-button" disabled={reviewing||(!queueEnabled&&(access.offlineOnly||!online))} onClick={()=>void confirm()}>{/* PAY-REVIEW-01: icon + text like Review */}<Icon name="confirm"/><span>{queueEnabled?online?t('Confirm payment','ยืนยันรับชำระ'):t('Save for sync','บันทึกไว้รอซิงค์'):t('Confirm payment online','ยืนยันรับชำระขณะออนไลน์')}</span></button></div></>}

 {state==='queued'&&<><p role="status">{t('Saved on this device. Will sync when connected.','บันทึกในอุปกรณ์แล้ว จะซิงค์เมื่อเชื่อมต่อ')}</p>{access.openSaved&&<button type="button" className="secondary-button" onClick={access.openSaved}>{t('Open saved changes','เปิดรายการที่บันทึก')}</button>}</>}
 {state==='busy'&&<><p role="status">{t('Busy — not saved yet','ระบบกำลังยุ่ง — ยังไม่ได้บันทึก')}</p><p>{t('Nothing was applied. Retrying automatically.','ยังไม่มีการบันทึกรายการ กำลังลองใหม่อัตโนมัติ')}</p>{command.current&&<button type="button" className="secondary-button" disabled={reviewing||access.offlineOnly||!online} onClick={()=>void confirm()}>{t('Retry same command','ลองคำขอเดิมอีกครั้ง')}</button>}</>}
 {state==='unknown'&&<><h3>{t('Outcome unknown','ยังไม่ทราบผลการรับชำระ')}</h3><p>{t('A missing response does not mean the payment failed. Check the original request.','ไม่ได้รับคำตอบไม่ได้หมายความว่าการรับชำระล้มเหลว ตรวจสอบคำขอเดิม')}</p><button type="button" className="secondary-button" disabled={checking||access.offlineOnly||!online} onClick={()=>void check()}>{t('Check status','ตรวจสอบสถานะ')}</button>{command.current&&<button type="button" className="secondary-button" disabled={checking||access.offlineOnly||!checked||!online} onClick={()=>void confirm()}>{t('Retry same command','ลองคำขอเดิมอีกครั้ง')}</button>}</>}
 {state==='posted'&&<><h3>{t('Original payment recorded as Posted','บันทึกผลคำขอเดิมว่ารับชำระแล้ว')}</h3>{command.current&&<><p>{draft?.borrower.displayName}</p><p className="field-summary">{t('Amount received','ยอดรับชำระ')}: <strong className="field-summary-value">{money(command.current.amountReceived)}</strong></p><p>{draft?.accounts.find(row=>row.id===command.current?.cashAccountId)?.label}</p><span className="visually-hidden">{t('Notes','หมายเหตุ')}</span><pre>{command.current.notes}</pre></>}{verifiedPreview&&<img className="payment-receipt-preview" src={verifiedPreview} alt={t('Verified uploaded receipt','หลักฐานที่อัปโหลดและตรวจสอบแล้ว')}/>} {receiptReadError&&<p role="status">{receiptReadError}</p>}</>}{state==='rejected'&&<h3>{t('Payment could not be applied','ดำเนินการรับชำระไม่สำเร็จ')}</h3>}{state==='conflict'&&<h3>{t('Request identity conflict — do not resend changed details','คำขอขัดแย้ง — อย่าส่งรายละเอียดที่เปลี่ยนแล้วซ้ำ')}</h3>}
 {outcome&&<p>{displayValue(outcome.recordedAt)}</p>}{state==='posted'&&!access.offlineOnly&&<PaymentResult access={access} requestId={requestId.current} thai={thai} receipt={command.current?.receiptId?{receiptId:command.current.receiptId,file:localImage,descriptor:receiptDescriptor.current}:undefined}/>}{(storageBlocked||['sending','unknown','conflict'].includes(state))?<p>{t('Request reference','หมายเลขอ้างอิงคำขอ')}: <code>{requestId.current}</code> {copyReference}</p>:['queued','busy','posted','rejected'].includes(state)&&<details className="request-reference"><summary>{t('Request reference','หมายเลขอ้างอิงคำขอ')}</summary><code>{requestId.current}</code> {copyReference}</details>}{storageBlocked&&<p>{t('This browser cannot retain the reference. Copy it before leaving.','เบราว์เซอร์นี้เก็บหมายเลขอ้างอิงไม่ได้ กรุณาคัดลอกก่อนออก')}</p>}
 </section>;
}


