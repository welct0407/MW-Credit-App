'use strict';
(() => {
// Fragment parameters: key (bearer secret, memory only) and detail=<dashboard>:<tab>, the Borrower Detail target for name links.
// Both are removed from the address bar; neither is ever sent in a request URL. Without a valid detail, links open dashboard 3 tab 105.
const fragment = new URLSearchParams(location.hash.slice(1));
const secret = fragment.get('key') || '';
const [, detailDashboard, detailTab] = /^(\d{1,9}):(\d{1,9})$/.exec(fragment.get('detail') || '') || [null, '3', '105'];
history.replaceState(null, '', location.pathname);
const $ = id => document.getElementById(id), svg = $('matrix'), tooltip = $('tooltip');
const ns = 'http://www.w3.org/2000/svg';
// color: dots and category marks; text: names, titles and badge text (Question Mark darkened to keep 4.5:1 on its fill).
const specs = [
 {name:'Star', title:'STAR', color:'#287A51', text:'#287A51', fill:'#F0F7F2', col:0,row:0, sub:'Higher contribution · stronger health'},
 {name:'Question Mark', title:'QUESTION MARK', color:'#A57118', text:'#8C5E12', fill:'#FCF6E9', col:1,row:0, sub:'Higher contribution · lower health'},
 {name:'Cash Cow', title:'CASH COW', color:'#3672AD', text:'#3672AD', fill:'#EEF4FA', col:0,row:1, sub:'Lower contribution · stronger health'},
 {name:'Dog', title:'DOG', color:'#A65161', text:'#A65161', fill:'#FAF0F2', col:1,row:1, sub:'Lower contribution · lower health'}];
const icons = {
 Star:'M32 3L40 23L62 24L45 38L51 60L32 47L13 60L19 38L2 24L24 23Z',
 'Question Mark':'M32 4C15 4 3 15 3 29C3 43 15 54 32 54L48 61L46 50C55 46 61 38 61 29C61 15 49 4 32 4Z',
 'Cash Cow':'M19 16Q10 13 12 3Q19 5 22 12H42Q45 5 52 3Q54 13 45 16L59 15Q64 28 48 29L46 46Q44 59 32 59Q20 59 18 46L16 29Q0 28 5 15Z',
 Dog:'M29 30Q22 19 28 10Q32 3 41 5Q49 6 51 14L61 18Q63 25 51 28L44 29L43 51Q53 51 53 58H20Q7 58 4 48Q1 38 8 33Q7 46 17 47Q16 38 29 30Z'};
const compactQuery = matchMedia('(max-height: 480px)');
let rows = [], active = null, pinned = false, fetchedAt = null, requestBusy = false, generation = 0, redrawing = false;
const number = (v,d=1) => v == null ? '—' : Number(v).toLocaleString('en-US',{maximumFractionDigits:d});
// Dashboard 3 keeps its legacy filter slugs; the proposed dashboards use borrower and period.
const detailUrl = id => {
 const legacy = detailDashboard === '3';
 return `https://reports.mw-credit.com/dashboard/${detailDashboard}?tab=${detailTab}&${legacy?'bd_borrower':'borrower'}=${encodeURIComponent(id)}&${legacy?'bd_activity':'period'}=past30days`;
};
const spec = name => specs.find(s=>s.name===name);
function el(tag,attrs={},text){const node=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));if(text!=null)node.textContent=text;return node;}
function hide(){tooltip.hidden=true;tooltip.classList.remove('pinned');active=null;pinned=false;svg.querySelectorAll('.selected').forEach(n=>n.classList.remove('selected'));}
function show(row,node,pin=false){
 hide();active=row.borrower_id;pinned=pin;node.classList.add('selected');tooltip.classList.toggle('pinned',pin);tooltip.replaceChildren();
 const title=document.createElement('h2');title.textContent=row.name;tooltip.append(title);
 const s=spec(row.category), badge=document.createElement('span');badge.className='badge';badge.textContent=row.category;badge.style.color=s.text;badge.style.background=s.fill;tooltip.append(badge);
 const dl=document.createElement('dl');
 const fields=[['Payment score',number(row.payment_score)+' / 100'],['Contribution vs equal share',number(row.relative_contribution,2)+'×'],['Interest · last 30 days','฿ '+number(row.contribution_30d,0)],['Outstanding principal','฿ '+number(row.outstanding_principal,0)],['Payment schedule',row.arrangement_status],['History confidence',row.confidence],['Reporting date',row.reporting_date]];
 for(const [k,v] of fields){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v??'—';dl.append(dt,dd);}tooltip.append(dl);
 const basis=document.createElement('p');basis.className='basis';basis.textContent=row.position_basis+'. '+row.classification_reason;tooltip.append(basis);
 // Shown only while pinned (click, tap or Enter); a hover tooltip stays non-interactive.
 const open=document.createElement('a');open.className='open-detail';open.href=detailUrl(row.borrower_id);open.target='_blank';open.rel='noopener';open.textContent='Open Borrower Detail ↗';tooltip.append(open);
 tooltip.hidden=false;
 if(compactQuery.matches){tooltip.style.left='';tooltip.style.top='';return;}  // bottom sheet, fixed to the viewport by CSS
 const box=$('plot').getBoundingClientRect(), anchor=node.getBoundingClientRect(), tw=tooltip.offsetWidth,th=tooltip.offsetHeight;
 let left=anchor.right-box.left+12;if(left+tw>box.width)left=anchor.left-box.left-tw-12;
 tooltip.style.left=Math.max(0,Math.min(box.width-tw,left))+'px';tooltip.style.top=Math.max(0,Math.min(box.height-th,anchor.top-box.top-25))+'px';
}
function icon(name,x,y,size,fill,hole){
 const g=el('g',{class:'category-icon',transform:`translate(${x} ${y}) scale(${size/64})`,fill,'aria-hidden':'true'});
 g.append(el('path',{d:icons[name]}));
 if(name==='Cash Cow'){
  g.append(el('path',{d:'M21 20Q31 15 31 25Q30 32 23 31Z M40 19Q46 21 43 27L38 25Z',fill:hole}));
  g.append(el('ellipse',{cx:32,cy:46,rx:15,ry:10,fill:hole}));
  for(const cx of [24,40])g.append(el('circle',{cx,cy:33,r:2,fill:hole}));
  for(const cx of [26,38])g.append(el('ellipse',{cx,cy:46,rx:2,ry:3}));
 }
 if(name==='Dog'){
  g.append(el('path',{d:'M32 11Q25 17 29 29Q35 32 37 22L38 12Z',fill:hole}));
  g.append(el('circle',{cx:45,cy:14,r:1.8,fill:hole}));
  g.append(el('path',{d:'M37 34V53H43',fill:'none',stroke:hole,'stroke-width':2.5,'stroke-linecap':'round'}));
 }
 if(name==='Question Mark')g.append(el('text',{x:32,y:36,'text-anchor':'middle',class:'question-symbol',fill:hole},'?'));
 return g;
}
// Quadrant title (and subtitle lines) in the band outside the data area, at the quadrant's outer corner, icon on the outer side.
function caption(s,dataLeft,dataRight,baseline,lines,iconSize,titleSize){
 const left=s.col===0, anchorX=left?dataLeft:dataRight, gap=6;
 svg.append(icon(s.name,left?anchorX:anchorX-iconSize,baseline-titleSize*.85-(iconSize-titleSize)/2,iconSize,s.color,'#fff'));
 const tx=left?anchorX+iconSize+gap:anchorX-iconSize-gap, anchor=left?'start':'end';
 svg.append(el('text',{x:tx,y:baseline,class:'quadrant-title','text-anchor':anchor,fill:s.text},s.title));
 lines.forEach((line,i)=>svg.append(el('text',{x:left?dataLeft:dataRight,y:baseline+15+i*14,class:'quadrant-subtitle','text-anchor':anchor},line)));
}
function draw(){
 // Keep an open or pinned tooltip and keyboard focus across refreshes and resizes when the same borrower is still present.
 const focused=document.activeElement, keep={id:active,pinned,focusDot:focused?.closest?.('.borrower')?.dataset.borrower??null,focusLink:tooltip.contains(focused)};
 redrawing=true;svg.replaceChildren();tooltip.hidden=true;
 try{drawPlot(keep);}finally{redrawing=false;}
}
function drawPlot(keep){
 const w=$('plot').clientWidth,h=$('plot').clientHeight; if(w<20||h<20){hide();return;}
 svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
 const compact=compactQuery.matches, narrow=w<=600;
 // Bands outside the data area: quadrant captions above and below, axis titles at the bottom and left, threshold labels on the lines' ends.
 const subLines=s=>compact?[]:narrow?s.sub.split(' · '):[s.sub];
 const band=compact?18:narrow?50:38, axisRow=compact?0:18, L=compact?18:34, R=compact?2:8;
 const x0=L,y0=band,pw=w-L-R,ph=h-2*band-axisRow,qw=pw/2,qh=ph/2;
 if(pw<40||ph<40){hide();return;}
 const plotted=rows.filter(r=>r.plot_status==='Plotted'&&Number.isFinite(r.plot_x)&&Number.isFinite(r.plot_y));
 const match=$('search').value.trim().toLocaleLowerCase(), showNames=$('labels').checked;
 const titleSize=compact?11:narrow?12:13, iconSize=compact?12:narrow?16:18;
 for(const s of specs){
  svg.append(el('rect',{x:x0+s.col*qw,y:y0+s.row*qh,width:qw,height:qh,rx:7,fill:s.fill,class:'quadrant','data-quadrant':s.name}));
  const top=s.row===0, baseline=top?(compact?13:15):y0+ph+(compact?14:17);
  caption(s,x0,x0+pw,baseline,subLines(s),iconSize,titleSize);
 }
 svg.append(el('path',{d:`M${x0+qw} ${y0}V${y0+ph} M${x0} ${y0+qh}H${x0+pw}`,class:'boundary'}));
 // Threshold labels: payment score 80 under the vertical line, 1× equal share beside the horizontal line.
 svg.append(el('text',{x:x0+qw,y:y0+ph+(compact?14:17),class:'threshold-label','text-anchor':'middle'},'Score 80'));
 if(compact)svg.append(el('text',{x:L-3,y:y0+qh,class:'threshold-label','text-anchor':'end','dominant-baseline':'middle'},'1×'));
 else svg.append(el('text',{x:L-6,y:y0+qh,class:'threshold-label','text-anchor':'middle',transform:`rotate(-90 ${L-6} ${y0+qh})`},'1× equal share'));
 if(!compact){
  svg.append(el('text',{x:x0+pw/2,y:h-4,class:'axis-title','text-anchor':'middle'},narrow?'← Stronger payment health · weaker or modified →':'← Higher payment score = stronger health · lower score, or modified schedule placed by category →'));
  const mid=y0+ph/2;svg.append(el('text',{x:10,y:mid,class:'axis-title','text-anchor':'middle',transform:`rotate(-90 10 ${mid})`},'Contribution vs equal share →'));
 }
 // Keep each name next to its exact dot. Try above/below before a small local shift.
 const boxes=[],points=plotted.map(r=>({...r,px:x0+r.plot_x/100*pw,py:y0+(100-r.plot_y)/100*ph}));
 const font=narrow||compact?11:12;
 const intersects=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
 const legend=$('legend');legend.replaceChildren();
 for(const s of specs){const item=document.createElement('span');item.style.color=s.text;item.textContent=s.name+' · '+plotted.filter(r=>r.category===s.name).length;legend.append(item);}
 const edgeDistance=r=>{const row=spec(r.category).row;return Math.min(r.py-y0-row*qh,y0+(row+1)*qh-r.py);};
 const nodes=new Map();
 for(const r of points.slice().sort((a,b)=>(narrow?edgeDistance(a)-edgeDistance(b):0)||a.py-b.py||a.borrower_id.localeCompare(b.borrower_id))){
  const s=spec(r.category),g=el('g',{class:'borrower'+(match&&!r.name.toLocaleLowerCase().includes(match)?' dim':''),tabindex:0,role:'button','aria-label':r.name+', '+r.category,'data-borrower':r.borrower_id});
  if(showNames){
   const maxChars=narrow?13:24,name=r.name.length>maxChars?r.name.slice(0,maxChars-1)+'…':r.name;
   const width=name.length*font*.64+6,height=font+4;
   let best=null;
   for(const dy of [-17,17,-31,31,-45,45])for(const dx of [0,-16,16]){
    const cx=Math.max(x0+width/2+2,Math.min(x0+pw-width/2-2,r.px+dx)),cy=r.py+dy;
    const box={x:cx-width/2,y:cy-height/2,w:width,h:height};
    const clipped=box.y<y0+s.row*qh+2||box.y+height>y0+(s.row+1)*qh-2;
    const overlaps=boxes.filter(b=>intersects(box,b)).length;
    const hits=points.filter(p=>intersects(box,{x:p.px-7,y:p.py-7,w:14,h:14})).length;
    const score=(clipped?100000:0)+overlaps*10000+hits*1000+Math.abs(dy)+Math.abs(dx)*2;
    if(!best||score<best.score)best={...box,cx,cy,score};
   }
   boxes.push(best);
   const link=el('a',{href:detailUrl(r.borrower_id),target:'_blank',rel:'noopener','aria-label':'Open '+r.name+' in Borrower Detail'});
   link.append(el('text',{x:best.cx,y:best.cy,fill:s.text,class:'name','text-anchor':'middle'},name));
   link.addEventListener('click',e=>e.stopPropagation());link.addEventListener('keydown',e=>e.stopPropagation());g.append(link);
  }
  g.append(el('circle',{cx:r.px,cy:r.py,r:5.5,fill:s.color,class:'dot'}));
  // Hover and focus preview; click, tap or Enter pins the tooltip with its Borrower Detail link.
  g.addEventListener('mouseenter',()=>{if(!pinned)show(r,g);});
  g.addEventListener('mouseleave',()=>{if(!pinned&&document.activeElement!==g)hide();});
  g.addEventListener('focus',()=>{if(!redrawing&&!pinned)show(r,g);});
  g.addEventListener('blur',()=>{if(!redrawing&&!pinned)hide();});
  g.addEventListener('click',e=>{e.stopPropagation();show(r,g,true);});
  g.addEventListener('keydown',e=>{
   if(e.key==='Enter'||e.key===' '){e.preventDefault();show(r,g,true);tooltip.querySelector('.open-detail').focus({preventScroll:true});}
   if(e.key==='Escape'){hide();g.blur();}
  });
  svg.append(g);nodes.set(r.borrower_id,{row:r,g});
 }
 const excluded=rows.filter(r=>!plotted.some(p=>p.borrower_id===r.borrower_id));$('unplotted').hidden=!excluded.length;
 $('unplotted').querySelector('summary').textContent=`Not plotted (${excluded.length})`;
 const list=$('unplotted').querySelector('ul');list.replaceChildren();for(const r of excluded){const li=document.createElement('li'),link=document.createElement('a');link.href=detailUrl(r.borrower_id);link.target='_blank';link.rel='noopener';link.textContent=r.name;li.append(link,document.createTextNode(' — '+r.plot_status));list.append(li);}
 // Restore the open tooltip and focus for the same borrower; close them when the borrower has gone.
 const kept=keep.id&&nodes.get(keep.id);
 if(kept){show(kept.row,kept.g,keep.pinned);if(keep.focusLink&&keep.pinned)tooltip.querySelector('.open-detail').focus({preventScroll:true});}
 else{active=null;pinned=false;tooltip.classList.remove('pinned');}
 const refocus=keep.focusDot&&nodes.get(keep.focusDot);if(refocus)refocus.g.focus({preventScroll:true});
}
async function refresh(){
 if(requestBusy)return;requestBusy=true;$('refresh').disabled=true;const current=++generation;
 try{
  if(!secret)throw new Error('Access key missing. Open this chart from the authorized Metabase dashboard.');
  const response=await fetch('/api/matrix',{headers:{Authorization:'Bearer '+secret},cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error(response.status===401?'Access key expired or invalid. Reopen the dashboard after its key is updated.':'Live data is unavailable. Retrying automatically.');
  const data=await response.json();if(current!==generation)return;rows=data.rows;fetchedAt=new Date(data.fetched_at);$('error').hidden=true;
  $('status').textContent=`${rows.length} borrowers · updated ${fetchedAt.toLocaleTimeString('en-GB',{timeZone:'Asia/Bangkok'})} Bangkok · refresh 60s`;draw();
 }catch(error){rows=[];hide();svg.replaceChildren();$('unplotted').hidden=true;$('error').textContent=error.message;$('error').hidden=false;$('status').textContent=fetchedAt?'Last successful update '+fetchedAt.toLocaleTimeString('en-GB',{timeZone:'Asia/Bangkok'})+' Bangkok':'No data loaded';}
 finally{requestBusy=false;$('refresh').disabled=false;}
}
// Short frames (the Metabase phone card) start without names; the names toggle is hidden there.
const applyCompactDefaults=()=>{$('labels').checked=!compactQuery.matches;};
applyCompactDefaults();compactQuery.addEventListener('change',()=>{applyCompactDefaults();hide();draw();});
$('refresh').addEventListener('click',refresh);$('search').addEventListener('input',draw);$('labels').addEventListener('change',draw);
// Esc closes a pinned tooltip and returns focus to its dot (focusing while pinned does not reopen a preview).
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active){const dot=svg.querySelector(`[data-borrower="${CSS.escape(active)}"]`);if(pinned&&dot&&tooltip.contains(document.activeElement))dot.focus({preventScroll:true});hide();}});
// A click outside unpins; the Refresh button behaves like the automatic refresh and keeps it.
document.addEventListener('click',e=>{if(pinned&&!tooltip.contains(e.target)&&!e.target.closest?.('.borrower,#refresh'))hide();});
new ResizeObserver(draw).observe($('plot'));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});setInterval(()=>{if(!document.hidden)refresh();},60000);refresh();
})();
