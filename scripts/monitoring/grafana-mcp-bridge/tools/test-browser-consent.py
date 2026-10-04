import subprocess,json,urllib.parse,socket,os,hashlib,base64,tempfile
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
 for mode in ['no-referrer','actual_source_headers']:
  with socket.socket() as reserve:reserve.bind(('127.0.0.1',0));port=reserve.getsockname()[1]
  env={**os.environ,'SYNTHETIC_BROWSER_PORT':str(port),'SYNTHETIC_HEADER_OVERRIDE':mode,'SYNTHETIC_TLS_DIR':tls.name}
  server=subprocess.Popen(['node',fixture],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,env=env)
  context=None
  try:
   json.loads(server.stdout.readline());base='https://localhost:'+str(port)
   context=browser.new_context(ignore_https_errors=True);page=context.new_page();captured={}
   def capture(req):
    if req.method=='POST' and urllib.parse.urlsplit(req.url).path.endswith('/consent'):
     h=req.all_headers();captured.update(origin_is_null=h.get('origin')=='null',origin_is_canonical=h.get('origin')==base,form_type_exact=h.get('content-type')=='application/x-www-form-urlencoded',referrer_is_origin_only=h.get('referer')==base+'/')
   page.on('request',capture)
   params={'client_id':'chatgpt-test-client','redirect_uri':base+'/synthetic-return','response_type':'code','scope':'mcp:events mcp:read','resource':base+'/mcp','state':'synthetic-client-state','code_challenge':challenge,'code_challenge_method':'S256'}
   page.goto(base+'/oauth/auth?'+urllib.parse.urlencode(params));page.get_by_role('button',name='Allow two-year access').click();page.wait_for_load_state()
   error=None;code=None;exchange=None
   if urllib.parse.urlsplit(page.url).path=='/synthetic-return':code=urllib.parse.parse_qs(urllib.parse.urlsplit(page.url).query).get('code',[None])[0]
   else:error=json.loads(page.locator('body').inner_text()).get('error')
   if code:
    r=context.request.post(base+'/oauth/token',form={'grant_type':'authorization_code','client_id':'chatgpt-test-client','redirect_uri':base+'/synthetic-return','code':code,'code_verifier':VERIFIER,'resource':base+'/mcp'})
    exchange=r.status;payload=r.json();captured['api_scopes_only']=set(payload.get('scope','').split())=={'mcp:events','mcp:read'}
   server.stdin.write('counts\n');server.stdin.flush()
   while True:
    line=server.stdout.readline()
    if not line:raise RuntimeError('synthetic_server_stopped')
    row=json.loads(line)
    if 'counts' in row:break
   results.append({'mode':mode,'fixed_error':error,'token_exchange_status':exchange,**captured,**row})
  finally:
   if context:context.close()
   server.stdin.write('stop\n');server.stdin.flush()
   try:server.wait(timeout=2)
   except subprocess.TimeoutExpired:server.terminate();server.wait(timeout=5)
 browser.close()
tls.cleanup()
old,fixed=results
assert old['fixed_error']=='offline_consent_required' and old['origin_is_null'] and all(v==0 for v in old['counts'].values())
assert fixed['fixed_error'] is None and fixed['origin_is_canonical'] and fixed['referrer_is_origin_only'] and fixed['token_exchange_status']==200 and fixed['api_scopes_only']
assert all(v==1 for v in fixed['counts'].values())
print(json.dumps({'browser_regression_passed':True,'scenarios':results}))
