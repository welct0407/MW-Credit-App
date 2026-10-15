"""Evidence checks for selected workflow lineage and exact DEV/PROD differences.

This is a bounded source-text check, not SQL/AppSheet execution or a full parser.
"""
import argparse
import json
import re
from pathlib import Path
from common import write_json

def review(folder):
    folder=Path(folder)
    def read(name):return json.loads((folder/name).read_text(encoding='utf8'))
    databases={env:read(env+'-postgresql-observations.json')['sections'] for env in ['production','development']}
    functions={env:{(r['schema'],r['name'],r['arguments']):r for r in data['routines']} for env,data in databases.items()}
    differences=[];failures=[]
    for key in sorted(functions['production'].keys()&functions['development'].keys()):
        before=functions['production'][key]['definition'];after=functions['development'][key]['definition']
        if before!=after:
            differences.append({'routine':list(key),'definition_equal_ignoring_CR':before.replace('\r','')==after.replace('\r','')})
    calls=[('public.quick_payment_request','public.Payments','relation'),
      ('public.process_lump_sum','public.post_payment','routine'),
      ('public.post_payment','public.payment_charge_balances','routine'),
      ('public.post_payment','public.close_payment_loans','routine'),
      ('public.analytics_refresh_request','public.refresh_daily_analytics','routine'),
      ('public.analytics_refresh_request','public.olap_reporting_date','routine'),
      ('public.cash_source_changed','public.sync_cash_ledger','routine'),
      ('public.charge_generation_request','public.generate_loan_charge','routine'),
      ('public.first_day_loan_trigger','public.create_first_day_charge','routine'),
      ('assessment_lab.calculate_row','assessment_lab.inputs','routine'),
      ('assessment_lab.calculate_row','assessment_lab.forecast','routine')]
    lineage={}
    for env,funcs in functions.items():
        checked=[]
        for source,target,kind in calls:
            ss,sn=source.split('.');ts,tn=target.split('.')
            rows=[r for k,r in funcs.items() if k[:2]==(ss,sn)]
            if kind=='routine':exists=any(k[:2]==(ts,tn) for k in funcs)
            else:exists=any(r['schema']==ts and r['name']==tn for r in databases[env]['relations'])
            pattern=re.escape(ts)+r'\."?'+re.escape(tn)+r'"?'
            matching=[r['arguments'] for r in rows if re.search(pattern,r['definition'])]
            record={'source':source,'target':target,'kind':kind,'matching_source_signatures':matching,'target_exists':exists}
            checked.append(record)
            if not matching or not exists:failures.append({'environment':env,**record})
        lineage[env]=checked
    editor=read('editor-observations.json')['targets'];parity={}
    for role in ['oltp','olap']:
        p={(x['kind'],x['name']):x['content'] for x in editor['production-'+role]['objects']}
        d={(x['kind'],x['name']):x['content'] for x in editor['development-'+role]['objects']}
        changed=[];count=0
        for key in p.keys()&d.keys():
            if key[0]!='view' and not key[1].startswith('Tasks:'):continue
            def values(obj):return [(x['label'],x.get('controls'),x.get('choices')) for x in obj.get('fields',[])]
            count+=1
            if values(p[key])!=values(d[key]):changed.append(list(key))
        parity[role]={'views_and_named_tasks_compared':count,'changed_controls_or_choices':changed}
    result={'routine_body_differences':differences,'selected_workflow_symbol_edges':lineage,'editor_control_parity':parity,
      'failures':failures,'limits':['Symbol presence establishes saved textual lineage only, not runtime execution or overload resolution.','No financial rows, mutations, notifications or exports executed.','CR-insensitive comparison only classifies differences; exact stored definitions are unchanged.']}
    write_json(folder/'semantic-review.json',result)
    print(json.dumps({'routine_body_differences':differences,'control_parity':parity,'failures':failures}))
    if failures:raise SystemExit(1)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('folder');review(p.parse_args().folder)
