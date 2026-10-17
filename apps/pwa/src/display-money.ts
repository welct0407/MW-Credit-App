const whole=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
/** One app-wide money form: sign before the symbol, whole baht ("-฿1,200"); a value that rounds to zero reads "฿0". */
export const wholeBaht=(value:unknown)=>{if(value==null)return '—';const n=Number(value),text='฿'+whole.format(Math.abs(n));return n<0&&text!=='฿0'?'-'+text:text};
export const sharePercent=(value:unknown)=>value==null?'—':new Intl.NumberFormat('en-US',{style:'percent',maximumFractionDigits:2}).format(Number(value));
