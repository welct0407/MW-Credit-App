import React from 'react';
import {Icon} from '../Icon';
import {parseMarkdown,type Block,type Inline} from './markdown';
import {failureText,failureAction,failureActionLabel,metaLine,sourcesText,type FailureAction} from './chat-text';
import type {ChatMessage} from './chat-protocol';

// R090 one chat message (design §6.2). Assistant text goes through markdown.ts and is rendered as React elements;
// nothing here sets HTML from model text.
// The parsed tree is rebuilt from the same text on every render and has no identity of its own: keys are positional.
function inlines(items:Inline[]){
 return items.map(/* biome-ignore lint/suspicious/noArrayIndexKey: positional nodes of a tree parsed from immutable text */(item,index)=>item.kind==='strong'?<strong key={index}>{item.text}</strong>:item.kind==='break'?<br key={index}/>:<React.Fragment key={index}>{item.text}</React.Fragment>);
}
function cells(row:Inline[][],header:boolean){
 return row.map(/* biome-ignore lint/suspicious/noArrayIndexKey: table cells are positional */(cell,index)=>header?<th key={index} scope="col">{inlines(cell)}</th>:<td key={index}>{inlines(cell)}</td>);
}
function block(item:Block){
 if(item.kind==='paragraph')return <p>{inlines(item.inlines)}</p>;
 if(item.kind==='list')return <ul>{item.items.map(/* biome-ignore lint/suspicious/noArrayIndexKey: list items are positional */(entry,index)=><li key={index}>{inlines(entry)}</li>)}</ul>;
 return <div className="chat-table-scroll"><table>{item.head&&<thead><tr>{cells(item.head,true)}</tr></thead>}<tbody>{item.rows.map((row,index)=><tr key={index}>{cells(row,false)}</tr>)}</tbody></table></div>;
}
export function MarkdownBlocks({blocks}:{blocks:Block[]}){
 return <>{blocks.map(/* biome-ignore lint/suspicious/noArrayIndexKey: blocks are positional */(item,index)=><React.Fragment key={index}>{block(item)}</React.Fragment>)}</>;
}
/** A failed reply offers one action (failureAction): Retry, Edit question, Choose model or New chat. */
/** modelLabel: the model list's label for an id (the raw id for a retired model); the reply names the model that answered. */
export function ChatMessageView({item,thai,onAction,actionDisabled,modelLabel=id=>id}:{item:ChatMessage&{failure?:string};thai:boolean;onAction?:(action:FailureAction)=>void;actionDisabled?:(action:FailureAction)=>boolean;modelLabel?:(id:string)=>string}){
 const t=(en:string,th:string)=>thai?th:en;
 if(item.role==='user')return <article className="chat-message chat-user" aria-label={t('You','คุณ')} data-status={item.status}><p>{item.text}</p></article>;
 if(item.status==='failed'||item.failure)return <article className="chat-message chat-assistant chat-failed" aria-label={t('Assistant','ผู้ช่วย')}>
  <p className="chat-failure-reason"><Icon name="warning" className="chat-failed-icon"/>{failureText(item.failure??item.errorCode,thai)}</p>
  {item.model&&<p className="chat-sources chat-model-line">{modelLabel(item.model)}</p>}
  {onAction&&(()=>{const action=failureAction(item.failure??item.errorCode);return <button type="button" className="secondary-button chat-retry" data-action={action} disabled={actionDisabled?.(action)} onClick={()=>onAction(action)}>{failureActionLabel(action,thai)}</button>})()}
 </article>;
 const meta=metaLine(sourcesText(item.tools,thai),item.model?modelLabel(item.model):null);
 return <article className="chat-message chat-assistant" aria-label={t('Assistant','ผู้ช่วย')}>
  <MarkdownBlocks blocks={parseMarkdown(item.text)}/>
  {meta&&<p className="chat-sources">{meta}</p>}
 </article>;
}
/** Streamed text of the current round: provisional until the reply is checked and committed. */
export function ProvisionalMessage({text,thai,model}:{text:string;thai:boolean;model?:string|null}){
 return <article className="chat-message chat-assistant chat-provisional" aria-busy="true" aria-label={thai?'ผู้ช่วย (กำลังตรวจตัวเลข)':'Assistant (checking figures)'}>
  <MarkdownBlocks blocks={parseMarkdown(text)}/>
  <p className="chat-provisional-label">{metaLine(thai?'กำลังตรวจตัวเลข':'checking figures',model)}</p>
 </article>;
}
