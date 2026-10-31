import React,{useEffect,useRef,useState} from 'react';
import {Icon} from '../Icon';
import {useContextRefresh} from '../context-refresh';
import {useAppUpdateBlock} from '../app-update-safety';
import {useOnline} from '../online-status';
import {ChatThreads} from './ChatThreads';
import {ChatMessageView,ProvisionalMessage} from './ChatMessage';
import {ChatComposer} from './ChatComposer';
import {applyTurnEvent,initialTurn,listedDefault,mergeProposal,threadModel,type ChatMessage,type ChatProposal,type TurnState} from './chat-protocol';
import {ChatProposalCard,type ProposalRecord} from './ChatProposalCard';
import {ChatAccessError,ChatHttpError,createThread,getThread,listMessages,listModels,listThreads,streamTurn,turnPresence,updateThread,waitForOutcome,whenVisible,type ChatAccess,type ChatModels,type ChatThread,type Page} from './chat-client';
import {EXAMPLES,failureText,progressText,threadTitle,type FailureAction} from './chat-text';

// R090 chat screen (design §6.2): thread list (left pane on desktop, a sheet on phones), the conversation and the
// composer. One turn runs at a time; its SSE events drive the progress row and the provisional text, and a stream
// that drops before `done` waits for the outcome by polling (every 3 s, up to 5 minutes).
// R106: a reply that proposed a change shows its confirmation card (ChatProposalCard) under it; the card's newer
// local state (confirm, cancel, poll) overrides the row until the next load; sending a new message cancels pending
// cards locally as the service does. onOpenRecord, when the host passes it, opens the written record (only types
// canOpenRecord accepts get the link); the host keeps this workspace mounted behind it, so Back returns to the thread.
type Item=ChatMessage&{failure?:string;local?:boolean;retryOf?:string};
type Turn={threadId:string;messageId:string;phase:'sending'|'streaming'|'polling';state:TurnState};
const NEW='new';
export const defaultModel=(models:ChatModels|null)=>listedDefault(models);
const codeOf=(error:unknown)=>error instanceof ChatHttpError?error.code==='model_unavailable'?'MODEL_UNAVAILABLE':error.detail==='thread_full'?'thread_full':'unavailable':'unavailable';

/** R106 D12: an assistant reply's proposal lines (one card), each merged with this screen's newer local copy. */
function linesOf(item:ChatMessage,local:Record<string,ChatProposal>):ChatProposal[]{
 if(item.role!=='assistant'||!item.proposals?.length)return [];
 return item.proposals.map(row=>mergeProposal(row,local[row.id])??row);
}

export function ChatWorkspace({access,thai,onTitle,openRequest=null,onOpenRecord,canOpenRecord}:{access:ChatAccess;thai:boolean;onTitle?:(title:string)=>void;openRequest?:{threadId:string;nonce:number}|null;onOpenRecord?:(record:ProposalRecord)=>void;canOpenRecord?:(record:ProposalRecord)=>boolean}){
 const t=(en:string,th:string)=>thai?th:en,online=useOnline();
 const accessRef=useRef(access);accessRef.current=access;
 const [models,setModels]=useState<ChatModels|null>(null),[modelsError,setModelsError]=useState(false);
 const [threads,setThreads]=useState<ChatThread[]>([]),[threadsCursor,setThreadsCursor]=useState<string|null>(null),[threadsBusy,setThreadsBusy]=useState(false),[threadsError,setThreadsError]=useState(false),[archived,setArchived]=useState(false);
 const [thread,setThread]=useState<ChatThread|null>(null);
 const [,setTick]=useState(0);
 const [items,setItems]=useState<Item[]>([]),[itemsCursor,setItemsCursor]=useState<string|null>(null),[itemsBusy,setItemsBusy]=useState(false),[itemsError,setItemsError]=useState(false);
 const [drafts,setDrafts]=useState<Record<string,string>>({});
 const [turn,setTurn]=useState<Turn|null>(null);
 const [proposals,setProposals]=useState<Record<string,ChatProposal>>({});
 const [recordFailed,setRecordFailed]=useState<string|null>(null);
 const [newModel,setNewModel]=useState<string|null>(null),[modelNote,setModelNote]=useState(false),[notice,setNotice]=useState<string|null>(null),[sheet,setSheet]=useState(false),[announce,setAnnounce]=useState('');
 // Phones keep the header to "Chat"; the thread title moves into the Threads button (desktop shows it in the header).
 const [wide,setWide]=useState(()=>matchMedia('(min-width:1051px)').matches);
 useEffect(()=>{const query=matchMedia('(min-width:1051px)'),change=()=>setWide(query.matches);query.addEventListener('change',change);return()=>query.removeEventListener('change',change)},[]);
 const threadRef=useRef(thread);threadRef.current=thread;
 const archivedRef=useRef(archived);archivedRef.current=archived;
 const turnRef=useRef(turn);turnRef.current=turn;
 const thaiRef=useRef(thai);thaiRef.current=thai;
 const draftsRef=useRef(drafts);draftsRef.current=drafts;
 const itemsRef=useRef(items);itemsRef.current=items;
 const proposalsRef=useRef(proposals);proposalsRef.current=proposals;
 const threadsGen=useRef(0),itemsGen=useRef(0),picked=useRef(false),turnAbort=useRef<AbortController|null>(null);
 const listRef=useRef<HTMLElement|null>(null),endRef=useRef<HTMLDivElement|null>(null),composer=useRef<HTMLTextAreaElement|null>(null),picker=useRef<HTMLSelectElement|null>(null),sheetToggle=useRef<HTMLButtonElement|null>(null),sheetClose=useRef<HTMLButtonElement|null>(null);

 useAppUpdateBlock(!!turn);
 // biome-ignore lint/correctness/useExhaustiveDependencies: the header title follows the open thread and the language.
 useEffect(()=>{onTitle?.(wide?threadTitle(thread?.title,thai):'')},[thread?.title,thread?.id,thai,wide]);
 // biome-ignore lint/correctness/useExhaustiveDependencies: cleared once, when the screen closes.
 useEffect(()=>()=>{onTitle?.('')},[]);

 /** Keeps the newest message in view: the message pane scrolls on a desktop, the page scrolls on a phone. CWR-01: an
  * automatic (unforced) scroll never moves a pending confirmation card that is the last item. */
 function scrollToEnd(force=true){
  requestAnimationFrame(()=>{
   const last=itemsRef.current.at(-1);
   if(!force&&last?.role==='assistant'&&linesOf(last,proposalsRef.current).some(line=>line.state==='pending'))return;
   const list=listRef.current;if(!list)return;
   if(getComputedStyle(list).overflowY==='auto'&&list.scrollHeight>list.clientHeight){if(force||list.scrollHeight-list.scrollTop-list.clientHeight<160)list.scrollTop=list.scrollHeight;return}
   const page=document.scrollingElement??document.documentElement;
   // CW3-03: the page's own end, so the sticky composer sits below the last message instead of over it.
   if(force||page.scrollHeight-scrollY-innerHeight<200)page.scrollTo({top:page.scrollHeight});
  });
 }
 async function loadModels(){
  setModelsError(false);
  try{setModels(await listModels(accessRef.current,{onCached:setModels}))}catch(error){if(!(error instanceof ChatAccessError))setModelsError(true)}
 }
 async function loadThreads(showArchived:boolean,before:string|null=null){
  const gen=++threadsGen.current;setThreadsBusy(true);setThreadsError(false);
  const apply=(page:Page<ChatThread>)=>{
   if(gen!==threadsGen.current)return;
   setThreads(previous=>before?[...previous,...page.items.filter(item=>!previous.some(row=>row.id===item.id))]:page.items);setThreadsCursor(page.nextCursor);
   const open=threadRef.current;if(open){const fresh=page.items.find(item=>item.id===open.id);if(fresh)setThread(fresh)}
   // The most recent thread opens on arrival, unless the user already started typing a new chat.
   else if(!picked.current&&!before&&!showArchived&&page.items[0]&&!draftsRef.current[NEW]){picked.current=true;openThread(page.items[0])}
  };
  try{apply(await listThreads(accessRef.current,showArchived?'archived':'active',before,{onCached:apply}))}
  catch(error){if(gen===threadsGen.current&&!(error instanceof ChatAccessError))setThreadsError(true)}
  finally{if(gen===threadsGen.current)setThreadsBusy(false)}
 }
 async function loadMessages(target:ChatThread,before:string|null){
  const gen=++itemsGen.current;setItemsBusy(true);setItemsError(false);if(!before){setItems([]);setItemsCursor(null)}
  const apply=(page:Page<ChatMessage>)=>{if(gen!==itemsGen.current)return;setItems(previous=>before?[...page.items,...previous.filter(item=>!page.items.some(row=>row.id===item.id))]:page.items);setItemsCursor(page.nextCursor)};
  try{
   const page=await listMessages(accessRef.current,target.id,before,{onCached:value=>{apply(value);if(!before)scrollToEnd()}});
   apply(page);
   if(gen!==itemsGen.current||before)return;
   scrollToEnd();
   // A turn still in flight (another tab, or the app was closed mid-reply) resumes as an outcome poll.
   const last=page.items.at(-1);
   if(last?.role==='user'&&last.status==='pending'&&!turnRef.current)void follow(target,last.id,{...initialTurn(),accepted:true,startedAt:Date.now()});
  }catch(error){
   if(gen!==itemsGen.current||error instanceof ChatAccessError)return;
   if(error instanceof ChatHttpError&&error.status===404){setThread(null);setItems([]);void loadThreads(archivedRef.current);return}
   setItemsError(true);
  }finally{if(gen===itemsGen.current)setItemsBusy(false)}
 }
 function stopTurn(){turnAbort.current?.abort();turnAbort.current=null;setTurn(null)}
 function openThread(next:ChatThread){
  picked.current=true;
  if(turnRef.current&&turnRef.current.threadId!==next.id)stopTurn();
  setThread(next);closeSheet(false);setModelNote(false);setNotice(null);
  if(threadRef.current?.id!==next.id||!turnRef.current)void loadMessages(next,null);
 }
 function startNew(){
  picked.current=true;if(turnRef.current)stopTurn();
  itemsGen.current++;setThread(null);setItems([]);setItemsCursor(null);setItemsError(false);setItemsBusy(false);setModelNote(false);setNotice(null);closeSheet(false);
  requestAnimationFrame(()=>composer.current?.focus());
 }
 function closeSheet(returnFocus=true){setSheet(open=>{if(open&&returnFocus)requestAnimationFrame(()=>sheetToggle.current?.focus());return false})}
 // biome-ignore lint/correctness/useExhaustiveDependencies: closeSheet only sets state and moves focus.
 useEffect(()=>{if(!sheet)return;sheetClose.current?.focus();const onEscape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();closeSheet()}};document.addEventListener('keydown',onEscape);return()=>document.removeEventListener('keydown',onEscape)},[sheet]);
 // biome-ignore lint/correctness/useExhaustiveDependencies: first load only; later loads are explicit.
 useEffect(()=>{void loadModels();void loadThreads(false);return()=>{threadsGen.current++;itemsGen.current++;turnAbort.current?.abort()}},[]);
 // Batch 2 (B3): a chat-reply notification tap opens that thread at its newest messages.
 // biome-ignore lint/correctness/useExhaustiveDependencies: each request (nonce) opens once; state is read at that moment.
 useEffect(()=>{
  if(!openRequest||!/^[0-9a-f-]{36}$/.test(openRequest.threadId))return;
  picked.current=true;
  const known=threads.find(row=>row.id===openRequest.threadId)??(threadRef.current?.id===openRequest.threadId?threadRef.current:null);
  if(known){openThread(known);return}
  // Not on the loaded list page (older, or archived): open it now and load its own record (title, model, status),
  // so an archived thread is read-only and the picker shows its model.
  openThread({id:openRequest.threadId,title:'',model:'',status:'active'});
  void loadRecord(openRequest.threadId);
 },[openRequest?.nonce]);
 /** The record of a thread opened by id. 404 (gone, or not this Partner's): say so and show the thread list; a
  * network failure: say so with Try again. The composer stays disabled until the record arrives. */
 async function loadRecord(id:string){
  setRecordFailed(null);
  try{const record=await getThread(accessRef.current,id);if(threadRef.current?.id===id)setThread(record)}
  catch(error){
   if(error instanceof ChatAccessError)return;
   // The message load may have answered 404 first and cleared the thread; still explain it.
   if(error instanceof ChatHttpError&&error.status===404){if(threadRef.current&&threadRef.current.id!==id)return;startNew();setNotice(failureText('thread_gone',thaiRef.current));setSheet(true);return}
   if(threadRef.current?.id===id)setRecordFailed(id);
  }
 }
 useContextRefresh(true,t('Refresh chat','รีเฟรชแชท'),()=>{void loadModels();void loadThreads(archivedRef.current);const open=threadRef.current;if(open&&!turnRef.current)void loadMessages(open,null)},10);

 const finish=(messageId:string,user:ChatMessage|null,assistant:ChatMessage|null)=>{
  setItems(previous=>{const next=previous.map(item=>item.id===messageId?(user??{...item,status:'ok' as const,local:false}):item);return assistant&&!next.some(item=>item.id===assistant.id)?[...next,assistant]:next});
  turnAbort.current=null;setTurn(null);setAnnounce(thaiRef.current?'ได้รับคำตอบแล้ว':'Reply received.');scrollToEnd(false);
  // The first reply names the thread and moves it to the top.
  void loadThreads(archivedRef.current);
 };
 const fail=(messageId:string,code:string,local:boolean)=>{
  setItems(previous=>[...previous.map(item=>item.id===messageId?{...item,status:local?'failed' as const:'ok' as const}:item),{id:'failure:'+messageId,role:'assistant',text:'',status:'failed',failure:code,local,retryOf:messageId}]);
  turnAbort.current=null;setTurn(null);setAnnounce(failureText(code,thaiRef.current));scrollToEnd(false);
 };
 /** Waits for the stored outcome of a turn whose stream ended early (or that was already running). */
 async function follow(target:ChatThread,messageId:string,state:TurnState,controller=new AbortController()){
  turnAbort.current=controller;
  // Unchecked streamed text is not shown while waiting for the stored reply.
  setTurn({threadId:target.id,messageId,phase:'polling',state:{...state,provisional:'',checking:false}});
  try{
   // Batch 2 (B3): the poll starts only while the app is in the foreground (first read at once, then every 3 s);
   // a turn sent from this page also reports its return (turnPresence, batch 2c) at the same moment.
   await whenVisible(controller.signal);
   if(controller.signal.aborted)return;
   const outcome=await waitForOutcome(accessRef.current,target.id,messageId,controller.signal);
   if(controller.signal.aborted)return;
   if(outcome.state==='done')finish(messageId,outcome.user,outcome.assistant);
   else if(outcome.state==='gone')fail(messageId,state.accepted?'lost':'unavailable',!state.accepted);
   else fail(messageId,'lost',false);
  }catch(error){
   if(controller.signal.aborted)return;
   if(error instanceof ChatAccessError){turnAbort.current=null;setTurn(null);return}
   fail(messageId,'lost',false);
  }
 }
 async function send(text:string){
  if(turnRef.current||!online)return;
  setNotice(null);setModelNote(false);
  const messageId=crypto.randomUUID(),controller=new AbortController();turnAbort.current=controller;
  let target=threadRef.current;
  setTurn({threadId:target?.id??'',messageId,phase:'sending',state:initialTurn()});
  if(!target){
   const model=newModel??defaultModel(models);
   try{
    if(!model)throw new ChatHttpError(400,'model_unavailable');
    target=await createThread(accessRef.current,{id:crypto.randomUUID(),model});
   }catch(error){
    if(controller.signal.aborted)return;
    turnAbort.current=null;setTurn(null);if(!(error instanceof ChatAccessError))setNotice(failureText(codeOf(error),thai));return;
   }
   if(controller.signal.aborted)return;
   const created=target;picked.current=true;itemsGen.current++;
   setThread(created);setItems([]);setItemsCursor(null);
   if(!archivedRef.current)setThreads(previous=>[created,...previous.filter(row=>row.id!==created.id)]);
   setTurn({threadId:created.id,messageId,phase:'sending',state:initialTurn()});
  }
  const thread=target;
  // R108: a thread on a model no longer listed (a Gemini thread) runs this turn on the default; the claim applies it.
  const override=thread.model?threadModel(models,thread.model).override:null;
  // D7: a new message cancels the thread's pending proposals (the service records it when the turn begins).
  setProposals(previous=>{const next={...previous};for(const item of itemsRef.current)for(const p of linesOf(item,previous))if(p.state==='pending'&&p.threadId===thread.id)next[p.id]={...p,state:'cancelled'};return next});
  setDrafts(previous=>({...previous,[NEW]:'',[thread.id]:''}));
  setItems(previous=>[...previous,{id:messageId,role:'user',text,status:'pending',local:true}]);scrollToEnd();
  let state=initialTurn();
  const update=(name:string,data:unknown)=>{
   state=applyTurnEvent(state,name,data);if(controller.signal.aborted)return;
   setTurn(current=>current&&current.messageId===messageId?{...current,phase:'streaming',state}:current);
   if(name==='accepted'&&state.seq!==null){const seq=state.seq;setItems(previous=>previous.map(item=>item.id===messageId?{...item,seq}:item))}
   if(name==='accepted'&&override){setThread(current=>current?.id===thread.id?{...current,model:override}:current);setThreads(previous=>previous.map(row=>row.id===thread.id?{...row,model:override}:row))}
   if(name==='delta')scrollToEnd(false);
  };
  // Batch 2c: while this turn runs (stream, then the outcome poll), hiding the app marks it so the reply is pushed.
  const presence=turnPresence(accessRef.current,thread.id,messageId,controller.signal);
  try{
   try{
    const result=await streamTurn(accessRef.current,thread.id,{id:messageId,text,...(override?{model:override}:{})},update,{signal:controller.signal,presence});
    if(controller.signal.aborted)return;
    if(result.kind==='completed'){finish(messageId,result.user,result.assistant);return}
    if(state.message){finish(messageId,null,state.message);return}
    if(state.error){fail(messageId,state.error,false);return}
   }catch(error){
    if(controller.signal.aborted)return;
    if(error instanceof ChatAccessError){turnAbort.current=null;setTurn(null);return}
    if(error instanceof ChatHttpError){
     if(error.status===409){
      // Another device or tab is mid-turn in this thread: show it and wait for that reply instead.
      setItems(previous=>previous.filter(item=>item.id!==messageId));setDrafts(previous=>({...previous,[thread.id]:text}));
      turnAbort.current=null;setTurn(null);setNotice(failureText('turn_in_progress',thai));void loadMessages(thread,null);return;
     }
     fail(messageId,codeOf(error),true);return;
    }
   }
   await follow(thread,messageId,state,controller);
  }finally{presence.stop()}
 }
 function retry(failure:Item,index:number){
  const user=failure.retryOf?items.find(item=>item.id===failure.retryOf):items.slice(0,index).reverse().find(item=>item.role==='user');
  if(!user||turnRef.current)return;
  // A message the service never stored is replaced, not repeated.
  if(failure.local)setItems(previous=>previous.filter(item=>item.id!==failure.id&&item.id!==user.id));
  void send(user.text);
 }
 function act(failure:Item,index:number,action:FailureAction){
  if(action==='retry'){retry(failure,index);return}
  if(action==='new'){startNew();return}
  if(action==='model'){picker.current?.focus();return}
  const user=failure.retryOf?items.find(item=>item.id===failure.retryOf):items.slice(0,index).reverse().find(item=>item.role==='user');
  if(!user)return;
  if(failure.local)setItems(previous=>previous.filter(item=>item.id!==failure.id&&item.id!==user.id));
  setDrafts(previous=>({...previous,[threadRef.current?.id??NEW]:user.text}));requestAnimationFrame(()=>composer.current?.focus());
 }
 const replaceThread=(saved:ChatThread)=>{setThread(current=>current?.id===saved.id?saved:current);setThreads(previous=>previous.map(row=>row.id===saved.id?saved:row))};
 async function chooseModel(id:string){
  const open=threadRef.current;
  if(!open){setNewModel(id);return}
  const previous=open;replaceThread({...open,model:id});setModelNote(true);setNotice(null);
  try{replaceThread(await updateThread(accessRef.current,open.id,{model:id}))}
  catch(error){replaceThread(previous);setModelNote(false);if(!(error instanceof ChatAccessError))setNotice(failureText(codeOf(error),thai))}
 }
 async function rename(target:ChatThread,title:string){
  try{replaceThread(await updateThread(accessRef.current,target.id,{title}));return true}
  catch(error){if(!(error instanceof ChatAccessError))setNotice(failureText(codeOf(error),thai));return false}
 }
 async function changeStatus(target:ChatThread,status:'active'|'archived'){
  try{
   const saved=await updateThread(accessRef.current,target.id,{status});
   setThreads(previous=>previous.filter(row=>row.id!==saved.id));setThread(current=>current?.id===saved.id?saved:current);
   if(status==='archived'&&turnRef.current?.threadId===saved.id)stopTurn();
  }catch(error){if(!(error instanceof ChatAccessError))setNotice(failureText(codeOf(error),thai))}
 }
 function toggleArchived(){const next=!archivedRef.current;setArchived(next);setThreads([]);setThreadsCursor(null);void loadThreads(next)}

 const key=thread?.id??NEW,draft=drafts[key]??'';
 // A thread opened from a notification before the list arrived has no model yet (''): show the default meanwhile.
 // R108: a thread whose model is no longer listed (a Gemini thread) shows the default, which its next turn carries.
 const resolved=thread?.model?threadModel(models,thread.model):null;
 const currentModel=resolved?.model||newModel||defaultModel(models);
 const modelOptions=models?.models??[];
 // The answering model under each reply: its label, or the raw id for a model no longer listed.
 const modelLabel=(id:string)=>modelOptions.find(model=>model.id===id)?.label??id;
 const readOnly=thread?.status==='archived';
 const activeTurn=turn&&(turn.threadId===thread?.id||(!thread&&turn.threadId===''))?turn:null;
 const progress=!activeTurn?'':activeTurn.phase==='polling'?t('Waiting for the reply…','กำลังรอคำตอบ…'):activeTurn.state.checking?t('Checking the figures again…','กำลังตรวจตัวเลขอีกครั้ง…'):!activeTurn.state.accepted?t('Sending…','กำลังส่ง…'):null;
 // R103: the elapsed seconds read the clock on every render, so the row never shows a stale value (e.g. when it returns
 // after a tool-round retract); a one-second tick re-renders only while the status row shows (no text yet).
 const lookup=activeTurn&&!progress?progressText(activeTurn.state.round,activeTurn.state.tools,thai,activeTurn.state.startedAt===null?0:(Date.now()-activeTurn.state.startedAt)/1000):null;
 const ticking=!!lookup&&!activeTurn?.state.provisional;
 // CW3-03: a newly shown confirmation card that is the last item is scrolled fully into view once (its action row
 // would otherwise sit under the composer on a phone); later automatic scrolls leave it in place (CWR-01).
 const cardsShown=useRef(new Set<string>());
 // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the items change; scrollToEnd reads refs only.
 useEffect(()=>{
  const last=items.at(-1);if(!last)return;
  const lines=linesOf(last,proposalsRef.current);if(!lines.length||!lines.some(line=>line.state==='pending'))return;
  if(cardsShown.current.has(lines[0].id))return;cardsShown.current.add(lines[0].id);scrollToEnd(true);
 },[items]);
 useEffect(()=>{if(!ticking)return;const timer=setInterval(()=>setTick(tick=>tick+1),1000);return()=>clearInterval(timer)},[ticking]);
 const composerNote=!online?t('You are offline. Connect to send a message.','ขณะนี้ออฟไลน์ เชื่อมต่ออินเทอร์เน็ตเพื่อส่งข้อความ'):readOnly?t('This thread is archived. Unarchive it to continue.','แชทนี้เก็บถาวรแล้ว เลิกเก็บถาวรเพื่อคุยต่อ'):modelNote||resolved?.override?t('Applies to your next message','ใช้กับข้อความถัดไป'):null;
 const actionDisabled=(action:FailureAction)=>action==='retry'?!!turn||!online||readOnly:action==='edit'?!!turn||readOnly:action==='model'?!models||readOnly:false;
 const empty=!itemsBusy&&!itemsError&&items.length===0&&!activeTurn;
 return <section className="chat-workspace" data-sheet={sheet?'open':undefined} aria-label={t('Chat','แชท')}>
  <div id="chat-threads" className="chat-pane">
   <ChatThreads threads={threads} currentId={thread?.id??null} models={modelOptions} archived={archived} busy={threadsBusy} error={threadsError} hasMore={!!threadsCursor} thai={thai}
    onOpen={openThread} onNew={startNew} onToggleArchived={toggleArchived} onRename={rename} onStatus={(target,status)=>void changeStatus(target,status)}
    onMore={()=>void loadThreads(archived,threadsCursor)} onRetry={()=>void loadThreads(archived)} onClose={()=>closeSheet()} closeRef={sheetClose}/>
  </div>
  <div className="chat-conversation">
   <div className="chat-toolbar">
    <button ref={sheetToggle} type="button" className="secondary-button chat-threads-toggle" aria-label={t('Threads','รายการแชท')+': '+threadTitle(thread?.title,thai)} title={threadTitle(thread?.title,thai)} aria-expanded={sheet} aria-controls="chat-threads" onClick={()=>setSheet(open=>!open)}><Icon name="history"/><span className="chat-threads-current">{threadTitle(thread?.title,thai)}</span><Icon name="down" className="chat-threads-caret"/></button>
    <h2 className="chat-title">{thread?threadTitle(thread.title,thai):t('New chat','แชทใหม่')}</h2>
    <label className="chat-model"><span>{t('Model','โมเดล')}</span>
     <select ref={picker} value={currentModel??''} disabled={!models||readOnly} onChange={event=>void chooseModel(event.target.value)}>
      {!models&&<option value="">{modelsError?t('Unavailable','ใช้งานไม่ได้'):t('Loading…','กำลังโหลด…')}</option>}
      {models&&currentModel&&!modelOptions.some(model=>model.id===currentModel)&&<option value={currentModel} disabled>{currentModel} — {t('no longer available','ไม่มีแล้ว')}</option>}
      {modelOptions.map(model=><option key={model.id} value={model.id} disabled={!model.available}>{model.label}{model.available?'':' — '+(thai?'ใช้งานไม่ได้':model.reason??'unavailable')}</option>)}
     </select>
    </label>
    <button type="button" className="secondary-button chat-new chat-new-in-toolbar" onClick={startNew}><Icon name="add"/><span>{t('New chat','แชทใหม่')}</span></button>
   </div>
   {notice&&<p className="chat-notice" role="alert">{notice}</p>}
   {modelsError&&!models&&<p className="chat-notice" role="alert">{t('Models unavailable. Refresh to try again.','โหลดรายการโมเดลไม่ได้ รีเฟรชเพื่อลองอีกครั้ง')}</p>}
   <section ref={listRef} className="chat-messages" aria-label={t('Messages','ข้อความ')}>
    {itemsCursor&&<button type="button" className="secondary-button chat-earlier" disabled={itemsBusy} onClick={()=>{if(thread)void loadMessages(thread,itemsCursor)}}>{t('Load earlier messages','โหลดข้อความก่อนหน้า')}</button>}
    {itemsBusy&&!items.length&&<p className="chat-loading" role="status">{t('Loading…','กำลังโหลด…')}</p>}
    {recordFailed&&recordFailed===thread?.id&&<p className="chat-notice" role="alert">{failureText('thread_unavailable',thai)} <button type="button" className="text-action" onClick={()=>void loadRecord(recordFailed)}>{t('Try again','ลองอีกครั้ง')}</button></p>}
    {itemsError&&<p className="chat-notice" role="alert">{t('Messages unavailable.','โหลดข้อความไม่ได้')} <button type="button" className="text-action" onClick={()=>{if(thread)void loadMessages(thread,null)}}>{t('Try again','ลองอีกครั้ง')}</button></p>}
    {empty&&<div className="chat-welcome">
     <p>{t('Ask about loans, payments and cash. Answers come from the current records.','ถามเรื่องสินเชื่อ การรับชำระ และเงินสด คำตอบมาจากข้อมูลปัจจุบัน')}</p>
     {!readOnly&&<div className="chat-examples">{EXAMPLES.map(example=>{const text=thai?example[1]:example[0];return <button key={example[0]} type="button" className="secondary-button" onClick={()=>{setDrafts(previous=>({...previous,[key]:text}));requestAnimationFrame(()=>composer.current?.focus())}}>{text}</button>})}</div>}
    </div>}
    {items.map((item,index)=>{
     const next=items[index+1];
     // A turn the service gave up on (stale claim, no reply) shows as not received, with Retry.
     const orphan=item.role==='user'&&item.status==='failed'&&!item.local&&next?.role!=='assistant';
     const lines=linesOf(item,proposals);
     return <React.Fragment key={item.id}>
      <ChatMessageView item={item} thai={thai} modelLabel={modelLabel} actionDisabled={actionDisabled} onAction={item.role==='assistant'&&(item.status==='failed'||item.failure)?action=>act(item,index,action):undefined}/>
      {lines.length>0&&<ChatProposalCard lines={lines} access={access} thai={thai} online={online} onAskAgain={readOnly?undefined:()=>{const asked=items.find(row=>row.id===lines[0].messageId&&row.role==='user');if(!asked)return;setDrafts(previous=>({...previous,[key]:asked.text}));requestAnimationFrame(()=>composer.current?.focus())}} onOpenRecord={onOpenRecord} canOpenRecord={canOpenRecord} onChange={next=>setProposals(previous=>({...previous,...Object.fromEntries(next.map(line=>[line.id,line]))}))}/>}
      {orphan&&<ChatMessageView item={{id:'lost:'+item.id,role:'assistant',text:'',status:'failed',failure:'lost'}} thai={thai} actionDisabled={actionDisabled} onAction={action=>act({id:'lost:'+item.id,role:'assistant',text:'',status:'failed',retryOf:item.id},index,action)}/>}
     </React.Fragment>;
    })}
    {activeTurn&&<div className="chat-turn">
     {(!activeTurn.state.provisional||activeTurn.state.checking)&&<p className="chat-progress" role="status"><span className="collection-spinner" aria-hidden="true"/><span className="chat-progress-text">{progress||lookup?.text}</span>{lookup?.seconds&&<span className="chat-progress-seconds" aria-hidden="true">{lookup.seconds}</span>}</p>}
     {activeTurn.state.provisional&&<ProvisionalMessage text={activeTurn.state.provisional} thai={thai} model={(activeTurn.state.model??currentModel)?modelLabel(activeTurn.state.model??currentModel??''):null}/>}
    </div>}
    <div ref={endRef} className="chat-end"/>
   </section>
   <ChatComposer value={draft} thai={thai} inputRef={composer} note={composerNote} disabled={!!turn||!online||readOnly||(!thread&&!currentModel)||(!!thread&&!thread.model)}
    onChange={value=>setDrafts(previous=>({...previous,[key]:value}))} onSend={()=>void send(draft)}/>
   {readOnly&&thread&&<p className="chat-archived-actions"><button type="button" className="secondary-button" onClick={()=>void changeStatus(thread,'active')}>{t('Unarchive','เลิกเก็บถาวร')}</button></p>}
   <p className="visually-hidden" role="status" aria-live="polite">{announce}</p>
  </div>
 </section>;
}
