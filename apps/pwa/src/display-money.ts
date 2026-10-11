export const wholeBaht=(value:unknown)=>value==null?'—':'฿'+new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(Number(value));
export const sharePercent=(value:unknown)=>value==null?'—':new Intl.NumberFormat('en-US',{style:'percent',maximumFractionDigits:2}).format(Number(value));
