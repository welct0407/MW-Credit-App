import type React from 'react';
import {Icon} from './Icon';
import type {ReceiptTone} from './recognition-timing';
/** R186 (owner): the one receipt status line of Receive payment and Close loan (R142-UX-05) as a toned box with a leading
 * icon. It stays one always-rendered role="status" element whose text changes, never moves focus, and reads as nothing
 * (no box, no icon) while it is empty. */
export function ReceiptStatus({tone,className,children}:{tone:ReceiptTone|null;className?:string;children?:React.ReactNode}){
 return <p className={'receipt-status'+(className?' '+className:'')} data-tone={tone??undefined} role="status">{tone&&<span className="receipt-status-icon" aria-hidden="true">{tone==='info'?<span className="collection-spinner"/>:<Icon name={tone==='success'?'confirm':tone==='warning'?'warning':'waiting'}/>}</span>}{children}</p>;
}
