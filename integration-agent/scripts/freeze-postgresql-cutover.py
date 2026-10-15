"""Root-only Debian writer drain and private, restore-verified recovery archive.

Leaves all affected services stopped. No automatic resume on failure.
"""
import hashlib,json,os,sqlite3,subprocess,time
from datetime import datetime,timezone
from pathlib import Path

if os.geteuid()!=0:raise SystemExit('root required')
if os.uname().nodename!='vm-mw-credit-agent':raise SystemExit('wrong VM')
timers=['mw-conversation-poll','mw-receipt-summary','mw-cash-statement',
        'mw-cash-statement-email-retry','mw-partner-conversation']
def run(*args,**kw):return subprocess.run(args,check=True,**kw)
def active(unit):
    return subprocess.check_output(['systemctl','show',unit,'--property=ActiveState','--value'],text=True).strip()
root=Path('/var/lib/mw-integration-agent/rollback')/('postgresql-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
root.mkdir(mode=0o700,parents=True,exist_ok=False)
metadata={'started_at':datetime.now(timezone.utc).isoformat(),
          'source_commit':subprocess.check_output(['git','-C','/opt/mw-integration-agent-src','rev-parse','HEAD'],text=True).strip(),
          'resume_timers':[t+'.timer' for t in timers if active(t+'.timer')=='active']}
(root/'freeze.json').write_text(json.dumps(metadata,indent=2)+'\n')
run('systemctl','stop',*[t+'.timer' for t in timers])
deadline=time.monotonic()+1200
while any(active(t+'.service') in ('active','activating','deactivating') for t in timers):
    if time.monotonic()>deadline:raise SystemExit('Workers did not drain; no forced termination')
    time.sleep(2)
run('systemctl','stop','mw-instagram-webhook.service')
metadata['writers_stopped_at']=datetime.now(timezone.utc).isoformat()
paths=['etc/mw-integration-agent','var/lib/mw-integration-agent/state',
       'var/lib/mw-integration-agent/codex-runtime','opt/mw-integration-agent/.venv',
       'etc/systemd/system']
archive=root/'recovery.tar'
run('tar','-cpf',str(archive),'-C','/',*paths,stdout=subprocess.DEVNULL)
restore=root/'restore-check';restore.mkdir(mode=0o700)
run('tar','-xpf',str(archive),'-C',str(restore))
def fingerprints(base):
    result={}
    for name in paths:
        for p in (base/name).rglob('*'):
            if p.is_file() and not p.is_symlink():
                result[str(p.relative_to(base))]=hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
    return result
source=fingerprints(Path('/'));restored=fingerprints(restore)
if source!=restored:raise SystemExit('Recovery archive fingerprint mismatch')
for p in (restore/'var/lib/mw-integration-agent/state').glob('*.db'):
    with sqlite3.connect(p.resolve().as_uri()+'?mode=ro',uri=True) as c:
        if c.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise SystemExit('Restored journal integrity failure')
metadata.update(restored_files=len(restored),archive_sha256=hashlib.file_digest(archive.open('rb'),'sha256').hexdigest(),
                restore_verified=True)
(root/'freeze.json').write_text(json.dumps(metadata,indent=2)+'\n')
Path('/var/lib/mw-integration-agent/rollback/postgresql-current-path').write_text(str(root)+'\n')
print(json.dumps({'backup':str(root),'restored_files':len(restored),'restore_verified':True,'writers_stopped':True}))
