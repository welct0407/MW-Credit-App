"""Verify persisted dictionary values against saved observations, never edit payloads."""
import collections
import datetime as dt
import json
from pathlib import Path
from common import REPO,ROOT,load,equal,write_json,document_paths,digest
from reconcile_captures import apply_delta,leaves

def captured_app(content,kind):
    if kind=='table':return {'binding':content['binding'],'schema':content['schema'],'columns':{name:col['rules'] for name,col in content['columns'].items()}}
    return {'definition':content['definition']}

def verify(folder):
    folder=Path(folder);coverage=json.loads((folder/'coverage.json').read_text(encoding='utf8'))
    source={};failures=[];source_counts={}
    for target in coverage['targets']:
        if target.startswith('postgresql-'):
            env=target.split('-',1)[1];raw=json.loads((folder/(env+'-postgresql-observations.json')).read_text(encoding='utf8'))
            sections=raw['sections'];expected={}
            for rel in sections['relations']:
                schema,name=rel['schema'],rel['name'];c={'definition':rel}
                for section in ('columns','constraints','indexes','triggers','policies'):
                    rows=[r for r in sections[section] if r['schema']==schema and r.get('relation')==name]
                    if len({r['name'] for r in rows})!=len(rows):raise ValueError('Duplicate source row')
                    c[section]={r['name']:r for r in rows}
                c['dependencies']=[r for r in sections['view_dependencies'] if r['schema']==schema and r['relation']==name]
                expected[('relation',schema+'.'+name)]=c
            for section,kind in [('routines','routine'),('schemas','schema'),('sequences','sequence'),('types','type')]:
                for row in sections[section]:
                    name=row['name'] if kind=='schema' else row['schema']+'.'+row['name']
                    if kind=='routine':name+='('+row['arguments']+')'
                    expected[(kind,name)]={'definition':row}
            rest={k:v for k,v in sections.items() if k not in ('relations','columns','constraints','indexes','triggers','policies','routines','schemas','sequences','types','view_dependencies')}
            rest['unattached_constraints']=[r for r in sections['constraints'] if r['relation'] is None]
            expected[('settings','Database metadata')]={'sections':rest}
        else:
            raw=json.loads((folder/(target+'-observations.json')).read_text(encoding='utf8'))
            expected={(x['kind'],x['name']):x['content'] for x in raw['objects']}
            if len(expected)!=len(raw['objects']):raise ValueError('Duplicate observed AppSheet identity')
        source[target]=expected
        actual_keys=[(x['object_kind'],x['object_name']) for x in coverage['objects'] if x['target']==target]
        if set(actual_keys)!=set(expected) or len(actual_keys)!=len(expected):failures.append({'target':target,'error':'Coverage identity set differs from source'})
        source_counts[target]=len(expected)
    prod_paths={(x['target'],x['object_kind'],x['object_name']):x['dictionary_path'] for x in coverage['objects'] if x['target'].startswith('production-') or x['target']=='postgresql-production'}
    now=dt.datetime.now(dt.timezone.utc).isoformat();verified=collections.Counter()
    for item in coverage['objects']:
        target=item['target'];kind=item['object_kind'];name=item['object_name'];path=REPO/item['dictionary_path']
        doc=load(path);isdev=target.startswith('development-') or target=='postgresql-development'
        if isdev and doc['identity']['scope'].startswith('development:'):
            prodtarget=target.replace('development','production');base_path=prod_paths.get((prodtarget,kind,name))
            base=None
            if base_path:
                d=load(REPO/base_path)
                base=d['content'] if target.startswith('postgresql-') else captured_app(d['content'],kind)
            observed=apply_delta(base,doc['content']['changes'])
        else:observed=doc['content'] if target.startswith('postgresql-') else captured_app(doc['content'],kind)
        expected=source[target][(kind,name)]
        if not equal(observed,expected):
            actual=dict(leaves(observed));wanted=dict(leaves(expected))
            mismatches=[k for k in set(actual)|set(wanted) if k not in actual or k not in wanted or not equal(actual[k],wanted[k])]
            failures.append({'target':target,'kind':kind,'name':name,'mismatches':sorted(mismatches)})
            item['status']='blocked';continue
        item['verified_properties']=len(list(leaves(expected)))
        item['expected_properties']=item['verified_properties']
        item['last_checked_utc']=now
        item['source_identity']=coverage['targets'][target]['identity']
        item['status']='verified' if not item['unknown_properties'] else 'updated'
        verified[target]+=item['verified_properties']
    source_paths=set(prod_paths.values()) | {x['dictionary_path'] for x in coverage.get('editor_objects',[]) if x['target'].startswith('production-')}
    extra=[]
    for path in document_paths(ROOT):
        doc=load(path);identity=doc['identity']
        if identity['system'] in ('appsheet','postgresql') and identity['scope']=='production' and path.relative_to(REPO).as_posix() not in source_paths:
            extra.append(path.relative_to(REPO).as_posix())
    if extra:failures.append({'error':'Canonical production objects missing from coverage','paths':extra})
    result={'checked_utc':now,'source_object_counts':source_counts,'exact_properties_verified':dict(verified),'failures':failures,
      'scope':'All captured AppDoc and SQL catalog properties; remaining UI/semantic/stability checks are separately tracked.'}
    write_json(folder/'exact-value-validation.json',result);write_json(folder/'coverage.json',coverage)
    print(json.dumps(result,ensure_ascii=False))
    if failures:raise SystemExit(1)

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('folder');verify(p.parse_args().folder)
