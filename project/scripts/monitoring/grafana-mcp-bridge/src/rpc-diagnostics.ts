// Diagnostic projection only: never log envelopes, IDs, values or exception text.
const METHODS = new Set(['initialize','notifications/initialized','ping','server/discover','tools/list','tools/call','events/list','events/subscribe','events/unsubscribe','subscriptions/listen']);
const MAX_OBSERVED_BYTES = 65536;
const object = (value:unknown):Record<string,unknown>|undefined => value!==null && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : undefined;

export function recordRpcResult(claimedMethod:unknown, envelope:unknown):boolean {
  const message=object(envelope);
  if(message?.jsonrpc!=='2.0')return false;
  const hasError=Object.hasOwn(message,'error'),hasResult=Object.hasOwn(message,'result');
  if(!hasError && !hasResult)return false;
  const method=typeof claimedMethod==='string' && METHODS.has(claimedMethod) ? claimedMethod : 'unknown';
  const result=object(message.result),error=object(message.error);
  const fields:Record<string,string|number|boolean>={event:'mcp_rpc_result',method,success:!hasError && result?.isError!==true};
  if(hasError && Number.isSafeInteger(error?.code))fields.error_code=error!.code as number;
  if(!hasError && method==='tools/list' && Array.isArray(result?.tools))fields.tool_count=result.tools.length;
  if(!hasError && method==='events/list' && Array.isArray(result?.events))fields.event_count=result.events.length;
  try {process.stdout.write(JSON.stringify(fields)+'\n');} catch { /* Logging cannot alter the exchange. */ }
  return true;
}

/** Observe bounded JSON/SSE output while forwarding each original byte unchanged.
 * The strict SDK validates modern Mcp-Method/envelope agreement; the label is
 * still allowlisted independently, including for malformed/unknown requests.
 * Skip malformed or oversized observations rather than expanding diagnostics.
 */
export function observeRpcResponse(claimedMethod:unknown,response:Response):Response {
  const mediaType=response.headers.get('content-type')?.split(';')[0]?.trim();
  if(!response.body || (mediaType!=='application/json' && mediaType!=='text/event-stream'))return response;
  const decoder=new TextDecoder();let buffer='',size=0,done=false;
  const inspect=(text:string)=>{
    try {if(recordRpcResult(claimedMethod,JSON.parse(text))){done=true;buffer='';}} catch { /* Never log parse failures or content. */ }
  };
  const observe=(chunk:Uint8Array)=>{
    if(done)return;
    size+=chunk.byteLength;
    if(size>MAX_OBSERVED_BYTES){done=true;buffer='';return;}
    buffer+=decoder.decode(chunk,{stream:true});
    if(mediaType==='text/event-stream') {
      // SDK SSE data is JSON. Account for CRLF and multi-line data frames.
      const frames=buffer.split(/\r?\n\r?\n/);buffer=frames.pop()!;
      for(const frame of frames) {
        const data=frame.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).replace(/^ /,'')).join('\n');
        if(data)inspect(data);
        if(done)break;
      }
    }
  };
  const stream=response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
    transform(chunk,controller) {
      try {observe(chunk);} catch {done=true;buffer='';}
      controller.enqueue(chunk);
    },
    flush() {
      if(!done && mediaType==='application/json')inspect(buffer+decoder.decode());
      buffer='';
    },
  }));
  return new Response(stream,{status:response.status,statusText:response.statusText,headers:response.headers});
}
