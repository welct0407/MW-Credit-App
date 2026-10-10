import React from 'react';
function text(node:React.ReactNode):string{return React.Children.toArray(node).map(child=>typeof child==='string'||typeof child==='number'?String(child):React.isValidElement<{children?:React.ReactNode}>(child)?text(child.props.children):'').join(' ')}
/** One action presentation; callbacks, permissions and confirmation paths remain with the page. */
export function RecordAction({icon='↗',caption,children,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{icon?:string;caption?:string}){
 const label=props['aria-label']??text(children);const nodes=React.Children.toArray(children),svg=nodes.find(child=>React.isValidElement(child)&&child.type==='svg');
 return <button {...props} type={props.type??'button'} className={'record-action '+(props.className??'')} aria-label={label} title={props.title??label}><span className="record-action-icon" aria-hidden="true">{svg??icon}</span><span className="record-action-label">{caption??label}</span></button>;
}
