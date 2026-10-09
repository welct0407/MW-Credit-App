import { randomUUID } from 'node:crypto';
import { canonicalCommand } from '../contracts/payment-command.mjs';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const codes = new Set(['ok','origin_denied','method_not_allowed','invalid_request','body_too_large','sign_in_required','session_invalid','access_denied','not_found','command_conflict','command_rejected','receipt_unsupported','receipt_unavailable','receipt_conflict','selection_changed','plan_changed','selection_limit_exceeded','business_date_changed','payment_requires_reconciliation','source_changed','metadata_conflict','borrower_name_exists','operation_outcome_unknown','record_conflict','invalid_reference','record_requires_reconciliation','record_outcome_unknown','metadata_outcome_unknown','command_outcome_unknown','command_unavailable']);
const MAX_BODY = 524288;
function route(raw) {
  try {
    const url = new URL(raw, 'http://candidate.invalid');
    if (url.hash) return { invalid: true, operation: 'unknown' };
    if(['/api/loan-records','/api/payment-records'].includes(url.pathname)){if(url.pathname==='/api/loan-records'&&['borrowerId','unassigned','month'].some(key=>url.searchParams.has(key)))return {invalid:true,operation:'unknown'};if([...url.searchParams.keys()].some(key=>!['q','limit','cursor','borrowerId','unassigned','month'].includes(key)||url.searchParams.getAll(key).length!==1))return {invalid:true,operation:'unknown'};return {operation:'record_list',kind:url.pathname==='/api/loan-records'?'loans':'payments',options:{q:url.searchParams.get('q')??'',...(url.searchParams.has('borrowerId')?{borrowerId:url.searchParams.get('borrowerId')}:{}),...(url.searchParams.has('month')?{month:url.searchParams.get('month')}:{}),...(url.searchParams.has('unassigned')?{unassigned:url.searchParams.get('unassigned')==='true'?true:null}:{}),limit:url.searchParams.has('limit')?Number(url.searchParams.get('limit')):25,cursor:url.searchParams.get('cursor')}};}
    if(url.pathname==='/api/cash-statements'){if([...url.searchParams.keys()].some(key=>!['accountId','date','limit','cursor'].includes(key)||url.searchParams.getAll(key).length!==1))return {invalid:true,operation:'unknown'};return {operation:'cash_statement',options:{accountId:url.searchParams.get('accountId'),date:url.searchParams.get('date'),limit:url.searchParams.has('limit')?Number(url.searchParams.get('limit')):25,cursor:url.searchParams.get('cursor')}};}
    const collectionReceipts=/^\/api\/borrowers\/([^/]+)\/collection-receipts$/.exec(url.pathname);if(collectionReceipts){if([...url.searchParams.keys()].some(key=>!['businessDate','chargeIds','limit','cursor'].includes(key)||url.searchParams.getAll(key).length!==1))return {invalid:true,operation:'unknown'};return {operation:'collection_receipts',borrowerId:decodeURIComponent(collectionReceipts[1]),options:{businessDate:url.searchParams.get('businessDate'),chargeIds:JSON.parse(url.searchParams.get('chargeIds')??'null'),limit:url.searchParams.has('limit')?Number(url.searchParams.get('limit')):25,cursor:url.searchParams.get('cursor')}};}
    const upcoming=/^\/api\/upcoming-charges(?:\/([^/]+)\/(\d{4}-\d{2}-\d{2}))?$/.exec(url.pathname);if(upcoming){if([...url.searchParams.keys()].some(key=>!['limit','cursor','businessDate'].includes(key)||url.searchParams.getAll(key).length!==1))return {invalid:true,operation:'unknown'};return {operation:'upcoming',options:{borrowerId:upcoming[1]?decodeURIComponent(upcoming[1]):null,dueDate:upcoming[2]??null,businessDate:url.searchParams.get('businessDate'),limit:url.searchParams.has('limit')?Number(url.searchParams.get('limit')):25,cursor:url.searchParams.get('cursor')}};}
    const sourceReceipt=/^\/api\/payment-records\/([^/]+)\/receipt$/.exec(url.pathname);if(sourceReceipt){if([...url.searchParams.keys()].some(key=>key!=='source'||url.searchParams.getAll(key).length!==1))return {invalid:true,operation:'unknown'};return {operation:'payment_image',paymentId:decodeURIComponent(sourceReceipt[1]),source:url.searchParams.get('source')??'preferred'};}
    const related=/^\/api\/loan-records\/([^/]+)\/(charges|payments)$/.exec(url.pathname);if(related){if([...url.searchParams.keys()].some(key=>!['limit','cursor'].includes(key)||url.searchParams.getAll(key).length!==1))return {invalid:true,operation:'unknown'};return {operation:'loan_related',loanId:decodeURIComponent(related[1]),kind:related[2],options:{limit:url.searchParams.has('limit')?Number(url.searchParams.get('limit')):25,cursor:url.searchParams.get('cursor')}};}
    const correction=/^\/api\/payment-records\/([^/]+)\/correction-preview$/.exec(url.pathname);
    if(correction){if([...url.searchParams.keys()].some(key=>!['targetLoanId','paymentDate','proposedBorrowerId'].includes(key)||url.searchParams.getAll(key).length!==1))return {invalid:true,operation:'unknown'};return {operation:'payment_record',paymentId:decodeURIComponent(correction[1]),preview:true,targetLoanId:url.searchParams.get('targetLoanId'),paymentDate:url.searchParams.get('paymentDate'),proposedBorrowerId:url.searchParams.get('proposedBorrowerId')};}
    const paged=url.pathname==='/api/expense-records'||/^\/api\/(payment-drafts\/[^/]+|borrowers\/[^/]+\/payments)$/.test(url.pathname);
    if(url.pathname==='/api/borrower-options'){if([...url.searchParams.keys()].some(key=>key!=='q')||url.searchParams.getAll('q').length>1)return {invalid:true,operation:'unknown'};return {operation:'borrower_options',query:url.searchParams.get('q')??''};}
    if(url.search&&(!paged||[...url.searchParams.keys()].some(key=>!['limit','cursor','scope'].includes(key)||url.searchParams.getAll(key).length!==1)))return {invalid:true,operation:'unknown'};
    const pageOptions={limit:url.searchParams.has('limit')?Number(url.searchParams.get('limit')):25,cursor:url.searchParams.get('cursor'),scope:url.searchParams.get('scope')??'due'};
    if(url.pathname==='/api/borrower-options')return {operation:'borrower_options'};
    if(url.pathname==='/api/dashboard')return {operation:'dashboard'};
    if(url.pathname==='/api/preferences')return {operation:'preferences'};
    if(url.pathname==='/api/cash-overview')return {operation:'cash_overview'};
    if(url.pathname==='/api/expense-options')return {operation:'expense_options'};
    if(url.pathname==='/api/expense-records')return {operation:'expense_list',options:pageOptions};
    const expense=/^\/api\/expense-records\/([^/]+)$/.exec(url.pathname);
    if(expense)return {operation:'expense_record',expenseId:decodeURIComponent(expense[1])};
    if(url.pathname==='/api/loan-options')return {operation:'loan_options'};
    if(url.pathname==='/api/borrower-records')return {operation:'borrower_create'};
    if(url.pathname==='/api/operations')return {operation:'operation_submit'};
    const operation=/^\/api\/operations\/([^/]+)$/.exec(url.pathname);
    if(operation)return uuid.test(operation[1])?{operation:'operation_status',requestId:operation[1].toLowerCase()}:{invalid:true,operation:'unknown'};
    const paymentRecord=/^\/api\/payment-records\/([^/]+)(\/correction-preview)?$/.exec(url.pathname);
    if(paymentRecord)return {operation:'payment_record',paymentId:decodeURIComponent(paymentRecord[1]),preview:!!paymentRecord[2]};
    const close=/^\/api\/loan-records\/([^/]+)\/close-preview$/.exec(url.pathname);
    if(close)return {operation:'loan_close_preview',loanId:decodeURIComponent(close[1])};
    const charge=/^\/api\/charge-records\/([^/]+)$/.exec(url.pathname);
    if(charge)return {operation:'charge_record',chargeId:decodeURIComponent(charge[1])};
    const loan=/^\/api\/loan-records\/([^/]+)$/.exec(url.pathname);
    if(loan)return {operation:'loan_record',loanId:decodeURIComponent(loan[1])};
    const borrower=/^\/api\/borrower-records\/([^/]+)$/.exec(url.pathname);
    if(borrower)return {operation:'borrower_record',borrowerId:decodeURIComponent(borrower[1])};
    const history=/^\/api\/borrowers\/([^/]+)\/payments$/.exec(url.pathname);
    if(history){try{return {operation:'payment_history',borrowerId:decodeURIComponent(history[1]),options:pageOptions}}catch{return {invalid:true,operation:'unknown'}}}
    const review=/^\/api\/payment-drafts\/([^/]+)\/(review|select-all|auto-assign)$/.exec(url.pathname);
    if(review){try{return {operation:review[2]==='select-all'?'payment_select_all':review[2]==='auto-assign'?'payment_auto_assign':'payment_review',borrowerId:decodeURIComponent(review[1])}}catch{return {invalid:true,operation:'unknown'}}}
    const detail=/^\/api\/payment-commands\/([^/]+)\/(result|metadata)$/.exec(url.pathname);
    if(detail){if(!uuid.test(detail[1]))return {invalid:true,operation:'unknown'};return {operation:detail[2]==='result'?'command_result':'command_metadata',requestId:detail[1].toLowerCase()};}
    if (url.pathname === '/health') return {operation:'health'};
    const draft=/^\/api\/payment-drafts\/([^/]+)$/.exec(url.pathname);
    if(draft){try{return {operation:'payment_draft',borrowerId:decodeURIComponent(draft[1]),options:pageOptions}}catch{return {invalid:true,operation:'unknown'}}}
    const receipt=/^\/api\/payment-commands\/([^/]+)\/receipts\/([^/]+)$/.exec(url.pathname);
    if(receipt){if(!uuid.test(receipt[1])||!uuid.test(receipt[2]))return {invalid:true,operation:'unknown'};return {operation:'receipt',requestId:receipt[1].toLowerCase(),receiptId:receipt[2].toLowerCase()};}
    if (url.pathname === '/api/payment-commands') return { operation: 'command_submit' };
    const match = /^\/api\/payment-commands\/([^/]+)$/.exec(url.pathname);
    if (match) { if (!uuid.test(match[1])) return { invalid: true, operation: 'unknown' }; return { operation: 'command_status', requestId: match[1].toLowerCase() }; }
  } catch { return { invalid: true, operation: 'unknown' }; }
  return { operation: 'unknown' };
}
function body(req,raw=false) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, settled = false;
    const cleanup = () => { clearTimeout(timer); req.off('data', data);req.off('end', end);req.off('aborted', abort);req.off('error', abort); };
    const finish = (error, value) => { if(settled)return;settled=true;cleanup();error?reject(error):resolve(value); };
    const data = chunk => { const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>(raw?5242880:MAX_BODY)){finish(Object.assign(new Error(),{bodyCode:'body_too_large'}));req.resume();return}chunks.push(bytes); };
    const end = () => { try { finish(null,raw?Buffer.concat(chunks):JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))); } catch { finish(new Error()); } };
    const abort = () => finish(new Error());
    const timer=setTimeout(()=>{finish(new Error());req.resume();},5000);
    req.on('data',data);req.once('end',end);req.once('aborted',abort);req.once('error',abort);
    if(req.aborted)abort();
  });
}
/** No listener or runtime auth switch. A test-owned server binds this handler to loopback only. */
function buildHandler({ origins, verifyPrincipal, store, completionLogger = () => {} }) {
  const allowedOrigins = Object.freeze([...origins]);
  return async (req, res) => {
    const reference = randomUUID(), started = performance.now(), target = route(req.url);
    const operation = req.method === 'OPTIONS' ? 'preflight' : target.operation;
    let code = 'command_unavailable';
    res.once('finish', () => { try { completionLogger({ event: 'command_request', requestId: reference, operation, method: ['GET','POST','PATCH','DELETE','OPTIONS'].includes(req.method) ? req.method : 'OTHER', status: res.statusCode, code, durationMs: Math.max(0, Math.round(performance.now()-started)) }); } catch { /* Logging cannot alter financial responses. */ } });
    res.setHeader('X-Request-ID', reference);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Origin');
    const send = (status, value) => { code = codes.has(value?.code) ? value.code : status < 400 ? 'ok' : 'command_unavailable'; res.statusCode = status; res.end(value === undefined ? undefined : JSON.stringify(value)); };
    const reject = (status, reason) => send(status, { ok: false, code: reason });
    const origin = req.headers.origin, allowed = typeof origin === 'string' && allowedOrigins.includes(origin);
    if (origin !== undefined && !allowed) return reject(403, 'origin_denied');
    if (allowed) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID'); }
    if (req.method === 'OPTIONS') {
      if (!allowed || !['GET','POST','PATCH','DELETE'].includes(req.headers['access-control-request-method']) || (req.headers['access-control-request-headers'] || '').split(',').some(value => value.trim() && !['authorization','content-type','x-borrower-id'].includes(value.trim().toLowerCase()))) return reject(403, 'origin_denied');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Borrower-ID');return send(204);
    }
    if (!['GET','POST','PATCH','DELETE'].includes(req.method)) return reject(405, 'method_not_allowed');
    if(target.operation==='health' && req.method==='GET')return send(200,{ok:true});
    let principal;
    try { principal = await verifyPrincipal(req.headers.authorization); } catch { return reject(401, 'session_invalid'); }
    if (!principal?.ok) return reject(principal?.status === 403 ? 403 : 401, ['sign_in_required','session_invalid','access_denied'].includes(principal?.code) ? principal.code : 'session_invalid');
    if (target.invalid) return reject(400, 'invalid_request');
    if (target.operation === 'unknown') return reject(404, 'not_found');
    if ((target.operation === 'command_submit' && req.method !== 'POST') || (['command_status','command_result','payment_draft','payment_history'].includes(target.operation) && req.method !== 'GET')) return reject(405, 'method_not_allowed');
    if((['payment_review','payment_auto_assign','payment_select_all'].includes(target.operation)&&req.method!=='POST')||(target.operation==='command_metadata'&&req.method!=='PATCH')||(target.operation==='receipt'&&!['GET','POST'].includes(req.method)))return reject(405,'method_not_allowed');
    if(['borrower_create','operation_submit'].includes(target.operation)&&req.method!=='POST'||['record_list','collection_receipts','upcoming','payment_image','dashboard','loan_related','preferences','cash_overview','cash_statement','borrower_options','loan_options','loan_record','charge_record','payment_record','expense_record','expense_options','expense_list','loan_close_preview','operation_status'].includes(target.operation)&&req.method!=='GET'||target.operation==='borrower_record'&&!['GET','PATCH','DELETE'].includes(req.method))return reject(405,'method_not_allowed');
    let result;
    try {
      if(target.operation==='operation_status')result=await store.operationStatus(principal,target.requestId);
      else if(target.operation==='operation_submit'){
        if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||'')||(req.headers['content-encoding']&&req.headers['content-encoding']!=='identity'))return reject(415,'invalid_request');
        let input;try{input=await body(req)}catch(error){return reject(error.bodyCode==='body_too_large'?413:400,error.bodyCode||'invalid_request')}
        if(req.aborted||res.destroyed)return;result=await store.operation(principal,input);
      }else if(target.operation==='loan_options')result=await store.loanOptions(principal);
      else if(target.operation==='loan_close_preview')result=await store.loanClosePreview(principal,target.loanId);
      else if(target.operation==='preferences')result=await store.preferences(principal);
      else if(target.operation==='cash_overview')result=await store.cashOverview(principal);
      else if(target.operation==='cash_statement')result=await store.cashStatement(principal,target.options);
      else if(target.operation==='expense_record')result=await store.expenseRecord(principal,target.expenseId);
      else if(target.operation==='expense_options')result=await store.expenseOptions(principal);
      else if(target.operation==='expense_list')result=await store.expenses(principal,target.options);
      else if(target.operation==='collection_receipts')result=await store.collectionReceipts(principal,target.borrowerId,target.options);
      else if(target.operation==='payment_record')result=await store.paymentRecord(principal,target.paymentId,{preview:target.preview,targetLoanId:target.targetLoanId??null,paymentDate:target.paymentDate??null,proposedBorrowerId:target.proposedBorrowerId??null});
      else if(target.operation==='charge_record')result=await store.chargeRecord(principal,target.chargeId);
      else if(target.operation==='payment_image'){result=await store.paymentImage(principal,target.paymentId,target.source);if(result.ok&&Buffer.isBuffer(result.bytes)){code='ok';res.statusCode=200;res.setHeader('Content-Type',result.mimeType);res.setHeader('Content-Disposition','inline');return res.end(result.bytes);}}
      else if(target.operation==='upcoming')result=await store.upcoming(principal,target.options);
      else if(target.operation==='record_list')result=await store.recordList(principal,target.kind,target.options);
      else if(target.operation==='dashboard')result=await store.dashboard(principal);
      else if(target.operation==='loan_related')result=await store.loanRelated(principal,target.loanId,target.kind,target.options);
      else if(target.operation==='loan_record')result=await store.loanRecord(principal,target.loanId);
      else if(target.operation==='borrower_options')result=await store.borrowerOptions(principal,target.query);
      else if(target.operation==='borrower_record'&&req.method==='GET')result=await store.borrowerRecord(principal,target.borrowerId);
      else if(['borrower_create','borrower_record'].includes(target.operation)){
        if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||'')||(req.headers['content-encoding']&&req.headers['content-encoding']!=='identity'))return reject(415,'invalid_request');
        let input;try{input=await body(req)}catch(error){return reject(error.bodyCode==='body_too_large'?413:400,error.bodyCode||'invalid_request')}
        if(req.aborted||res.destroyed)return;
        if(target.operation==='borrower_create'){
          if(!input||Object.keys(input).sort().join(',')!=='fields,id')return reject(400,'invalid_request');
          result=await store.borrowerRecord(principal,input.id,'create',{fields:input.fields});
        }else result=await store.borrowerRecord(principal,target.borrowerId,req.method==='PATCH'?'edit':'delete',input);
      }
      else if (target.operation === 'command_submit') {
        if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '') || (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity')) return reject(415, 'invalid_request');
        let command;
        try { command = canonicalCommand(await body(req)); } catch (error) { return reject(error.bodyCode === 'body_too_large' ? 413 : 400, error.bodyCode || 'invalid_request'); }
        if (req.aborted || res.destroyed) return;
        result = await store.submit(principal, command);
      } else if(target.operation==='payment_draft') result=await store.draft(principal,target.borrowerId,target.options);
      else if(target.operation==='payment_history')result=await store.history(principal,target.borrowerId,target.options);
      else if(target.operation==='command_result')result=await store.result(principal,target.requestId);
      else if(['payment_review','payment_auto_assign','payment_select_all','command_metadata'].includes(target.operation)){
        if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||'')||(req.headers['content-encoding']&&req.headers['content-encoding']!=='identity'))return reject(415,'invalid_request');
        let input;try{input=await body(req)}catch(error){return reject(error.bodyCode==='body_too_large'?413:400,error.bodyCode||'invalid_request')}
        if(req.aborted||res.destroyed)return;
        result=target.operation==='payment_auto_assign'?await store.autoAssign(principal,target.borrowerId,input):target.operation==='payment_select_all'?await store.selectAll(principal,target.borrowerId,input):target.operation==='payment_review'?await store.review(principal,target.borrowerId,input):await store.metadata(principal,target.requestId,input);
      }
      else if(target.operation==='receipt') {
        let bytes,mimeType;
        if(req.method==='POST'){
          mimeType=req.headers['content-type'];
          if(!['image/png','image/jpeg'].includes(mimeType)||(req.headers['content-encoding']&&req.headers['content-encoding']!=='identity'))return reject(415,'invalid_request');
          try{bytes=await body(req,true)}catch(error){return reject(error.bodyCode==='body_too_large'?413:400,error.bodyCode||'invalid_request')}
          if(req.aborted||res.destroyed)return;
        }
        result=await store.receipt(principal,{requestId:target.requestId,receiptId:target.receiptId,borrowerId:req.headers['x-borrower-id'],bytes,mimeType});
        if(result.ok && Buffer.isBuffer(result.bytes)){code='ok';res.statusCode=200;res.setHeader('Content-Type',result.mimeType);res.setHeader('Content-Disposition','inline');return res.end(result.bytes);}
      } else result = await store.status(principal, target.requestId);
      const { status, ...value } = result;return send(status, value);
    } catch { return reject(503, target.operation === 'command_submit' ? 'command_outcome_unknown' : 'command_unavailable'); }
  };
}

export function createPaymentCommandHandler(options) {
 const {origins,verifyPrincipal,store}=options;
  if (!Array.isArray(origins) || !origins.length || new Set(origins).size !== origins.length || origins.some(origin => {
    try { const url = new URL(origin); return url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.origin !== origin; } catch { return true; }
  }) || typeof verifyPrincipal !== 'function' || !store) throw new Error('Explicit disposable loopback origins required');
 return buildHandler(options);
}
export function createDevCommandHandler({config,...options}) {
 const allowed=['https://mw-credit-app-dev-737787224638.web.app','https://dev-lm.mw-credit.com'];
 if(!['synthetic-only','dev-owner-testing'].includes(config?.mode)||!Array.isArray(config.origins)||!config.origins.length||config.origins.some(origin=>!allowed.includes(origin)))throw Error('Invalid DEV command origins');
 return buildHandler({...options,origins:config.origins});
}
