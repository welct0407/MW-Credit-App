import {Icon} from './Icon';
/** UXR-PAY-02 (R185): with `page` (1-based) the pager also says which page is shown ("Page 2") and Next carries its caption;
 * how many come next is not known from a cursor, so no count is shown. Without `page` the pager is the arrows alone. */
export function CompactPager({previous,next,busy=false,previousLabel,nextLabel,page}:{previous?:()=>void;next?:()=>void;busy?:boolean;previousLabel:string;nextLabel:string;page?:number}){
 if(!previous&&!next)return null;
 const thai=document.documentElement.lang.startsWith('th');
 return <nav className={'compact-pager'+(page?' has-page':'')} aria-label={thai?'การแบ่งหน้า':'Pagination'}>{page&&<span className="compact-pager-page">{(thai?'หน้า ':'Page ')+page}</span>}{previous&&<button type="button" className="secondary-button icon-action" disabled={busy} aria-label={previousLabel} title={previousLabel} onClick={previous}><Icon name="previous"/></button>}{next&&<button type="button" className={'secondary-button icon-action'+(page?' compact-pager-next':'')} disabled={busy} aria-label={nextLabel} title={nextLabel} onClick={next}>{page&&<span aria-hidden="true">{thai?'ถัดไป':'Next'}</span>}<Icon name="next"/></button>}</nav>;
}
export function ReceiveIcon(){return <Icon name="receive"/>}

export function RefreshIcon(){return <Icon name="refresh"/>}
