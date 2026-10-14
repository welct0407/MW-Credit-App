import React from 'react';
import {Icon,type IconName} from './Icon';
function text(node:React.ReactNode):string{return React.Children.toArray(node).map(child=>typeof child==='string'||typeof child==='number'?String(child):React.isValidElement<{children?:React.ReactNode;'aria-hidden'?:boolean|string}>(child)&&!child.props['aria-hidden']?text(child.props.children):'').join(' ')}
/** One action presentation; callbacks, permissions and confirmation paths remain with the page. */
export function RecordAction({icon,caption,children,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{icon:IconName;caption?:string}){
 const label=props['aria-label']??text(children);
 return <button {...props} type={props.type??'button'} className={'record-action '+(props.className??'')} aria-label={label} title={props.title??label}><span className="record-action-icon" aria-hidden="true"><Icon name={icon}/></span><span className="record-action-label">{caption??label}</span></button>;
}
