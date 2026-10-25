import {Icon} from './Icon';
export function CompactPager({previous,next,busy=false,previousLabel,nextLabel}:{previous?:()=>void;next?:()=>void;busy?:boolean;previousLabel:string;nextLabel:string}){
 if(!previous&&!next)return null;
 return <nav className="compact-pager" aria-label={document.documentElement.lang.startsWith('th')?'การแบ่งหน้า':'Pagination'}>{previous&&<button type="button" className="secondary-button icon-action" disabled={busy} aria-label={previousLabel} title={previousLabel} onClick={previous}><Icon name="previous"/></button>}{next&&<button type="button" className="secondary-button icon-action" disabled={busy} aria-label={nextLabel} title={nextLabel} onClick={next}><Icon name="next"/></button>}</nav>;
}
export function ReceiveIcon(){return <Icon name="receive"/>}

export function RefreshIcon(){return <Icon name="refresh"/>}
