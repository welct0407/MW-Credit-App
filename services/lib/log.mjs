/**
 * One structured log line for Cloud Logging (ALL-STD-04): {severity, event, ...fields}.
 * Never pass secrets, tokens or borrower data in fields.
 * @param {'DEBUG'|'INFO'|'NOTICE'|'WARNING'|'ERROR'} severity
 * @param {string} event
 * @param {Record<string,unknown>} [fields]
 * @param {(line:string)=>void} [write]
 */
export function log(severity,event,fields={},write=line=>console.log(line)) {
  try{write(JSON.stringify({...fields,severity,event}));}catch{/* Logging never alters a response. */}
}
/** Completion records (they carry their own event) logged at WARNING from status 500 upwards. */
export const logRecord=(record,write)=>log(Number(record?.status)>=500?'WARNING':'INFO',record?.event??'record',record,write);
/** A request that fails closed (503) still names why: the error class, SQLSTATE and the first line of its message, at most
 * 200 characters (no stack, parameters, values or request data). A cancelled offline read (the client went away) is not logged. */
export const logUnavailable=(event,error,fields={},write)=>error?.message==='offline_read_cancelled'?undefined:log('ERROR',event,{...fields,error:String(error?.name??'Error').slice(0,40),
 sqlState:typeof error?.code==='string'?error.code.slice(0,10):null,message:String(error?.message??'').split('\n')[0].slice(0,200)},write);
