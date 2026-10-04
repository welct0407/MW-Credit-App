import sys,subprocess,json,urllib.parse,socket,os,hashlib,base64,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
VERIFIER='synthetic-pkce-verifier-012345678901234567890123456789'
challenge=base64.urlsafe_b64encode(hashlib.sha256(VERIFIER.encode()).digest()).decode().rstrip('=')
results=[]
fixture=str(Path(__file__).with_name('browser-consent-fixture.mjs'))
tls=tempfile.TemporaryDirectory(prefix='grafana-consent-browser-')
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',tls.name+'/key.pem','-out',tls.name+'/cert.pem','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--no-proxy-server'])
 for mode in ['no-referrer','legacy-self','api_only_no_prompt','api_only_consent_prompt','openid_api_consent_prompt','session_only','cancel','unknown_form_target']:
  print('browser_scenario='+mode,file=sys.stderr)
  with socket.socket() as reserve:reserve.bind(('127.0.0.1',0));port=reserve.getsockname()[1]
  env={**os.environ,'SYNTHETIC_BROWSER_PORT':str(port),'SYNTHETIC_HEADER_OVERRIDE':mode,'SYNTHETIC_TLS_DIR':tls.name}
  server=subprocess.Popen(['node',fixture],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,env=env)
  context=None
  try:
   json.loads(server.stdout.readline());base='https://localhost:'+str(port)
   context=browser.new_context(ignore_https_errors=True);page=context.new_page();captured={'csp_form_action_blocked':False,'callback_cross_origin':True,'callback_received':False,'consent_post_status':None}
   page.on('console',lambda msg:captured.update(csp_form_action_blocked=True) if 'form-action' in msg.text and 'violat' in msg.text else None)
   def capture(req):
    if urllib.parse.urlsplit(req.url).path=='/synthetic-return':captured.update(callback_received=True,callback_is_get=req.method=='GET',no_form_data_forwarded=req.post_data_buffer is None)
    if req.method=='POST' and urllib.parse.urlsplit(req.url).path.endswith('/consent'):
     h=req.all_headers();captured.update(origin_is_null=h.get('origin')=='null',origin_is_canonical=h.get('origin')==base,form_type_exact=h.get('content-type')=='application/x-www-form-urlencoded',referrer_is_origin_only=h.get('referer')==base+'/')
   page.on('request',capture)
   page.on('response',lambda res:captured.update(consent_post_status=res.status) if res.request.method=='POST' and urllib.parse.urlsplit(res.url).path.endswith('/consent') else None)
   params={'client_id':'chatgpt-test-client','redirect_uri':'https://127.0.0.1:'+str(port)+'/synthetic-return','response_type':'code','scope':'mcp:events mcp:read','resource':base+'/mcp','state':'synthetic-client-state','code_challenge':challenge,'code_challenge_method':'S256'}
   if mode in ['legacy-self','api_only_consent_prompt','openid_api_consent_prompt']:params['prompt']='consent'
   if mode=='openid_api_consent_prompt':params['scope']='openid mcp:events mcp:read'
   page.goto(base+'/oauth/auth?'+urllib.parse.urlencode(params));before=page.url
   if mode=='unknown_form_target':page.locator('form').evaluate("form=>form.action='https://127.0.0.1:65534/unknown'")
   choice='Continue session-only' if mode=='session_only' else 'Cancel' if mode=='cancel' else 'Allow two-year access'
   button=page.get_by_role('button',name=choice,exact=True)
   if mode in ['legacy-self','unknown_form_target']:
    with page.expect_console_message(predicate=lambda msg:'form-action' in msg.text and 'violat' in msg.text,timeout=10000):button.click(no_wait_after=True)
   elif mode=='no-referrer':
    with page.expect_response(lambda res:res.request.method=='POST' and urllib.parse.urlsplit(res.url).path.endswith('/consent'),timeout=10000):button.click(no_wait_after=True)
    page.wait_for_url(lambda url:urllib.parse.urlsplit(url).path.endswith('/consent'),timeout=10000);page.wait_for_load_state()
   else:
    with page.expect_response(lambda res:urllib.parse.urlsplit(res.url).path=='/synthetic-return',timeout=10000):button.click(no_wait_after=True)
    page.wait_for_url(lambda url:urllib.parse.urlsplit(url).path=='/synthetic-return',timeout=10000);page.wait_for_load_state()
   captured['same_consent_page_after_click']=page.url==before
   error=None;code=None;exchange=None
   if urllib.parse.urlsplit(page.url).path=='/synthetic-return':
    callback_params=urllib.parse.parse_qs(urllib.parse.urlsplit(page.url).query);code=callback_params.get('code',[None])[0];error=callback_params.get('error',[None])[0]
   elif page.locator('button').count():error=None
   else:error=json.loads(page.locator('body').inner_text()).get('error')
   if code:
    r=context.request.post(base+'/oauth/token',form={'grant_type':'authorization_code','client_id':'chatgpt-test-client','redirect_uri':'https://127.0.0.1:'+str(port)+'/synthetic-return','code':code,'code_verifier':VERIFIER,'resource':base+'/mcp'})
    exchange=r.status;payload=r.json();captured['api_scopes_only']=set(payload.get('scope','').split())=={'mcp:events','mcp:read'}

   server.stdin.write('counts\n');server.stdin.flush()
   while True:
    line=server.stdout.readline()
    if not line:raise RuntimeError('synthetic_server_stopped')
    try:row=json.loads(line)
    except json.JSONDecodeError:continue
    if 'counts' in row:break
   if code:
    replay=context.request.post(base+'/oauth/token',form={'grant_type':'authorization_code','client_id':'chatgpt-test-client','redirect_uri':'https://127.0.0.1:'+str(port)+'/synthetic-return','code':code,'code_verifier':VERIFIER,'resource':base+'/mcp'});captured['code_replay_rejected']=replay.status==400
   results.append({'mode':mode,'fixed_error':error,'token_exchange_status':exchange,**captured,**row})
  finally:
   if context:context.close()
   server.stdin.write('stop\n');server.stdin.flush()
   try:server.wait(timeout=2)
   except subprocess.TimeoutExpired:server.terminate();server.wait(timeout=5)
 browser.close()
tls.cleanup()
old,blocked,*positive,session,cancel,foreign=results
assert old['fixed_error']=='offline_consent_required' and old['origin_is_null'] and all(v==0 for v in old['counts'].values())
assert blocked['same_consent_page_after_click'] and blocked['csp_form_action_blocked'] and blocked['token_exchange_status'] is None and blocked['consent_post_status']==303
assert blocked['counts']=={'Grant':1,'OwnerConsent':1,'AuthorizationCode':1,'AccessToken':0,'RefreshToken':0}
for fixed in positive+[session]:
 assert fixed['fixed_error'] is None and fixed['origin_is_canonical'] and fixed['referrer_is_origin_only'] and fixed['token_exchange_status']==200 and fixed['api_scopes_only'] and fixed['code_replay_rejected']
 assert not fixed['same_consent_page_after_click'] and not fixed['csp_form_action_blocked']
 assert fixed['callback_received'] and fixed['callback_is_get'] and fixed['no_form_data_forwarded'] and fixed['consent_post_status']==303
 assert fixed['counts']=={'Grant':1,'OwnerConsent':0 if fixed is session else 1,'AuthorizationCode':1,'AccessToken':1,'RefreshToken':1}
 assert fixed['token_metadata']['refresh_expires_with_session']==(fixed is session) and fixed['token_metadata']['refresh_within_grant_deadline']
 if fixed is not session:assert fixed['token_metadata']['durable_consent_lifetime_seconds']==730*86400 and fixed['token_metadata']['grant_deadline_matches_consent']
assert cancel['fixed_error']=='access_denied' and cancel['callback_received'] and cancel['callback_is_get'] and cancel['no_form_data_forwarded'] and all(v==0 for v in cancel['counts'].values())
assert foreign['same_consent_page_after_click'] and foreign['csp_form_action_blocked'] and all(v==0 for v in foreign['counts'].values())
print(json.dumps({'browser_regression_passed':True,'scenarios':results}))
