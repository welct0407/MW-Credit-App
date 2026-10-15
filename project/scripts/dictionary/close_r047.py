"""Close only R046/R047 dictionary objects from saved production evidence.

Uses the dictionary helper's hash/old-value guarded planner, then one batch index.
Default is plan only; --apply publishes the reviewed local documentation batch.
"""
import copy
import json
import sys
from pathlib import Path
from common import ROOT, REPO, load, dump, digest, atomic_write, make_index, write_json
from dictionary import plan_update, validate
import yaml
from reconcile_captures import app_content, envelope, slug

OUT = REPO / 'outputs/r047-production'
EVIDENCE = 'outputs/r047-production/production-verification.json'

def main(apply=False):
    paths = list((ROOT/'systems/appsheet').rglob('*.yaml')) + list((ROOT/'systems/postgresql').rglob('*.yaml'))
    objects = {}
    for p in paths:
        d = load(p)
        i = d['identity']
        objects[(i['system'],i['component'],i['kind'],i['name'])]=(p,d)
    candidates=[]
    def stage(key, content, evidence):
        if key in objects:
            path,old=objects[key]
            changes=[]
            for field,value in content.items():
                if old['content'].get(field)==value: continue
                changes.append({'pointer':'/content/'+field, 'expected':{'state':'value','value':old['content'][field]} if field in old['content'] else {'state':'absent'},'target':{'state':'value','value':value}})
            if changes:
                patch={'file':path.relative_to(ROOT).as_posix(),'expected_sha256':digest(path.read_bytes()),'evidence':evidence,'reason':'R046/R047 promotion; saved production object readback','changes':changes}
                p,b,a,report=plan_update(ROOT,patch,validate_candidate=False);candidates.append((p,b,a,report))
        else:
            system,component,kind,name=key
            folder={'action':'actions','view':'views','slice':'slices','routine':'routines'}[kind]
            base=ROOT/'systems'/system
            if system=='appsheet':base/=component
            path=base/folder/(slug(name)+'.yaml')
            assert not path.exists(),path
            doc=envelope(system,component,kind,name,content,evidence)
            candidates.append((path,None,dump(doc).encode('utf8'),{'file':path.relative_to(ROOT).as_posix(),'new':True}))
    for role in ('oltp','olap'):
        ev=f'outputs/r047-production/{role}-affected-definitions.json'
        data=json.loads((REPO/ev).read_text(encoding='utf8'))
        for name,source in data['tables'].items():
            key=('appsheet',role,'table',name)
            new=app_content(role,('table',name),source)
            old=objects[key][1]['content']
            # Only observed columns replace existing columns; preserve unrelated editor metadata.
            columns=copy.deepcopy(old['columns'])
            for col,value in new['columns'].items():
                retained=copy.deepcopy(columns.get(col,{}));retained.update(value);columns[col]=retained
            new['columns']=columns
            stage(key,new,ev)
        if role=='oltp':data['other']+=json.loads((OUT/'collection-definitions.json').read_text(encoding='utf8'))
        for item in data['other']:
            props=item['props']
            if 'Slice Name' in props:kind,name='slice',props['Slice Name']
            elif 'View name' in props:kind,name='view',props['View name']
            else:kind,name='action',props['For a record of this table']+'.'+props['Action name']
            stage(('appsheet',role,kind,name),app_content(role,(kind,name),{'definition':props}),ev if name not in ('Todays Collection Board','Todays Collection Board_Detail') else 'outputs/r047-production/collection-definitions.json')
    pg=json.loads((OUT/'postgresql-affected-definitions.json').read_text(encoding='utf8'))['sections']
    stage(('postgresql','loan_manager_prod','relation','public.Payments'),{k:{x['name']:x for x in pg[k]} for k in ('columns','triggers')},'outputs/r047-production/postgresql-affected-definitions.json')
    for r in pg['routines']:
        stage(('postgresql','loan_manager_prod','routine',r['schema']+'.'+r['name']+'('+r['arguments']+')'),{'definition':r},'outputs/r047-production/postgresql-affected-definitions.json')
    for system in ('appsheet','postgresql'):
        for release in ('r046','r047'):
            for path in (ROOT/'development'/system/release).glob('*.yaml'):
                old=load(path);content=copy.deepcopy(old['content'])
                content['status']='Promoted and closed 2026-09-27; retained as dated DEV implementation evidence'
                content['promotion']={'releases':['R046','R047'],'evidence':EVIDENCE,'production_versions':{'OLTP':'3.000252','OLAP':'1.100205','PostgreSQL':'52'},'remaining_environment_difference':'DEV sources/theme/owner-only delivery and manual-receipts/dev remain intentional; PROD uses manual-receipts/prod.'}
                changes=[{'pointer':'/content/'+field,'expected':{'state':'value','value':old['content'][field]} if field in old['content'] else {'state':'absent'},'target':{'state':'value','value':content[field]}} for field in ('status','promotion')]
                patch={'file':path.relative_to(ROOT).as_posix(),'expected_sha256':digest(path.read_bytes()),'evidence':EVIDENCE,'reason':'Close promoted release overlay; retain dated implementation values','changes':changes}
                p,b,a,report=plan_update(ROOT,patch,validate_candidate=False);candidates.append((p,b,a,report))
    validation=validate(ROOT,check_index=False,overrides={p.relative_to(ROOT).as_posix():yaml.safe_load(a) for p,b,a,r in candidates})
    if validation['errors']:raise ValueError(validation['errors'])
    report=[{'file':r['file'],'new':b is None,'before_sha256':digest(b) if b is not None else None,
             'after_sha256':digest(a),'changed_pointers':[c['pointer'] for c in r.get('changes',[])]}
            for p,b,a,r in candidates]
    write_json(OUT/'dictionary-closure-plan.json',report)
    print(json.dumps({'objects':len(candidates),'new':sum(b is None for _,b,_,_ in candidates),'apply':apply}))
    if not apply:return
    # Check every baseline before the coherent batch; no overwrite of intervening work.
    for p,b,a,r in candidates:
        assert (not p.exists()) if b is None else p.read_bytes()==b,p
    for p,b,a,r in candidates:
        p.parent.mkdir(parents=True,exist_ok=True);atomic_write(p,a)
        assert p.read_bytes()==a,p
    write_json(ROOT/'index.json',make_index(ROOT))

if __name__=='__main__':main('--apply' in sys.argv)
