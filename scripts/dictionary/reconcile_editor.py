"""Reconcile private DOM observations into explicit editor supplements, offline only.

Snapshots exclude emulator/business data. Fields preserve DOM order and exact values;
labels are observations, not a claim that every AppSheet property was exported.
"""
import argparse
import copy
import datetime as dt
import json
import re
from pathlib import Path
from common import REPO, ROOT, load, dump, equal, atomic_write, write_json, make_index, digest
from reconcile_captures import APP_IDS, delta, apply_delta, envelope, slug, leaves

def read(path):
    return json.loads(Path(path).read_text(encoding='utf8'))

def sanitize(value):
    """Signed logo access tokens are transport credentials, not model definitions."""
    if isinstance(value,str):
        value=re.sub(r'([?&]signature=)[^&\s"<>]+',r'\1[REDACTED-ACCESS-SIGNATURE]',value)
        return re.sub(r'[A-Za-z0-9._%+-]+@(?!mw-credit\.com\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}',
                      '[PRIVATE-APP-USER: identity retained in private access evidence]',value)
    if isinstance(value,list):return [sanitize(x) for x in value]
    if isinstance(value,dict):return {k:sanitize(v) for k,v in value.items()}
    return value

def fields(rows):
    result=[]
    for row in rows:
        if row['label'] in ('Test step','Input','Results'): break
        result.append(row)
    return result

def panel_snapshot(snapshot):
    """Keep configuration, excluding navigation, emulator chrome and test controls."""
    lines=snapshot.splitlines();out=[];started=False;preview=False
    for line in lines:
        if line.startswith('  - paragraph:') and not started:started=True
        if not started:continue
        if line.startswith('  - button "Close right panel"'):preview=True
        if preview and line.startswith('  - heading "Settings"'):preview=False
        if preview:continue
        if line.startswith('  - heading "Test step"') or line.startswith('  - paragraph: Chat app overview'):break
        if re.match(r'  - text: [\ue000-\uf8ff ]+$',line):continue
        out.append(line)
    return '\n'.join(out)

def observations(private):
    result={t:{} for t in APP_IDS};times={t:[] for t in APP_IDS}
    for row in read(private/'table-settings.json'):
        result[row['target']][('table',row['name'])]={'fields':fields(row['fields']),
          'update_permissions_snapshot':'\n'.join((row.get('snapshot') or '').splitlines()[:25])}
        times[row['target']].append(row['capturedUtc'])
    trees={row['target']:{x['name']:x['sourceGroup'] for x in row['tree']} for row in read(private/'view-trees.json')}
    for row in read(private/'view-settings.json'):
        result[row['target']][('view',row['name'])]={'fields':fields(row['fields']),
            'generated_source_group':trees.get(row['target'],{}).get(row['name'])}
        times[row['target']].append(row['capturedUtc'])
    for row in read(private/'component-settings.json'):
        result[row['target']][('automation',row['category']+': '+row['name'])]={'fields':fields(row['fields'])}
        times[row['target']].append(row['capturedUtc'])
    panels={}
    for row in read(private/'editor-captures.json'):
        label=row['label']
        if label.startswith(('views/','components/')) or label=='automation/inventory':continue
        if not label.startswith(('settings/','security/','automation/')):label='automation/'+label
        if not row.get('snapshot'):continue
        panels[(row['target'],label)]=row
    for (target,label),row in panels.items():
        if label.startswith('automation/'):
            _,name,section=label.split('/',2)
            if section in ('guard','action'):continue
            key=('automation',name)
            result[target].setdefault(key,{'panels':{}})['panels'][section]=panel_snapshot(row['snapshot'])
        else:
            key=('settings','Editor '+label)
            # Actual control values complement snapshot values. Exclude editor chrome.
            controls=[]
            for x in row['controls']:
                if x.get('label') in ('App Name','search box','User Email','Edit','Test step',''):continue
                # The preview-email textbox has no label in some DOM states and the
                # legacy collector inherited the first page heading. Exclude that
                # trailing empty text duplicate of an actual checkbox control.
                if x['value']=='' and x['type']=='text' and any(y.get('label')==x.get('label') and y['type']=='checkbox' for y in controls):continue
                controls.append(x)
            result[target][key]={'controls':controls,'snapshot':panel_snapshot(row['snapshot'])}
        times[target].append(row['capturedUtc'])
    for row in read(private/'theme-settings.json'):
        result[row['target']][('settings','Editor settings/Theme & Brand')]['selected_control_values']=row['fields']
        times[row['target']].append(row['capturedUtc'])
    for row in read(private/'bot-options.json'):
        result[row['target']][('automation',row['name'])]['bot_options']=row['fields']
        times[row['target']].append(row['capturedUtc'])
    for row in read(private/'access-settings.json'):
        result[row['target']][('settings','Editor access roster')]={'snapshot':row['snapshot']}
        times[row['target']].append(row['capturedUtc'])
    # Inventories remain separate evidence, not duplicate owning definitions.
    inventories=[{'target':r['target'],'label':r['label'],'capturedUtc':r['capturedUtc'],
        'snapshot':r['snapshot'].split('  - paragraph:')[0].split('  - navigation:')[-1]}
        for r in read(private/'editor-captures.json') if r['label'].startswith('components/') or r['label']=='automation/inventory']
    return sanitize(result),times,sanitize(inventories)

def reconcile(private,folder,apply=False):
    observed,times,inventories=observations(Path(private));folder=Path(folder)
    coverage=read(folder/'coverage.json');base_paths={(r['target'],r['object_kind'],r['object_name']):r['dictionary_path'] for r in coverage['objects']}
    tasks=[];edits={};guards={};evidence=(folder.relative_to(REPO)/'editor-observations.json').as_posix()
    for role in ('oltp','olap'):
        prod=observed['production-'+role];dev=observed['development-'+role]
        for kind,name in sorted(set(prod)|set(dev)):
            p=prod.get((kind,name));d=dev.get((kind,name));prod_path=None
            if p is not None:
                if kind in ('table','view'):
                    prod_path=REPO/base_paths[('production-'+role,kind,name)]
                    guards[prod_path]=digest(prod_path.read_bytes());doc=load(prod_path)
                    doc['content']['editor']=p
                else:
                    prod_path=ROOT/'systems/appsheet'/role/('automations' if kind=='automation' else 'settings')/('editor-'+slug(name)+'.yaml')
                    guards[prod_path]=digest(prod_path.read_bytes()) if prod_path.exists() else None
                    doc=envelope('appsheet',role,kind,name,{'editor':p},evidence)
                doc['verification']['editor_source']=evidence
                edits[prod_path]=doc
                tasks.append(dict(target='production-'+role,object_kind=kind,object_name=name,dictionary_path=prod_path.relative_to(REPO).as_posix(),pointer='/content/editor'))
            if d is not None:
                if equal(p,d):path=prod_path
                else:
                    path=ROOT/'development/appsheet/environment'/('editor-'+role+'-'+kind+'-'+slug(name)+'.yaml')
                    guards[path]=digest(path.read_bytes()) if path.exists() else None
                    content={'target_app_id':APP_IDS['development-'+role],'production_baseline':prod_path.relative_to(REPO).as_posix() if prod_path else None,
                        'classification':'Observed editor metadata difference; see reconciliation findings for interpretation',
                        'changes':delta(p,d) if p is not None else [{'pointer':'','before':{'state':'absent'},'after':{'state':'value','value':d}}]}
                    edits[path]=envelope('appsheet',role,kind,name,content,evidence,scope='development:editor-observed')
                tasks.append(dict(target='development-'+role,object_kind=kind,object_name=name,dictionary_path=path.relative_to(REPO).as_posix(),pointer='/content/editor' if path==prod_path else '/content/changes'))
    public={'targets':{t:{'app_id':APP_IDS[t],'capture_start':min(times[t]),'capture_end':max(times[t]),
        'objects':[{'kind':k,'name':n,'content':v} for (k,n),v in sorted(obj.items())]} for t,obj in observed.items()},'component_inventories':inventories}
    if not apply:
        print(json.dumps({'files':len(edits),'observed_objects':len(tasks),'apply':False}));return
    for path in edits:
        if (digest(path.read_bytes()) if path.exists() else None)!=guards[path]:
            raise ValueError('Concurrent file change: '+str(path))
    for path,doc in edits.items():
        if (digest(path.read_bytes()) if path.exists() else None)!=guards[path]:
            raise ValueError('Concurrent file change: '+str(path))
        payload=dump(doc)
        # common.dump roundtrips the JSON-compatible YAML; preserve no alternate format.
        atomic_write(path,payload)
    write_json(folder/'editor-observations.json',public)
    coverage['editor_objects']=tasks;write_json(folder/'coverage.json',coverage)
    write_json(ROOT/'index.json',make_index(ROOT))
    verify(folder)

def verify(folder):
    folder=Path(folder);coverage=read(folder/'coverage.json');source=read(folder/'editor-observations.json')
    wanted={(t,x['kind'],x['name']):x['content'] for t,v in source['targets'].items() for x in v['objects']}
    actual={(x['target'],x['object_kind'],x['object_name']) for x in coverage['editor_objects']}
    failures=[];counts={};properties={}
    if actual!=set(wanted):failures.append('Editor coverage identity set mismatch')
    for row in coverage['editor_objects']:
        doc=load(REPO/row['dictionary_path']);key=(row['target'],row['object_kind'],row['object_name'])
        if row['pointer']=='/content/changes':
            ref=doc['content']['production_baseline'];baseline=load(REPO/ref)['content']['editor'] if ref else None
            value=apply_delta(baseline,doc['content']['changes'])
        else:value=doc['content']['editor']
        if not equal(value,wanted[key]):failures.append(list(key))
        observed_leaves=list(leaves(wanted[key]))
        row['excluded_properties']=[pointer for pointer,v in observed_leaves if isinstance(v,str) and ('[PRIVATE-APP-USER:' in v or '[REDACTED-ACCESS-SIGNATURE]' in v)]
        row['captured_property_count']=len(observed_leaves)
        row['expected_properties']=len(observed_leaves)
        row['verified_properties']=len(observed_leaves)-len(row['excluded_properties'])
        row['status']='verified' if equal(value,wanted[key]) else 'blocked'
        row['last_checked_utc']=dt.datetime.now(dt.timezone.utc).isoformat()
        counts[row['target']]=counts.get(row['target'],0)+1;properties[row['target']]=properties.get(row['target'],0)+row['verified_properties']
    report={'object_counts':counts,'captured_properties':properties,'excluded_property_leaves':sum(len(x['excluded_properties']) for x in coverage['editor_objects']),
        'failures':failures,'scope':'Exact non-redacted captured editor properties; redacted leaf pointers are explicitly excluded in coverage. Uncaptured properties are not implied verified.'}
    write_json(folder/'editor-validation.json',report);write_json(folder/'coverage.json',coverage);print(json.dumps(report))
    if failures:raise SystemExit(1)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('private');p.add_argument('folder');p.add_argument('--apply',action='store_true');p.add_argument('--verify',action='store_true');a=p.parse_args()
    if a.verify:verify(a.folder)
    else:reconcile(a.private,Path(a.folder).resolve(),a.apply)
