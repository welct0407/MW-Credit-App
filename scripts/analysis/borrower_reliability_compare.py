"""Compare predeclared reliability designs offline; does not optimize quadrant counts."""
from collections import defaultdict
import datetime as dt
import json
from pathlib import Path
import statistics
import argparse
from borrower_matrix_simulate import revised_at, counts, date, num, repayment_timing

CANDIDATES={
 "A_corrected_original":{"weights":(.45,.20,.20,.15),"severity_mode":"worst"},
 "B_mean_delay_same_weights":{"weights":(.45,.20,.20,.15),"severity_mode":"average"},
 "C_recent50_history20_delay15_current15":{"weights":(.50,.20,.15,.15),"severity_mode":"average"},
 "D_recent45_history15_delay15_current25":{"weights":(.45,.15,.15,.25),"severity_mode":"average"},
 "E_D_equal_due_day":{"weights":(.45,.15,.15,.25),"severity_mode":"average","day_weighted":True,"day_fraction":True},
}

def compare(snapshot):
    assert snapshot.resolve().is_relative_to((Path.home()/"Documents/ChatGPT").resolve())
    data=json.loads(snapshot.read_text(encoding="utf-8"));today=date(data['identity']['business_date']);rows=data['rows']
    loans={l['Row ID']:l for l in rows['Loans']};bycharge=defaultdict(list);byborrower=defaultdict(list)
    for r in rows['Repayments']:bycharge[r['Ref Charges']].append(r)
    for c in rows['Charges']:byborrower[loans[c['Ref Loans']]['Ref Borrowers']].append(c)
    summary={};details={}
    for name,params in CANDIDATES.items():
        result=revised_at(data,today,current_day=True,**params);details[name]=result
        summary[name]={"weights":params['weights'],"counts":counts(result),
          "established":counts([r for r in result if r['sufficient']]),"provisional":counts([r for r in result if not r['sufficient']]),
          "high_reliability_with_1plus_days_overdue":sum(r['reliable'] and r['current_days']>0 for r in result),
          "high_reliability_with_2plus_days_overdue":sum(r['reliable'] and r['current_days']>=2 for r in result),
          "near80":sum(abs(r['score']-80)<=5 for r in result),"history_checks":[]}
        for back in [21,14,7]:
            at=today-dt.timedelta(days=back);hist=revised_at(data,at,**params)
            future={'high':[],'low':[]}
            for r in hist:
                if r['category']=='Unclassified' or any(l['Defaulted'] and l['Ref Borrowers']==r['id'] for l in loans.values()):continue
                due=[c for c in byborrower[r['id']] if at<=date(c['Charge Date'])<at+dt.timedelta(days=7) and num(c['Principal Due'])>=0 and num(c['Interest Due'])>=0 and num(c['Principal Due'])+num(c['Interest Due'])>0]
                outcomes=[repayment_timing(c,bycharge[c['Row ID']],today)['on_time'] for c in due]
                if outcomes:future['high' if r['reliable'] else 'low'].append(statistics.mean(outcomes))
            summary[name]['history_checks'].append({'asof':str(at),**{k:{'n':len(v),'rate':statistics.mean(v) if v else None} for k,v in future.items()}})
    chosen=details['D_recent45_history15_delay15_current25']
    summary['recommended_candidate']='D_recent45_history15_delay15_current25'
    summary['recommended_sensitivity']={str(t):counts(revised_at(data,today,current_day=True,cutoff=t,**CANDIDATES['D_recent45_history15_delay15_current25'])) for t in [75,80,85]}
    baseline={r['id']:r for r in details['A_corrected_original']}
    summary['recommended_changes_from_A']=sum(r['category']!=baseline[r['id']]['category'] for r in chosen)
    summary['recommended_current_moved_rows_count']=sum(r['current_category']!=r['category'] for r in chosen)
    (snapshot.parent/'reliability-comparison-private.json').write_text(json.dumps({'summary':summary,'candidates':details},indent=2),encoding='utf-8')
    out=Path(__file__).resolve().parents[2]/'outputs/borrower-matrix-simulation-20260924/reliability-comparison.json'
    out.write_text(json.dumps(summary,indent=2),encoding='utf-8')
    print(json.dumps(summary,indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('snapshot',type=Path);compare(p.parse_args().snapshot)
