"""Run the local reconciliation checks sequentially and record actual outcomes.

No live reads/writes. Private input is used only for independent saved HTML parsing.
"""
import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from common import REPO,ROOT,load,digest,equal,write_json

def validate(private,folder):
    private=Path(private);folder=Path(folder).resolve();relative=folder.relative_to(REPO).as_posix()
    checks=[]
    commands=[['scripts/dictionary/appdoc_capture.py',str(private)],
      ['scripts/dictionary/verify_reconciliation.py',relative],
      ['scripts/dictionary/reconcile_editor.py',str(private),relative,'--verify'],
      ['scripts/dictionary/validate_dependencies.py',relative],
      ['scripts/dictionary/review_semantics.py',relative],
      ['-m','unittest','discover','-s','scripts/dictionary','-p','test_*.py'],
      ['scripts/dictionary/dictionary.py','validate']]
    for args in commands:
        result=subprocess.run([sys.executable,*args],cwd=REPO,text=True,encoding='utf8',capture_output=True,
            env={**os.environ,'PYTHONUTF8':'1'})
        checks.append({'command':['python',*args],'exit_code':result.returncode,'stdout':result.stdout.strip(),'stderr':result.stderr.strip()})
        print(args[0],result.returncode,flush=True)
        if result.returncode:break
    template=json.loads((folder/'export-template-observations.json').read_text(encoding='utf8'))
    actual=load(ROOT/'systems/appsheet/olap/automations/daily-analysis-export-template.yaml')['content']
    checks.append({'check':'Exact template source-to-YAML readback','exit_code':0 if equal(template,actual) else 1})
    coverage=json.loads((folder/'coverage.json').read_text(encoding='utf8'))
    captures=json.loads((private/'app-captures.json').read_text(encoding='utf8'))
    for c in captures:
        meta=coverage['targets'][c['key']]
        meta['acquisition']={'method':'Saved AppDoc complete rendered HTML and DOM table extraction; independent HTML parser',
            'source_url':c['url'],'captured_utc':c['capturedUtc']}
    for target,meta in coverage['targets'].items():
        if target.startswith('postgresql-'):
            meta['acquisition']={'method':'Reviewed PostgreSQL catalogs in SSL read-only repeatable-read transaction',
              'source_location':meta['identity'],'captured_utc':meta['captured_utc']}
    write_json(folder/'coverage.json',coverage)
    issues=[];files=list(folder.glob('*.json'))+list(ROOT.rglob('*.yaml'))
    for path in files:
        if path.name=='validation.json':continue
        text=path.read_text(encoding='utf-8-sig')
        for label,pattern in [('personal-email',r'[\w.+%-]+@(?!mw-credit\.com\b)[\w.-]+\.[A-Za-z]{2,}'),
          ('unredacted-signature',r'[?&]signature=(?!\[REDACTED)[^&\s"<>]+'),
          ('private-key',r'-----BEGIN.*PRIVATE KEY-----'),('bearer-token',r'Bearer\s+[A-Za-z0-9_-]{20,}')]:
            if re.search(pattern,text):issues.append({'file':path.relative_to(REPO).as_posix(),'pattern':label})
    checks.append({'check':'Published metadata privacy patterns','exit_code':1 if issues else 0,'issues':issues,
        'limit':'Pattern screening complements reviewed metadata extraction; it is not a universal secret detector.'})
    rows=coverage['objects']+coverage['editor_objects']+coverage['supplemental_objects']
    checks.append({'check':'Coverage complete within declared scope','exit_code':0 if all(x['status']=='verified' and not x['unknown_properties'] for x in rows) else 1,
        'facets':len(rows),'excluded_property_leaves':sum(len(x.get('excluded_properties',[])) for x in rows)})
    result={'checked_utc':dt.datetime.now(dt.timezone.utc).isoformat(),'checks':checks,
      'source_targets':coverage['targets'],'status':'pass' if all(x['exit_code']==0 for x in checks) else 'fail',
      'artifact_sha256':{p.name:digest(p.read_bytes()) for p in sorted(folder.iterdir()) if p.is_file() and p.name!='validation.json'},
      'hash_note':'Hashes cover finalized UTF-8 LF artifacts in this run directory, excluding this self-referential report. Metadata fingerprints separately hash decoded catalog sections.',
      'live_validation_evidence':['production-flyway-validation.json','development-flyway-validation.json','source-stability.json','final-editor-status.json'],
      'limits':['No live behavior, financial writes, notifications or export rendering.','Private literals and system/runtime scope exclusions are explicit in coverage and README.']}
    write_json(folder/'validation.json',result)
    print(json.dumps({'status':result['status'],'checks':len(checks),'excluded_property_leaves':checks[-1]['excluded_property_leaves']}))
    if result['status']!='pass':raise SystemExit(1)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('private');p.add_argument('folder');a=p.parse_args();validate(a.private,a.folder)
