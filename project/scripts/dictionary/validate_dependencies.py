"""Static cross-object checks against captured observations; never executes business SQL."""
import argparse
import collections
import json
import re
from pathlib import Path
from common import write_json

def read(path):return json.loads(Path(path).read_text(encoding='utf8'))

def provider_relation(value):
    """Observed AppSheet PostgreSQL ID: schema.table__table; underscores escaped.

    Require matching physical-name halves. Keep the untouched ID in source evidence.
    """
    match=re.fullmatch(r'([^.]+)\.(.*?)__(.*?)',value)
    if not match:raise ValueError('Unrecognized provider source ID')
    schema,left,right=match.groups()
    left=left.replace('\\_','_');right=right.replace('\\_','_')
    if left!=right:raise ValueError('Provider source-name halves differ')
    return schema+'.'+left

def validate(folder):
    folder=Path(folder);editor=read(folder/'editor-observations.json')['targets'];report={};failures=[];notes=[]
    for target in editor:
        base=read(folder/(target+'-observations.json'))['objects']
        objs={(x['kind'],x['name']):x['content'] for x in base}
        ui={(x['kind'],x['name']):x['content'] for x in editor[target]['objects']}
        tables={n:v for (k,n),v in objs.items() if k=='table'}
        slices={n:v['definition'] for (k,n),v in objs.items() if k=='slice'}
        views={n:v['definition'] for (k,n),v in objs.items() if k=='view'}
        actions={n:v['definition'] for (k,n),v in objs.items() if k=='action'}
        env=target.split('-')[0];pg=read(folder/(env+'-postgresql-observations.json'))['sections']
        relations={r['schema']+'.'+r['name']:r for r in pg['relations']}
        columns=collections.defaultdict(set)
        for c in pg['columns']:columns[c['schema']+'.'+c['relation']].add(c['name'])
        count=collections.Counter();bindings={};view_sources={};target_notes=[]
        def fail(kind,name,detail):failures.append(dict(target=target,kind=kind,name=name,detail=detail))
        for name,table in tables.items():
            source=ui.get(('table',name))
            if source:
                source_fields={x['label']:x for x in source['fields']}
                match=re.search(r'Table=([^\r\n]+)',source_fields['Source Id']['text'])
                if not match:fail('table',name,'Physical source ID not parsed');continue
                relation=provider_relation(match.group(1).strip());bindings[name]=relation
                if relation not in relations:fail('table',name,'Unresolved SQL relation: '+relation);continue
                alias='database-2' if env=='production' else 'database-3'
                if alias not in source_fields['Data Source']['text']:fail('table',name,'Wrong source alias')
                count['physical_table_bindings']+=1
                for col,props in table['columns'].items():
                    if props.get('Virtual?')=='Yes':count['virtual_columns']+=1
                    elif col=='_RowNumber':count['system_columns']+=1
                    elif col not in columns[relation]:fail('column',name+'.'+col,'Physical app column absent from bound SQL relation')
                    else:count['physical_columns']+=1
            else:
                count['generated_appdoc_tables']+=1
                target_notes.append({'kind':'table','name':name,'scope':'Generated AppDoc schema; no independent business source binding in editor Data inventory'})
            for col,props in table['columns'].items():
                if props.get('Type')!='Ref':continue
                q=json.loads(props['Type Qualifier']);ref=q.get('ReferencedTableName');key=q.get('ReferencedKeyColumn')
                if ref not in tables:fail('ref',name+'.'+col,'Missing referenced app table: '+str(ref))
                elif key and key not in tables[ref]['columns']:fail('ref',name+'.'+col,'Missing referenced key: '+str(key))
                else:count['refs']+=1
        for name,s in slices.items():
            src=s.get('Source Table')
            if src not in tables:fail('slice',name,'Missing source table');continue
            for col in s.get('Slice Columns',[]):
                if col not in tables[src]['columns']:fail('slice',name,'Missing member: '+col)
                else:count['slice_members']+=1
            for action in s.get('Slice Actions',[]):
                if action!='**auto**' and src+'.'+action not in actions:fail('slice',name,'Missing action: '+action)
            count['slices']+=1
        for name,v in views.items():
            data=ui.get(('view',name))
            if not data:fail('view',name,'Missing editor source evidence');continue
            source=data['generated_source_group']
            for field in data['fields']:
                if field['label']=='For this data':
                    values=[c['value'] for c in field['controls']]
                    if len(values)!=1:fail('view',name,'Ambiguous source control')
                    else:source=values[0]
            if source:
                if source not in tables and source not in slices:fail('view',name,'Missing data source: '+source)
                view_sources[name]=source;count['view_sources']+=1
            elif v.get('View type')!='dashboard':fail('view',name,'Non-dashboard has no source evidence')
            else:count['dashboard_views']+=1
            config=json.loads(v.get('View configuration','{}'))
            for entry in config.get('ViewEntries',[]):
                if entry['ViewName'] not in views:fail('view',name,'Missing dashboard member: '+entry['ViewName'])
                else:count['dashboard_members']+=1
        for name,a in actions.items():
            src=a.get('For a record of this table')
            if src not in tables:fail('action',name,'Missing owning table: '+str(src))
            else:count['action_owners']+=1
            config=json.loads(a['With these properties'])
            destination=config.get('ReferencedTable') or src
            if destination not in tables:fail('action',name,'Missing referenced table: '+str(destination));continue
            referenced=config.get('ReferencedAction')
            if referenced:
                if destination+'.'+referenced not in actions:fail('action',name,'Missing referenced action: '+referenced)
                else:count['referenced_actions']+=1
            assignments=config.get('Assignments',[])
            if config.get('ColumnToEdit'):assignments=assignments+[{'ColumnToEdit':config['ColumnToEdit']}]
            for assignment in assignments:
                col=assignment.get('ColumnToEdit')
                if col not in tables[destination]['columns']:fail('action',name,'Missing assigned column: '+str(col))
                else:count['assigned_columns']+=1
            for entry in config.get('Actions',[]):
                child=entry['ActionName']
                if src+'.'+child not in actions:fail('action',name,'Missing grouped action: '+child)
                else:count['grouped_actions']+=1
        for (kind,name),value in objs.items():
            if kind!='format-rule':continue
            rule=value['definition'];src=rule.get('For this data')
            if src not in tables:fail('format-rule',name,'Missing source table');continue
            for member in rule.get('Format these columns and actions',[]):
                if member not in tables[src]['columns'] and src+'.'+member not in actions:fail('format-rule',name,'Unresolved column/action: '+member)
                else:count['format_members']+=1
            count['format_rules']+=1
        report[target]={'verified':dict(count),'source_bindings':bindings,'view_sources':view_sources,'explicit_exclusions':target_notes}
    connections={x['alias']:x['values'] for x in read(folder/'source-connections.json')}
    for alias,database in [('database-2','loan_manager_prod'),('database-3','loan_manager_dev')]:
        if connections[alias]['dbDatabase']!=database or connections[alias]['dbServer']!='136.85.127.134':failures.append({'connection':alias,'error':'Unexpected database/host'})
    for env in ['production','development']:
        pg=read(folder/(env+'-postgresql-observations.json'))['sections'];count=collections.Counter()
        relations={(x['schema'],x['name']) for x in pg['relations']}
        columns={(x['schema'],x['relation'],x['name']) for x in pg['columns']}
        routines={(x['schema'],x['name']) for x in pg['routines']}
        for row in pg['view_dependencies']:
            if (row['schema'],row['relation']) not in relations or (row['referenced_schema'],row['referenced_relation']) not in relations:
                failures.append({'target':env,'view_dependency':row})
            elif row['referenced_column'] and (row['referenced_schema'],row['referenced_relation'],row['referenced_column']) not in columns:
                failures.append({'target':env,'view_column_dependency':row})
            else:count['view_dependency_edges']+=1
        for row in pg['triggers']:
            if row['internal']:count['internal_integrity_triggers']+=1;continue
            symbol=row['routine'].split('(')[0].replace('"','');parts=symbol.split('.')
            key=tuple(parts) if len(parts)==2 else ('public',symbol)
            if key not in routines:failures.append({'target':env,'trigger':row['name'],'unresolved_routine':row['routine']})
            else:count['user_trigger_routine_links']+=1
        report['postgresql-'+env]={'verified':dict(count)}
    result={'targets':report,'failures':failures,'limitations':['Expression text is not a complete static dependency parser. Dynamic SQL and runtime behavior require separate validation.','Trigger checks resolve routine symbols, not overload argument types. Exact full signatures and definitions are retained separately.','Connection aliases were independently read in account source settings; blank username controls do not establish the effective connection role.']}
    write_json(folder/'dependency-validation.json',result)
    print(json.dumps({'targets':{k:v['verified'] for k,v in report.items()},'failures':failures},ensure_ascii=False))
    if failures:raise SystemExit(1)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('folder');validate(p.parse_args().folder)
