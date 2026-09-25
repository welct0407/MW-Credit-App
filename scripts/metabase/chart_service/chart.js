'use strict';
(() => {
const secret = new URLSearchParams(location.hash.slice(1)).get('key') || '';
history.replaceState(null, '', location.pathname);
const $ = id => document.getElementById(id), svg = $('matrix'), tooltip = $('tooltip');
const ns = 'http://www.w3.org/2000/svg';
const specs = [
 {name:'Star', title:'★ STAR', color:'#287A51', fill:'#F0F7F2', col:0,row:0,sub:'Higher contribution · stronger health'},
 {name:'Question Mark',title:'? QUESTION MARK',color:'#A57118',fill:'#FCF6E9',col:1,row:0,sub:'Higher contribution · lower health'},
 {name:'Cash Cow',title:'CASH COW',color:'#3672AD',fill:'#EEF4FA',col:0,row:1,sub:'Lower contribution · stronger health'},
 {name:'Dog',title:'DOG',color:'#A65161',fill:'#FAF0F2',col:1,row:1,sub:'Lower contribution · lower health'}];
let rows = [], active = null, fetchedAt = null, requestBusy = false, generation = 0;
const number = (v,d=1) => v == null ? '—' : Number(v).toLocaleString('en-US',{maximumFractionDigits:d});
function el(tag,attrs={},text){const node=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));if(text!=null)node.textContent=text;return node;}
function hide(){tooltip.hidden=true;active=null;svg.querySelectorAll('.selected').forEach(n=>n.classList.remove('selected'));}
function show(row,node){
 hide();active=row.borrower_id;node.classList.add('selected');tooltip.replaceChildren();
 const title=document.createElement('h2');title.textContent=row.name;tooltip.append(title);
 const spec=specs.find(s=>s.name===row.category), badge=document.createElement('span');badge.className='badge';badge.textContent=row.category;badge.style.color=spec.color;badge.style.background=spec.fill;tooltip.append(badge);
 const dl=document.createElement('dl');
 const fields=[['Payment score',number(row.payment_score)+' / 100'],['Contribution vs equal share',number(row.relative_contribution,2)+'×'],['Interest · last 30 days','฿ '+number(row.contribution_30d,2)],['Outstanding principal','฿ '+number(row.outstanding_principal,2)],['Payment schedule',row.arrangement_status],['History confidence',row.confidence],['Reporting date',row.reporting_date]];
 for(const [k,v] of fields){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v??'—';dl.append(dt,dd);}tooltip.append(dl);
 const basis=document.createElement('p');basis.className='basis';basis.textContent=row.position_basis+'. '+row.classification_reason;tooltip.append(basis);tooltip.hidden=false;
 const box=$('plot').getBoundingClientRect(), anchor=node.getBoundingClientRect(), tw=tooltip.offsetWidth,th=tooltip.offsetHeight;
 let left=anchor.right-box.left+12;if(left+tw>box.width)left=anchor.left-box.left-tw-12;
 tooltip.style.left=Math.max(0,Math.min(box.width-tw,left))+'px';tooltip.style.top=Math.max(0,Math.min(box.height-th,anchor.top-box.top-25))+'px';
}
function draw(){
 hide();svg.replaceChildren();const w=$('plot').clientWidth,h=$('plot').clientHeight; if(w<20)return;
 svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
 const margin=10, x0=margin,y0=4,pw=w-2*margin,ph=h-8,qw=pw/2,qh=ph/2;
 const plotted=rows.filter(r=>r.plot_status==='Plotted'&&Number.isFinite(r.plot_x)&&Number.isFinite(r.plot_y));
 const match=$('search').value.trim().toLocaleLowerCase(), showNames=$('labels').checked;
 for(const s of specs){
  const x=x0+s.col*qw,y=y0+s.row*qh, group=plotted.filter(r=>r.category===s.name);
  svg.append(el('rect',{x,y,width:qw,height:qh,rx:7,fill:s.fill,class:'quadrant','data-quadrant':s.name}));
  svg.append(el('text',{x:x+14,y:y+23,fill:s.color,class:'quadrant-title'},s.title+' · '+group.length));
  if(w>570)svg.append(el('text',{x:x+14,y:y+40,class:'quadrant-subtitle'},s.sub));
 }
 svg.append(el('path',{d:`M${x0+qw} ${y0}V${y0+ph} M${x0} ${y0+qh}H${x0+pw}`,class:'boundary'}));
 // Pack text independently in each quadrant. Dots keep exact SQL coordinates.
 // Sorted label rails guarantee a readable list even when borrower dots coincide.
 for(const s of specs){
  const x=x0+s.col*qw,y=y0+s.row*qh;
  const group=plotted.filter(r=>r.category===s.name).map(r=>({...r,px:x0+r.plot_x/100*pw,py:y0+(100-r.plot_y)/100*ph})).sort((a,b)=>a.py-b.py||a.borrower_id.localeCompare(b.borrower_id));
  const font=w<=600?10:12, labelHeight=font+10, top=y+(w>570?62:46),bottom=y+qh-15;
  const available=bottom-top, spacing=Math.min(labelHeight+7,available/Math.max(1,group.length-1));
  const positions=group.map((r,i)=>Math.max(top+i*spacing,Math.min(bottom-(group.length-1-i)*spacing,r.py)));
  for(let i=1;i<positions.length;i++)positions[i]=Math.max(positions[i],positions[i-1]+spacing);
  group.forEach((r,i)=>{
   const g=el('g',{class:'borrower'+(match&&!r.name.toLocaleLowerCase().includes(match)?' dim':''),tabindex:0,role:'button','aria-label':r.name+', '+r.category,'data-borrower':r.borrower_id});
   const maxText=Math.max(45,qw*.46), fullWidth=r.name.length*font*.62+18, width=Math.min(maxText,fullWidth),lx=r.px<=x+qw/2?x+qw-width-12:x+12,ly=positions[i];
   if(showNames){
    g.append(el('path',{d:`M${r.px} ${r.py}L${r.px<lx?lx-5:lx+width+5} ${ly}`,stroke:s.color,class:'leader'}));
    g.append(el('rect',{x:lx,y:ly-labelHeight/2,width,height:labelHeight,rx:5,stroke:s.color,class:'label-bg'}));
    const maxChars=Math.max(4,Math.floor((width-14)/(font*.62))),name=r.name.length>maxChars?r.name.slice(0,maxChars-1)+'…':r.name;
    g.append(el('text',{x:lx+8,y:ly,fill:s.color,class:'name'},name));
   }
   g.append(el('circle',{cx:r.px,cy:r.py,r:5.5,fill:s.color,class:'dot'}));
   g.addEventListener('mouseenter',()=>show(r,g));g.addEventListener('mouseleave',()=>{if(document.activeElement!==g)hide();});
   g.addEventListener('focus',()=>show(r,g));g.addEventListener('blur',hide);
   g.addEventListener('click',()=>show(r,g));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show(r,g);}if(e.key==='Escape'){hide();g.blur();}});
   svg.append(g);
  });
 }
 const excluded=rows.filter(r=>!plotted.some(p=>p.borrower_id===r.borrower_id));$('unplotted').hidden=!excluded.length;
 $('unplotted').querySelector('summary').textContent=`Not plotted (${excluded.length})`;
 const list=$('unplotted').querySelector('ul');list.replaceChildren();for(const r of excluded){const li=document.createElement('li');li.textContent=r.name+' — '+r.plot_status;list.append(li);}
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
$('refresh').addEventListener('click',refresh);$('search').addEventListener('input',draw);$('labels').addEventListener('change',draw);
document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});new ResizeObserver(draw).observe($('plot'));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});setInterval(()=>{if(!document.hidden)refresh();},60000);refresh();
})();
