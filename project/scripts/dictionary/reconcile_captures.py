"""Plan/apply dictionary reconciliation from reviewed metadata captures; no live access.

AppDoc coverage is explicitly narrower than a full saved app definition. Missing UI
properties remain unresolved; writing a file does not mark its work-queue entry verified.
"""
import argparse
import collections
import copy
import datetime as dt
import hashlib
import json
import re
from pathlib import Path
from appdoc_capture import objects, html_tables
from common import ROOT, REPO, load, dump, digest, equal, write_json, atomic_write, document_paths, make_index

APP_IDS={'production-oltp':'93844270-6aa5-420b-a960-bcdf08abd357','production-olap':'e74dd368-654f-44d7-bccf-83cf361d1cdb',
 'development-oltp':'500b27b6-884a-41e8-a9ec-df801b0110ad','development-olap':'9f3422be-bc87-4a5a-a42a-67528ee80393'}

def slug(value):
    result=re.sub(r'[^a-z0-9]+','-',value.lower()).strip('-')
    return (result[:95] or 'object')+'-'+hashlib.sha256(value.encode()).hexdigest()[:8]

def leaves(value,pointer=''):
    if isinstance(value,dict) and value:
        for k,v in value.items():yield from leaves(v,pointer+'/'+str(k).replace('~','~0').replace('/','~1'))
    elif isinstance(value,list) and value:
        for i,v in enumerate(value):yield from leaves(v,pointer+'/'+str(i))
    else:yield pointer,value

def delta(before,after,pointer=''):
    result=[]
    if isinstance(before,dict) and isinstance(after,dict):
        for key in sorted(set(before)|set(after)):
            path=pointer+'/'+key.replace('~','~0').replace('/','~1')
            if key not in before:result.append({'pointer':path,'before':{'state':'absent'},'after':{'state':'value','value':after[key]}})
            elif key not in after:result.append({'pointer':path,'before':{'state':'value','value':before[key]},'after':{'state':'absent'}})
            else:result.extend(delta(before[key],after[key],path))
    elif not equal(before,after):result.append({'pointer':pointer,'before':{'state':'value','value':before},'after':{'state':'value','value':after}})
    return result

def apply_delta(base,changes):
    result=copy.deepcopy(base)
    for change in changes:
        if change['pointer']=='':
            actual={'state':'value','value':result} if result is not None else {'state':'absent'}
            if not equal(actual,change['before']):raise ValueError('Root delta guard failed')
            result=copy.deepcopy(change['after'].get('value'));continue
        tokens=[t.replace('~1','/').replace('~0','~') for t in change['pointer'].split('/')[1:]]
        parent=result
        for token in tokens[:-1]:parent=parent[token]
        key=tokens[-1]
        actual={'state':'value','value':parent[key]} if key in parent else {'state':'absent'}
        if not equal(actual,change['before']):raise ValueError('Delta old-value guard failed')
        if change['after']['state']=='absent':del parent[key]
        else:parent[key]=copy.deepcopy(change['after']['value'])
    return result

def envelope(system,component,kind,name,content,source,scope='production'):
    return {'format':1,'identity':dict(system=system,component=component,kind=kind,name=name,scope=scope),
      'verification':{'status':'documented','source':source},'content':content}

def app_content(role,key,source):
    kind,name=key
    if kind=='table':
        result={'source_app':role.upper(),'source_table':name,'binding':source['binding'],'schema':source['schema'],'columns':{}}
        for col,props in source['columns'].items():
            inventory={'App':role.upper(),'Table':name,'Column':col}
            for dest,src in {'Type':'Type','Virtual':'Virtual?','Key':'Key','Label':'Label','Read-only':'Read-Only','Hidden':'Hidden'}.items():
                if src in props:inventory[dest]=props[src]
            value={'inventory':inventory,'rules':props}
            if props.get('Type')=='Ref' and isinstance(props.get('Type Qualifier'),str):
                qualifier=json.loads(props['Type Qualifier'])
                value['relationship']={k:v for k,v in qualifier.items() if k.startswith('Referenced') or k=='IsAPartOf'}
            result['columns'][col]=value
        return result
    result={'definition':source['definition']}
    if kind=='slice':result['members']=[{'Ordinal':i+1,'Column':name} for i,name in enumerate(source['definition'].get('Slice Columns',[]))]
    return result

def postgres_objects(capture):
    sections=capture['sections'];result={}
    for relation in sections['relations']:
        schema,name=relation['schema'],relation['name']
        content={'definition':relation}
        for section in ('columns','constraints','indexes','triggers','policies'):
            content[section]={x['name']:x for x in sections[section] if x['schema']==schema and x.get('relation')==name}
        content['dependencies']=[x for x in sections['view_dependencies'] if x['schema']==schema and x['relation']==name]
        result[('relation',schema+'.'+name)]=content
    for routine in sections['routines']:
        result[('routine',routine['schema']+'.'+routine['name']+'('+routine['arguments']+')')]={'definition':routine}
    for schema in sections['schemas']:
        result[('schema',schema['name'])]={'definition':schema}
    for sequence in sections['sequences']:
        result[('sequence',sequence['schema']+'.'+sequence['name'])]={'definition':sequence}
    for typ in sections['types']:
        result[('type',typ['schema']+'.'+typ['name'])]={'definition':typ}
    remaining={k:v for k,v in sections.items() if k not in ('relations','columns','constraints','indexes','triggers','policies','routines','schemas','sequences','types','view_dependencies')}
    # Domain constraints have no owning relation; preserve them at database scope.
    remaining['unattached_constraints']=[x for x in sections['constraints'] if x['relation'] is None]
    result[('settings','Database metadata')]={'sections':remaining}
    return result

def plan(private,output):
    private=Path(private);output=Path(output);output.mkdir(parents=True,exist_ok=True)
    evidence_root=output.relative_to(REPO).as_posix()
    existing={}
    for path in document_paths(ROOT):
        doc=load(path);identity=doc['identity']
        existing[(identity['system'],identity['component'],identity['kind'],identity['name'])]=(path,doc)
    writes=[];coverage=[];summaries={};reconciliation=[];proposed_paths=set()
    def add(path,doc):
        path=Path(path);rel=path.relative_to(REPO).as_posix()
        if rel in proposed_paths:raise ValueError('Duplicate proposed path '+rel)
        proposed_paths.add(rel)
        writes.append({'path':rel,'expected_sha256':digest(path.read_bytes()) if path.exists() else None,'document':doc})
    def cover(target,key,path,content,source,status='updated',unknown=None):
        coverage.append({'target':target,'source_identity':APP_IDS.get(target,target), 'source_version_or_capture':summaries[target]['version_or_hash'],
          'object_kind':key[0],'object_name':key[1],'dictionary_path':path.relative_to(REPO).as_posix(),
          'status':status,'expected_properties':len(list(leaves(content))),'verified_properties':0,
          'unknown_properties':unknown or [],'evidence':[source],'last_checked_utc':None})
    def add_pair(system,component,prod,dev,prod_source,dev_source,pg=False):
        for key in sorted(set(prod)|set(dev)):
            kind,name=key
            current=prod.get(key)
            known=existing.get((system,component,kind,name))
            # Only unambiguous physical relation names map an imported SQL baseline.
            if pg and kind=='relation' and not known:
                for lookup in (name,name.removeprefix('public.')):
                    candidate=existing.get((system,'unassigned-database',kind,lookup))
                    if candidate and not lookup.startswith('DEV '):known=candidate;break
                if not known:known=existing.get((system,'appsheet-pg-prod-20260914',kind,name))
            directory={'table':'tables','slice':'slices','view':'views','action':'actions','format-rule':'format-rules',
              'routine':'routines','relation':'relations','schema':'schemas','sequence':'sequences','type':'types','settings':'settings'}[kind]
            base=ROOT/'systems'/system/(component if system=='appsheet' else '')/directory
            path=known[0] if known else base/(slug(name)+'.yaml')
            target='production-'+component if not pg else 'postgresql-production'
            devtarget='development-'+component if not pg else 'postgresql-development'
            if current is not None:
                content=current if pg else app_content(component,key,current)
                doc=envelope(system,component,kind,name,content,prod_source)
                doc['verification']['coverage']='catalog metadata' if pg else 'AppDoc exposed properties; editor-only gaps tracked in run coverage'
                if known:
                    doc['verification']['previous_record']={'commit':'dffa437c29a762f5b87a10b14a32063da8df07aa','path':path.relative_to(REPO).as_posix(),'identity':known[1]['identity']}
                    reconciliation.append({'path':path.relative_to(REPO).as_posix(),'previous_identity':known[1]['identity'],'current_identity':doc['identity'],'previous_sha256':digest(path.read_bytes())})
                add(path,doc)
                cover(target,key,path,current,prod_source,unknown=[] if pg else ['editor-only properties not established by AppDoc'])
            changes=delta(current,dev.get(key)) if current is not None and key in dev else []
            if key not in prod:changes=[{'pointer':'','before':{'state':'absent'},'after':{'state':'value','value':dev[key]}}]
            elif key not in dev:changes=[{'pointer':'','before':{'state':'value','value':current},'after':{'state':'absent'}}]
            if changes:
                delta_path=ROOT/'development'/system/'environment'/(component+'-'+kind+'-'+slug(name)+'.yaml')
                delta_content={'production_identity':doc['identity'] if current is not None else {'system':system,'component':component,'kind':kind,'name':name,'scope':'production'},
                  'target':summaries[devtarget]['identity'],'classification':'observed difference; ownership/intent requires review',
                  'changes':changes,'comparison_representation':'captured source object (before presentation into canonical YAML)'}
                add(delta_path,envelope(system,component,kind,name,delta_content,dev_source,'development:observed'))
                path_for_dev=delta_path
            else:path_for_dev=path
            if key in dev:cover(devtarget,key,path_for_dev,dev[key],dev_source,unknown=[] if pg else ['editor-only properties not established by AppDoc'])
        # Historical aliases stay explicitly as-recorded; never reinterpret them as live absence.
    apps={}
    for target,appid in APP_IDS.items():
        records=json.loads((private/(target+'-tables.json')).read_text(encoding='utf8'))
        if records!=html_tables(private/(target+'-appdoc.html')):raise ValueError('Independent HTML/DOM mismatch '+target)
        data,counts,settings=objects(records)
        data[('settings','AppDoc app properties')]={'definition':settings}
        apps[target]=data
        summaries[target]={'identity':appid,'version_or_hash':settings['Version'],'counts':counts,'settings':settings,'html_sha256':digest((private/(target+'-appdoc.html')).read_bytes())}
        write_json(output/(target+'-observations.json'),{'target':target,'app_id':appid,'settings':settings,'objects':[{'kind':k[0],'name':k[1],'content':v} for k,v in sorted(data.items())]})
    for role in ('oltp','olap'):
        add_pair('appsheet',role,apps['production-'+role],apps['development-'+role],evidence_root+'/production-'+role+'-observations.json',evidence_root+'/development-'+role+'-observations.json')
    sql={}
    for environment in ('production','development'):
        raw=json.loads((private/(environment+'-complete.json')).read_text(encoding='utf8'))
        sql[environment]=postgres_objects(raw)
        summaries['postgresql-'+environment]={'identity':raw['target'],'version_or_hash':raw['metadata_sha256'],'counts':{k:len(v) for k,v in raw['sections'].items()},'captured_utc':raw['captured_utc']}
        write_json(output/(environment+'-postgresql-observations.json'),raw)
    add_pair('postgresql','loan_manager_prod',sql['production'],sql['development'],evidence_root+'/production-postgresql-observations.json',evidence_root+'/development-postgresql-observations.json',pg=True)
    catalog=load(ROOT/'catalog.yaml')
    for system,kinds in {'appsheet':['format-rule'],'postgresql':['schema','sequence','type','settings']}.items():
        for kind in kinds:
            if kind not in catalog['systems'][system]['kinds']:catalog['systems'][system]['kinds'].append(kind)
    add(ROOT/'catalog.yaml',catalog)
    write_json(output/'plan.json',{'writes':writes,'sources':summaries,'coverage':coverage,'reconciled_previous_records':reconciliation})
    write_json(output/'coverage.json',{'status':'in progress','targets':summaries,'objects':coverage})
    print(json.dumps({'planned_files':len(writes),'coverage_objects':len(coverage),'reconciled_previous_records':len(reconciliation),'source_counts':{k:v['counts'] for k,v in summaries.items()}},ensure_ascii=False))

def apply(path):
    payload=json.loads(Path(path).read_text(encoding='utf8'));writes=payload['writes']
    for item in writes:
        target=(REPO/item['path']).resolve()
        if not target.is_relative_to(ROOT.resolve()):raise ValueError('Plan writes outside dictionary')
        actual=digest(target.read_bytes()) if target.exists() else None
        if actual!=item['expected_sha256']:raise ValueError('Stale file guard: '+item['path'])
        dump(item['document'])
    for item in writes:
        target=REPO/item['path']
        actual=digest(target.read_bytes()) if target.exists() else None
        if actual!=item['expected_sha256']:raise ValueError('Concurrent file change: '+item['path'])
        atomic_write(target,dump(item['document']))
    write_json(ROOT/'index.json',make_index(ROOT))
    print(json.dumps({'applied_files':len(writes)}))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='command',required=True)
    p=sub.add_parser('plan');p.add_argument('private');p.add_argument('output')
    p=sub.add_parser('apply');p.add_argument('plan')
    args=parser.parse_args()
    if args.command=='plan':plan(args.private,Path(args.output).resolve())
    else:apply(args.plan)
