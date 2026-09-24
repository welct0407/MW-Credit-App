"""Close the 2026-09-24 reconciliation record from completed evidence, offline.

Run after exact/editor/dependency verification. Does not modify observed values.
"""
import argparse
import collections
import datetime as dt
import json
from pathlib import Path
from common import ROOT,REPO,load,dump,atomic_write,write_json,make_index,digest
from reconcile_captures import envelope,leaves

def read(path):return json.loads(Path(path).read_text(encoding='utf8'))

def close(private,folder):
    private=Path(private);folder=Path(folder);now=dt.datetime.now(dt.timezone.utc).isoformat()
    coverage=read(folder/'coverage.json');editor=read(folder/'editor-observations.json')
    for name in ['exact-value-validation.json','editor-validation.json','dependency-validation.json']:
        if read(folder/name)['failures']:raise ValueError('Unresolved comparison failures: '+name)
    final=read(private/'final-editor-status.json')
    if len(final)!=4 or len({x['target'] for x in final})!=4:raise ValueError('Missing final app state')
    for row in final:
        if row['version']!=coverage['targets'][row['target']]['version_or_hash'] or not row['saveDisabled'] or not row['noIssues']:
            raise ValueError('Final app state changed')
    write_json(folder/'final-editor-status.json',final)
    template=read(folder/'export-template-observations.json')
    template_path=ROOT/'systems/appsheet/olap/automations/daily-analysis-export-template.yaml'
    template_doc=envelope('appsheet','olap','automation','Loan_Daily_Analysis_Template.xlsx',template,
        'outputs/dictionary-reconciliation-20260924/export-template-observations.json',scope='shared-template:observed')
    atomic_write(template_path,dump(template_doc))
    for row in coverage['editor_objects']:
        if row['target']=='production-olap' and row['object_name']=='Tasks: Task for Create Daily Loan Analysis Workbook':
            path=REPO/row['dictionary_path'];doc=load(path)
            doc['content']['template_dependency']=template_path.relative_to(REPO).as_posix()
            atomic_write(path,dump(doc))
    # Retain the historical values, but remove ambiguity about their precedence.
    for stem in ['reporting_cash_period','reporting_cash_period_entries']:
        path=ROOT/'systems/postgresql/reporting'/f'{stem}.yaml';doc=load(path)
        current=next(x['dictionary_path'] for x in coverage['objects'] if x['target']=='postgresql-production' and x['object_kind']=='routine' and x['object_name'].startswith('public.'+stem+'('))
        doc['identity']['scope']='historical:R016'
        doc['verification']['current_definition']=current
        doc['verification']['note']='Retained R016 declaration; current full signed routine identity is linked separately.'
        atomic_write(path,dump(doc))
    for stem,name in [('dev-borrowers','public.Borrowers'),('dev-business-expenses','public.Business Expenses')]:
        path=ROOT/'systems/postgresql/relations'/f'{stem}.yaml'
        if not path.exists():continue
        doc=load(path)
        current=next(x['dictionary_path'] for x in coverage['objects'] if x['target']=='postgresql-production' and x['object_kind']=='relation' and x['object_name']==name)
        doc['verification']['current_definition']=current
        doc['verification']['note']='Historical imported label retained unchanged; use the current canonical relation and verified DEV overlay.'
        atomic_write(path,dump(doc))
    for path in (ROOT/'development').rglob('*.yaml'):
        doc=load(path);identity=doc['identity']
        if not identity['scope'].startswith('development:'):continue
        kind=identity['kind'];system=identity['system'];content=doc['content']
        if system=='postgresql':
            content['classification']={
              'relation':'Observed ACL, column-order and environment-specific internal trigger/constraint identifiers; PROD-only cron metadata retained as explicit absence in DEV.',
              'routine':'Six shared routine bodies differ only in CR line endings; seven cron extension routines are absent in DEV. Exact text preserved.',
              'schema':'Observed environment privileges and PROD-only cron namespace.',
              'sequence':'PROD-only cron sequences, absent in DEV.',
              'settings':'Observed database identity, role/ACL settings, PROD-only pg_cron and job, and Flyway deployment metadata.'}.get(kind,'Observed metadata difference')
        else:
            content['classification']={
              'table':'Observed environment source/generated identifiers and locale representation. PROD locale blank versus DEV en-US is not an approved policy change.',
              'action':'Environment-specific companion-app navigation target.',
              'view':'Captured source controls and choices match; supporting editor text/App links differ by environment or UI presentation.',
              'settings':'Environment app identity/version/folder/theme/access and supporting UI text; exact differences retained.'}.get(kind,'Observed saved configuration difference')
        atomic_write(path,dump(doc))
    registry=load(ROOT/'catalog.yaml')
    for system in ['appsheet','postgresql']:
        registry['systems'][system]['status']='documented-with-historical-imports'
    atomic_write(ROOT/'catalog.yaml',dump(registry))
    unresolved=load(ROOT/'unresolved.yaml')
    for item in unresolved['items']:
        if item['id']=='UNRECONCILED':
            item['detail']='Current AppSheet and PostgreSQL definitions reconciled on 2026-09-24. Historical imports and Metabase definitions retain their recorded provenance; this audit does not establish current Metabase/Grafana truth.'
        elif item['id'] in ['SUPPLEMENTS','DEV-HISTORY']:
            item['status']='resolved';item['detail']='Current AppSheet/PostgreSQL values and DEV overlays now come from independent live captures. Retained historical workbook records are dated evidence and are never automatic overrides.'
            item['resolution_evidence']='outputs/dictionary-reconciliation-20260924/README.md'
        elif item['id']=='LABELS':
            item['detail']='Current AppSheet/PostgreSQL target identities established independently. Historical labels remain unchanged; ambiguous Metabase instance identities remain outside this task.'
        elif item['id']=='COVERAGE':
            item['detail']='AppSheet actions/views/automation and PostgreSQL definitions now have current metadata records. Grafana and current Metabase/dashboard inventories remain outside this scoped reconciliation.'
    new=[
      {'id':'TABLE-LOCALE-POLICY','status':'deferred','detail':'All 37 PROD business table Locale controls are blank; corresponding DEV controls are en-US. Exact settings verified; intended policy and effective inherited locale not established. No live change performed.'},
      {'id':'TEMPLATE-ENVIRONMENT-LABEL','status':'informational','detail':'Both OLAP apps reference one disabled export template with literal PROD app ID/name and Asia/Singapore timezone label. This can mislabel a future DEV export. Template references resolve; no export executed.'},
      {'id':'PRIVACY-EXCLUSIONS','status':'informational','detail':'Personal app-user identity and signed logo access signatures are retained only in private evidence and explicitly redacted from current public records. Published placeholders are not working configuration values.'}]
    unresolved['items']=[x for x in unresolved['items'] if x['id'] not in {n['id'] for n in new}]+new
    atomic_write(ROOT/'unresolved.yaml',dump(unresolved))
    for target,meta in coverage['targets'].items():
        if target.startswith('postgresql-'):
            env=target.split('-')[1];source=read(folder/(env+'-postgresql-observations.json'))
            meta['version_or_hash']=source['metadata_sha256'];meta['counts']={k:len(v) for k,v in source['sections'].items()}
    for row in coverage['objects']:
        row['unknown_properties']=[]
        row['expected_properties']=row['verified_properties']
        row['status']='verified';row['source_version_or_capture']=coverage['targets'][row['target']]['version_or_hash']
        row['property_scope']='All captured AppDoc/catalog properties; editor supplement coverage recorded separately. Exclusions listed at run level.'
    for row in coverage['editor_objects']:
        target=row['target'];row['source_identity']=coverage['targets'][target]['identity']
        row['source_version_or_capture']=coverage['targets'][target]['version_or_hash']
        row['expected_properties']=row['captured_property_count'];row['verified_properties']=row['captured_property_count']-len(row.get('excluded_properties',[]))
        row['unknown_properties']=[];row['evidence']=['outputs/dictionary-reconciliation-20260924/editor-observations.json']
        row['last_checked_utc']=now;row['status']='verified'
    coverage['supplemental_objects']=[{'target':target,'source_identity':template['id'],'source_version_or_capture':template['sha256'],
        'object_kind':'template','object_name':template_doc['identity']['name'],'dictionary_path':template_path.relative_to(REPO).as_posix(),
        'status':'verified','expected_properties':len(list(leaves(template))),'verified_properties':len(list(leaves(template))),
        'unknown_properties':[],'evidence':['outputs/dictionary-reconciliation-20260924/export-template-observations.json'],'last_checked_utc':now}
        for target in ['production-olap','development-olap']]
    coverage['status']='Complete for discovered saved metadata, with explicit privacy/scope exclusions and documented interpretation findings'
    coverage['exclusions']=[
        {'kind':'sensitive-literal','targets':['production-oltp','production-olap'],'property':'Personal additional app-user email','reason':'Private contact identity retained privately; access roles and policies captured.'},
        {'kind':'transport-credential','targets':list(editor['targets']),'property':'Signed logo URL access signature','reason':'Credential excluded; resource identity retained.'},
        {'kind':'database-system-internals','targets':['postgresql-production','postgresql-development'],'property':'pg_catalog/information_schema objects and vendor implementation audit','reason':'System internals outside user-defined dictionary scope; extension inventory and relevant extension-owned metadata retained.'},
        {'kind':'runtime','targets':list(coverage['targets']),'property':'Business rows, expression execution, recipient delivery, exports and dynamic SQL behavior','reason':'Read-only metadata task does not authorize behavioral execution or operational row inspection.'}]
    coverage['interpretation_gaps']=['Effective inherited PROD locale and intended locale policy are unknown; saved blank and en-US values are verified.','Source editor username control was blank; effective source connection role is not asserted from that control.']
    coverage['counting']='objects and editor_objects are independently verified source facets, with overlapping table/view identities; union by target/kind/name for distinct object totals. Column/constraint/trigger counts are nested, not extra owning YAML identities.'
    write_json(folder/'coverage.json',coverage)
    # The original guarded plan predates editor/role supplements. Preserve privately
    # and publish only its non-replayable change manifest, avoiding duplicate bodies.
    plan_path=folder/'plan.json';plan=read(plan_path)
    if 'writes' in plan and any('document' in x for x in plan['writes']):
        backup=private/'original-reconciliation-plan.json'
        if not backup.exists():backup.write_bytes(plan_path.read_bytes())
        compact={'purpose':'Dated initial AppDoc/SQL write manifest, not replayable; final coverage is authoritative.',
          'original_sha256':digest(plan_path.read_bytes()),'writes':[{k:v for k,v in x.items() if k not in ['document','content','payload']} for x in plan['writes']],
          'reconciled_previous_records':plan['reconciled_previous_records']}
        # Whitelist only path and guard/hash metadata; never duplicate object bodies.
        compact['writes']=[{k:v for k,v in x.items() if k in ['path','file','expected_sha256','before_sha256','sha256','reason']} for x in compact['writes']]
        write_json(plan_path,compact)
    write_json(ROOT/'index.json',make_index(ROOT))
    print(json.dumps({'closed':True,'base_facets':len(coverage['objects']),'editor_facets':len(coverage['editor_objects']),'template_facets':2}))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('private');p.add_argument('folder');a=p.parse_args();close(a.private,Path(a.folder).resolve())
