import test from 'node:test';
import assert from 'node:assert/strict';
import {recordRpcResult,observeRpcResponse} from '../dist/rpc-diagnostics.js';
import {application,authorize,tokenExchange,mcpRequest,subscription} from './helpers.mjs';

function capture(t) {
  const rows=[],write=process.stdout.write.bind(process.stdout);
  t.mock.method(process.stdout,'write',(chunk,...args)=>{
    if(typeof chunk==='string' && chunk.startsWith('{"event":')){rows.push(JSON.parse(chunk));return true;}
    return write(chunk,...args);
  });
  return rows;
}
test('RPC projection permits only fixed method labels, outcome, numeric code and relevant counts',t=>{
  const rows=capture(t),sensitive='sentinel-private-token-user-url';
  recordRpcResult(sensitive,{jsonrpc:'2.0',id:sensitive,error:{code:-32601,message:sensitive,data:{token:sensitive}},headers:sensitive});
  recordRpcResult('tools/list',{jsonrpc:'2.0',id:sensitive,result:{tools:[{name:sensitive,inputSchema:{secret:sensitive}},{}],events:[sensitive],_meta:{client:sensitive}}});
  recordRpcResult('events/list',{jsonrpc:'2.0',result:{events:[{url:sensitive}],tools:[sensitive]}});
  recordRpcResult('tools/call',{jsonrpc:'2.0',result:{isError:true,content:[{text:sensitive}]}});
  recordRpcResult('events/subscribe',{jsonrpc:'2.0',error:{code:sensitive,message:sensitive}});
  assert.equal(recordRpcResult('ping',{jsonrpc:'2.0',method:sensitive,params:{token:sensitive}}),false);
  assert.deepEqual(rows,[
    {event:'mcp_rpc_result',method:'unknown',success:false,error_code:-32601},
    {event:'mcp_rpc_result',method:'tools/list',success:true,tool_count:2},
    {event:'mcp_rpc_result',method:'events/list',success:true,event_count:1},
    {event:'mcp_rpc_result',method:'tools/call',success:false},
    {event:'mcp_rpc_result',method:'events/subscribe',success:false},
  ]);
  assert.equal(JSON.stringify(rows).includes(sensitive),false);
});
test('JSON and chunked SSE observation preserves status, headers and exact UTF-8 response bytes',async t=>{
  const rows=capture(t),secret='sentinel-response-secret-ภาษาไทย';
  const raw=JSON.stringify({jsonrpc:'2.0',id:secret,result:{tools:[{name:secret}]}});
  const response=observeRpcResponse('tools/list',new Response(raw,{status:200,headers:{'content-type':'application/json','x-synthetic':'unchanged'}}));
  assert.equal(response.status,200);assert.equal(response.headers.get('x-synthetic'),'unchanged');assert.equal(await response.text(),raw);
  const sse='event: message\r\ndata: '+JSON.stringify({jsonrpc:'2.0',method:'notifications/progress',params:{token:secret}})+'\r\n\r\n'+
    'event: message\r\ndata: '+JSON.stringify({jsonrpc:'2.0',id:secret,error:{code:-32015,message:secret,data:{callback:secret}}})+'\r\n\r\n';
  const bytes=new TextEncoder().encode(sse);
  const stream=new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=7)controller.enqueue(bytes.slice(i,i+7));controller.close();}});
  const observed=observeRpcResponse('events/subscribe',new Response(stream,{headers:{'content-type':'text/event-stream; charset=utf-8'}}));
  assert.deepEqual(new Uint8Array(await observed.arrayBuffer()),bytes);
  assert.deepEqual(rows,[{event:'mcp_rpc_result',method:'tools/list',success:true,tool_count:1},{event:'mcp_rpc_result',method:'events/subscribe',success:false,error_code:-32015}]);
  assert.equal(JSON.stringify(rows).includes(secret),false);
});
test('malformed, oversized and non-RPC observations are skipped without modifying output; logger failures are contained',async t=>{
  const rows=capture(t);
  for(const raw of ['not-json',JSON.stringify({jsonrpc:'2.0',result:{content:'x'.repeat(65536)}}),JSON.stringify({token:'sentinel-secret'})]) {
    assert.equal(await observeRpcResponse('tools/call',new Response(raw,{headers:{'content-type':'application/json'}})).text(),raw);
  }
  assert.deepEqual(rows,[]);
  t.mock.method(process.stdout,'write',()=>{throw new Error('sentinel-logger-failure');});
  assert.doesNotThrow(()=>recordRpcResult('ping',{jsonrpc:'2.0',result:{}}));
});
test('authenticated application logs discovery counts and denied subscription RPC error, preserving auth and callback containment',async t=>{
  const rows=capture(t);let sends=0;
  const app=await application({config:{callbackHosts:[]},send:async()=>{sends++;throw new Error('sentinel-outbound-must-not-run');}});t.after(()=>app.close());
  assert.equal((await mcpRequest(app,'tools/list',{},'sentinel-invalid-token')).status,401);
  assert.equal(rows.some(row=>row.event==='mcp_rpc_result'),false);
  const grant=await authorize(app),token=(await tokenExchange(app,grant.code,grant.verifier)).json().access_token;
  for(const method of ['server/discover','tools/list','events/list']) {
    const response=await mcpRequest(app,method,{},token);assert.equal(response.status,200);assert.ok(response.json().result);
  }
  const denied=await mcpRequest(app,'events/subscribe',subscription('whsec_c2VudGluZWwtc2VjcmV0LW9ubHktMzJjaGFyYWN0ZXJz'),token);
  assert.equal(denied.status,200);assert.equal(denied.json().error.code,-32015);assert.equal(sends,0);
  const unknown=await mcpRequest(app,'sentinel-unknown-method',{secret:'sentinel-argument'},token);
  assert.ok(unknown.json().error);
  const rpc=rows.filter(row=>row.event==='mcp_rpc_result');
  assert.deepEqual(rpc.slice(0,4),[
    {event:'mcp_rpc_result',method:'server/discover',success:true},
    {event:'mcp_rpc_result',method:'tools/list',success:true,tool_count:2},
    {event:'mcp_rpc_result',method:'events/list',success:true,event_count:1},
    {event:'mcp_rpc_result',method:'events/subscribe',success:false,error_code:-32015},
  ]);
  assert.equal(rpc[4].method,'unknown');assert.equal(rpc[4].success,false);assert.equal(typeof rpc[4].error_code,'number');
  const output=JSON.stringify(rows);
  for(const privateValue of ['sentinel-',token,grant.code,app.conf.ownerSub,app.conf.ownerEmail,app.conf.clientId,'callbacks.example'])assert.equal(output.includes(privateValue),false);
});
