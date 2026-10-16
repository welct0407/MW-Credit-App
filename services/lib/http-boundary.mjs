import {randomUUID} from 'node:crypto';
/**
 * Shared browser HTTP boundary (APP-AUTH-03): request id, JSON/no-store/nosniff headers,
 * exact Origin allowlist with CORS echo, validated preflight and one completion log.
 * The caller decides the response; this only prepares and inspects the request.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * record({requestId,status}) builds the completion record when the response finishes (it keeps each handler's field order).
 * @param {{origins:readonly string[],methods:readonly string[],headers:readonly string[],logger?:(record:object)=>void,record?:(base:{requestId:string,status:number})=>object,contentType?:string}} options
 */
export function beginRequest(req,res,{origins,methods,headers,logger=()=>{},record=base=>base,contentType='application/json; charset=utf-8'}) {
  const requestId=randomUUID(),started=performance.now();
  res.once?.('finish',()=>{try{logger(record({requestId,status:res.statusCode}));}catch{/* Telemetry must never alter the response. */}});
  res.setHeader('X-Request-ID',requestId);
  res.setHeader('Content-Type',contentType);
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Vary','Origin');
  const origin=req.headers.origin,allowed=typeof origin==='string'&&origins.includes(origin);
  if(allowed){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Expose-Headers','X-Request-ID');}
  const allowedHeaders=headers.map(value=>value.toLowerCase());
  return {
    requestId,origin,allowed,
    /** An Origin header that is present but not exactly allowlisted. */
    originDenied:origin!==undefined&&!allowed,
    durationMs:()=>Math.max(0,Math.round(performance.now()-started)),
    /** True (and Allow-* headers set) only for an allowlisted Origin asking for a listed method and headers. */
    preflight(){
      const method=req.headers['access-control-request-method'];
      if(!allowed||typeof method!=='string'||!methods.includes(method)||String(req.headers['access-control-request-headers']??'').split(',').some(value=>value.trim()&&!allowedHeaders.includes(value.trim().toLowerCase())))return false;
      res.setHeader('Access-Control-Allow-Methods',methods.join(', '));res.setHeader('Access-Control-Allow-Headers',headers.join(', '));
      return true;
    },
  };
}
