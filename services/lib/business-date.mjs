/** The business calendar is Bangkok time (ALL-STD-01); one definition for services. */
export const BUSINESS_TZ='Asia/Bangkok';
/** SQL expression for the current business day (a PostgreSQL date). */
export const BUSINESS_DAY_SQL=`(CURRENT_TIMESTAMP AT TIME ZONE '${BUSINESS_TZ}')::date`;
/** One-row query returning the current business day as text in column "day". */
export const BUSINESS_TODAY_QUERY=`SELECT ${BUSINESS_DAY_SQL}::text AS day`;
const parts=(instant,options)=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:BUSINESS_TZ,...options}).formatToParts(instant).map(part=>[part.type,part.value]));
/** Business date (YYYY-MM-DD) of an instant. */
export function businessToday(now=new Date()) {
  const p=parts(now,{year:'numeric',month:'2-digit',day:'2-digit'});
  return `${p.year}-${p.month}-${p.day}`;
}
/** Business local date and time (YYYY-MM-DD HH:MM:SS) of an instant. */
export function businessDateTime(now=new Date()) {
  const p=parts(now,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}
