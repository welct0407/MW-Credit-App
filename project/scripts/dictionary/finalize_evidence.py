"""Finalize dated capture evidence and PostgreSQL metadata supplements, offline."""
import argparse
import datetime as dt
from pathlib import Path
from common import ROOT,REPO,load,dump,atomic_write,write_json,equal,make_index,digest
from reconcile_editor import read
from reconcile_captures import postgres_objects,delta

def finalize(private,folder):
    private=Path(private);folder=Path(folder);coverage=read(folder/'coverage.json');stability={}
    for target in ('production-oltp','production-olap','development-oltp','development-olap'):
        first=read(private/(target+'-tables.json'));last=read(private/(target+'-final-tables.json'))
        if not equal(first,last):raise ValueError('AppDoc moved: '+target)
        stability[target]={'equal':True,'tables':len(first),'comparison':'All ordered table records and exact typed property values',
            'final_evidence_saved_utc':dt.datetime.fromtimestamp((private/(target+'-final-tables.json')).stat().st_mtime,dt.timezone.utc).isoformat()}
    sql={}
    for env in ('production','development'):
        original=read(private/(env+'-complete.json'));latest=read(private/(env+'-final.json'))
        differences=[k for k,v in original['sections'].items() if not equal(v,latest['sections'][k])]
        if differences:raise ValueError('Existing SQL sections moved: '+str(differences))
        stability['postgresql-'+env]={'equal':True,'initial_capture_utc':original['captured_utc'],
            'final_capture_utc':latest['captured_utc'],'initial_metadata_sha256':original['metadata_sha256'],
            'final_metadata_sha256':latest['metadata_sha256'],
            'comparison':'All original sections unchanged; added role/replication sections captured at final time',
            'added_sections':sorted(set(latest['sections'])-set(original['sections']))}
        sql[env]=latest
    entries={x['target']:x for x in coverage['objects'] if x['object_kind']=='settings' and x['object_name']=='Database metadata' and x['target'].startswith('postgresql-')}
    prod=postgres_objects(sql['production'])[('settings','Database metadata')]
    dev=postgres_objects(sql['development'])[('settings','Database metadata')]
    for env in ('production','development'):
        path=REPO/entries['postgresql-'+env]['dictionary_path'];guard=digest(path.read_bytes());doc=load(path)
        if env=='production':doc['content']=prod
        else:doc['content']['changes']=delta(prod,dev)
        if digest(path.read_bytes())!=guard:raise ValueError('Concurrent metadata edit')
        atomic_write(path,dump(doc))
        write_json(folder/(env+'-postgresql-observations.json'),sql[env])
        target=coverage['targets']['postgresql-'+env]
        target['metadata_sha256']=sql[env]['metadata_sha256'];target['captured_utc']=sql[env]['captured_utc']
    connections=read(private/'source-identities.json')
    by_alias={x['alias']:x for x in connections}
    for alias,dbname in [('database-2','loan_manager_prod'),('database-3','loan_manager_dev')]:
        values=by_alias[alias]['values']
        if values['dbServer']!='136.85.127.134' or values['dbDatabase']!=dbname or values['dbRequireSSL']['value']!='true':raise ValueError('Source connection mismatch')
    write_json(folder/'source-connections.json',connections)
    write_json(folder/'source-stability.json',stability)
    write_json(folder/'coverage.json',coverage);write_json(ROOT/'index.json',make_index(ROOT))
    print('Source stability and database/connection supplements verified')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('private');p.add_argument('folder');a=p.parse_args();finalize(a.private,Path(a.folder).resolve())
