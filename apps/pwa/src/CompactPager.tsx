import React from 'react';
export function CompactPager({previous,next,busy=false,previousLabel,nextLabel}:{previous?:()=>void;next?:()=>void;busy?:boolean;previousLabel:string;nextLabel:string}){
 if(!previous&&!next)return null;
 return <nav className="compact-pager" aria-label="Pagination">{previous&&<button className="secondary-button icon-action" disabled={busy} aria-label={previousLabel} title={previousLabel} onClick={previous}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m14 6-6 6 6 6"/></svg></button>}{next&&<button className="secondary-button icon-action" disabled={busy} aria-label={nextLabel} title={nextLabel} onClick={next}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m10 6 6 6-6 6"/></svg></button>}</nav>;
}
export function ReceiveIcon(){return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="15" cy="7" r="5"/><path d="M15 4v6m2-5h-3a1 1 0 0 0 0 2h2a1 1 0 0 1 0 2h-3M2 16h3l3-3h5a2 2 0 0 1 0 4h-3m3 0 6-3a2 2 0 0 1 2 3l-8 4H7l-2-2H2"/></svg>}

export function RefreshIcon(){return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/></svg>}
