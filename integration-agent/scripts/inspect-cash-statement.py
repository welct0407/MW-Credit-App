"""Read-only schema/aggregate preflight; never prints financial rows or contacts."""
import json
import os
import subprocess
from pathlib import Path

c = json.loads(Path('/etc/mw-integration-agent/config.json').read_text())
env = dict(os.environ, PGPASSWORD=Path(c['database_password_file']).read_text().strip())
sql = '''
BEGIN READ ONLY;
SELECT current_database(), current_user;
SELECT table_name,column_name,data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name IN
('Partners','Cash Accounts','cash_statement_account_effects','r008_cash_account_cutover','Borrowers')
ORDER BY table_name,ordinal_position;
SELECT 'accounts',count(*) FROM public."Cash Accounts";
SELECT 'initialized',count(*) FROM public.r008_cash_account_cutover;
SELECT 'enabled_languages',"Language Preference",count(*) FROM public."Partners"
WHERE "IG Integration Enabled" IS TRUE GROUP BY "Language Preference";
ROLLBACK;
'''
p = subprocess.run(['psql','-X','-h',c['database_host'],'-p',str(c['database_port']),
    '-U',c['database_user'],'-d',c['database_name'],'-At','-v','ON_ERROR_STOP=1'],
    input=sql,text=True,env=env,capture_output=True)
if p.returncode:
    raise SystemExit('Read-only preflight failed')
print(p.stdout)
