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
