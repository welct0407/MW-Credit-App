"""Offline, reproducible borrower matrix experiments. No database connection.

Input and borrower-level outputs remain private; only aggregate diagnostics may be
published. Categories are descriptive portfolio segmentation, not lending decisions.
"""
import argparse
from collections import Counter, defaultdict
import datetime as dt
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import statistics

CATEGORIES = ["Star", "Cash Cow", "Question Mark", "Dog"]
RECOMMENDED = {"weights": (.45, .15, .15, .25), "severity_mode": "average"}


def num(value):
    if value is None:
        return 0.0
    return float(str(value).replace(",", "").replace("$", "").replace("฿", ""))


def date(value):
    return dt.date.fromisoformat(str(value)[:10]) if value else None


def quadrant(high_value, reliable):
    return ("Star" if reliable else "Question Mark") if high_value else ("Cash Cow" if reliable else "Dog")


def late_score(days):
    return 100 if days == 0 else 90 if days <= 1 else 70 if days <= 3 else 40 if days <= 7 else 10


def condition_score(days, active_default=False):
    if active_default:
        return 0
    return 100 if days == 0 else 60 if days == 1 else 40 if days <= 3 else 20


def weighted_score(recent, history, delay, current, weights=(.45,.20,.20,.15)):
    assert abs(sum(weights)-1)<1e-9 and all(w>=0 for w in weights)
    available = [(v,w) for v,w in zip([recent,history,delay,current],weights) if v is not None]
    return sum(v*w for v,w in available)/sum(w for v,w in available)


def repayment_timing(charge, repayments, asof):
    """Mature positive obligations only; component-specific, signed ledger coverage.

    Return continuous final settlement date before asof (future rows cannot cure an
    overdue position). A reversal after full payment reopens it. Default accounting
    rows with negative due components are excluded by the caller, never called paid.
    """
    p, i = num(charge["Principal Due"]), num(charge["Interest Due"])
    due_date = date(charge["Charge Date"])
    paid = defaultdict(lambda:[0.0,0.0])
    for r in repayments:
        if date(r["Payment Date"]) < asof:
            paid[date(r["Payment Date"])][0] += num(r["Principal Paid"])
            paid[date(r["Payment Date"])][1] += num(r["Interest Paid"])
    cp=ci=0.0
    settlement=None
    ontime_p=ontime_i=0.0
    for day,(ap,ai) in sorted(paid.items()):
        cp+=ap; ci+=ai
        if day<=due_date:
            ontime_p+=ap; ontime_i+=ai
        if cp >= p-.005 and ci >= i-.005:
            if settlement is None:
                settlement=day
        else:
            settlement=None
    remaining=max(p-cp,0)+max(i-ci,0)
    late=max(0,((settlement or asof)-due_date).days)
    return {"on_time": ontime_p>=p-.005 and ontime_i>=i-.005,
            "remaining": remaining, "late_days":late,"settled":settlement is not None,
            "due_date":due_date,"due":p+i}


def revised_at(data, asof, window=30, cutoff=80, history_mode="separate", day_weighted=False, current_day=False, value_cutoff=1.0, weights=(.45,.20,.20,.15), severity_mode="worst", day_fraction=False):
    """Use completed dates for economic/history scores; current balances can include today.

    Historical snapshots are restated reconstructions, not point-in-time audit data.
    """
    rows=data["rows"]
    loans={x["Row ID"]:x for x in rows["Loans"]}
    reps=defaultdict(list)
    income=defaultdict(float)
    for r in rows["Repayments"]:
        reps[r["Ref Charges"]].append(r)
        if asof-dt.timedelta(days=window)<=date(r["Payment Date"])<asof:
            income[loans[r["Ref Loans"]]["Ref Borrowers"]]+=num(r["Interest Paid"])
    byborrower=defaultdict(list)
    active=set()
    default_dates=defaultdict(list)
    for l in loans.values():
        closed=date(l["Close Date"])
        if date(l["Loan Date"])<=asof and (closed is None or closed>asof):
            active.add(l["Ref Borrowers"])
        if l["Defaulted"] and closed and closed<=asof:
            default_dates[l["Ref Borrowers"]].append(closed)
    for c in rows["Charges"]:
        if date(c["Charge Date"])>=asof:
            continue
        if num(c["Principal Due"])<0 or num(c["Interest Due"])<0 or num(c["Principal Due"])+num(c["Interest Due"])<=0:
            continue
        t=repayment_timing(c,reps[c["Row ID"]],asof)
        current=repayment_timing(c,reps[c["Row ID"]],asof+dt.timedelta(days=1)) if current_day else t
        t["current_remaining"]=current["remaining"]
        t["current_days"]=max(0,(asof-date(c["Charge Date"])).days) if current["remaining"]>.005 else 0
        byborrower[loans[c["Ref Loans"]]["Ref Borrowers"]].append(t)
    # Exact current cohort comes from the captured governed flag; historical membership
    # uses loan/close dates, which do not establish when edits became known.
    if current_day:
        active={b["Row ID"] for b in rows["olap_borrowers_analytics"] if b["Has Active Loan"]}
    total=sum(income[bid] for bid in active)
    results=[]
    for idx,b in enumerate(sorted(rows["olap_borrowers_analytics"],key=lambda b:b["Row ID"]),1):
        bid=b["Row ID"]
        if bid not in active:
            continue
        obs=byborrower[bid]
        recent=[o for o in obs if o["due_date"]>=asof-dt.timedelta(days=30)]
        older=[o for o in obs if asof-dt.timedelta(days=180)<=o["due_date"] and (history_mode=="overlap" or o["due_date"]<asof-dt.timedelta(days=30))]
        severity=[o for o in obs if o["due_date"]>=asof-dt.timedelta(days=90)]
        def rate(items):
            if not items:
                return None
            if day_weighted:
                days=defaultdict(list)
                for o in items:
                    days[o["due_date"]].append(o["on_time"])
                return 100*statistics.mean(statistics.mean(v) if day_fraction else all(v) for v in days.values())
            return 100*sum(o["on_time"] for o in items)/len(items)
        recent_score=rate(recent); historical_score=rate(older)
        recent_default=any(d>=asof-dt.timedelta(days=90) for d in default_dates[bid])
        current_days=max([o["current_days"] for o in obs],default=0)
        worst=max([o["late_days"] for o in severity],default=0)
        if severity_mode=="average" and severity:
            if day_weighted:
                byday=defaultdict(list)
                for o in severity:
                    byday[o["due_date"]].append(late_score(o["late_days"]))
                delay=statistics.mean(statistics.mean(v) for v in byday.values())
            else:
                delay=statistics.mean(late_score(o["late_days"]) for o in severity)
        else:
            delay=late_score(worst) if severity else None
        if recent_default:
            delay=0
        active_default=any(l["Ref Borrowers"]==bid and bool(l["Defaulted"]) and date(l["Loan Date"])<=asof and (date(l["Close Date"]) is None or date(l["Close Date"])>asof) for l in loans.values())
        current=condition_score(current_days,active_default)
        raw_score=weighted_score(recent_score,historical_score,delay,current,weights)
        # Fixed proposed cap keeps the displayed Y coordinate consistent with the
        # quadrant; it is a policy guard, not a probability or fitted parameter.
        guard=recent_default or active_default or current_days>7
        score=min(raw_score,60) if guard else raw_score
        high=total>0 and income[bid]/total>=value_cutoff/len(active)
        reliable=score>=cutoff
        category=quadrant(high,reliable) if total>0 and recent else "Unclassified"
        first=min([o["due_date"] for o in obs],default=asof)
        due_days=len({o["due_date"] for o in obs})
        sufficient=due_days>=3 and (asof-first).days>=30
        results.append({"alias":f"B{idx:02d}","id":bid,"name":b["Description"],
          "category":category,"score":score,"raw_score":raw_score,"reliable":reliable,"override":guard,
          "without_override":quadrant(high,raw_score>=cutoff) if total>0 and recent else "Unclassified",
          "share":income[bid]/total if total>0 else None,"value_multiple":income[bid]/total*len(active) if total>0 else None,
          "interest":income[bid],"principal":num(b["Total Outstanding Principal"]),
          "components":{"recent":recent_score,"historical":historical_score,"delay":delay,"current":current},
          "counts":{"recent":len(recent),"historical":len(older),"due_days":due_days,"observations":len(obs)},
          "history_days":(asof-first).days,"sufficient":sufficient,"current_days":current_days,
          "overdue":sum(o["current_remaining"] for o in obs if o["current_remaining"]>.005),
          "current_category":b["Matrix Quadrant"],"current_score":num(b["Matrix Stability Score"]),
          "recent_default":recent_default})
    return results


def counts(rows):
    c=Counter(r["category"] for r in rows)
    return {k:c[k] for k in CATEGORIES+["Unclassified"]}


def run(snapshot):
    assert snapshot.resolve().is_relative_to((Path.home()/"Documents/ChatGPT").resolve()), "Private inputs/row outputs must remain outside Git"
    data = json.loads(snapshot.read_text(encoding="utf-8"))
    today = date(data["identity"]["business_date"])
    rows = data["rows"]
    borrowers = rows["olap_borrowers_analytics"]
    loans = {x["Row ID"]: x for x in rows["Loans"]}
    charges_by = defaultdict(list)
    rep_by_charge = defaultdict(list)
    rep_by_borrower = defaultdict(list)
    for c in rows["Charges"]:
        charges_by[loans[c["Ref Loans"]]["Ref Borrowers"]].append(c)
    for r in rows["Repayments"]:
        rep_by_charge[r["Ref Charges"]].append(r)
        rep_by_borrower[loans[r["Ref Loans"]]["Ref Borrowers"]].append(r)
    active = [b for b in borrowers if b["Has Active Loan"]]
    report = []
    for idx, b in enumerate(sorted(borrowers, key=lambda b: b["Row ID"]), 1):
        bid = b["Row ID"]
        mature = [c for c in charges_by[bid] if date(c["Charge Date"]) < today]
        positive = [c for c in mature if num(c["Principal Due"]) + num(c["Interest Due"]) > 0]
        r30 = [c for c in positive if date(c["Charge Date"]) >= today-dt.timedelta(days=30)]
        p180 = [c for c in positive if date(c["Charge Date"]) >= today-dt.timedelta(days=180)]
        def ontime(c):
            due = num(c["Principal Due"]) + num(c["Interest Due"])
            paid = sum(num(r["Principal Paid"])+num(r["Interest Paid"]) for r in rep_by_charge[c["Row ID"]] if date(r["Payment Date"]) <= date(c["Charge Date"]))
            return due > 0 and paid >= due - 0.005
        recent = 100*sum(map(ontime, r30))/len(r30) if r30 else None
        historic = 100*sum(map(ontime, p180))/len(p180) if p180 else None
        first = min([date(c["Charge Date"]) for c in positive], default=today)
        interest = {w: sum(num(r["Interest Paid"]) for r in rep_by_borrower[bid] if today-dt.timedelta(days=w) <= date(r["Payment Date"]) < today) for w in [10,30,60]}
        record = {"alias": f"B{idx:02d}", "id": bid, "name": b["Description"], "active": b["Has Active Loan"],
                  "principal": num(b["Total Outstanding Principal"]), "hidden": b["Hidden Flag"],
                  "current_category": b["Matrix Quadrant"], "current_score": num(b["Matrix Stability Score"]),
                  "current_equal_share": num(b["Matrix Equal Share Benchmark"]),
                  "current_share": num(b["Matrix Economic Contribution"]),
                  "delay_score": b["Matrix Delay Severity Score"], "condition_score": b["Matrix Current Condition Score"],
                  "recent_score": recent, "historical_score": historic,
                  "interest": interest, "obligations": len(positive), "recent_obligations": len(r30),
                  "history_days": (today-first).days, "history_sufficient": len(positive)>=3 and (today-first).days>=30,
                  "overdue": num(b["Overdue Amount"]), "collection_status": b["Daily Collection Status"],
                  "default_count": b["Default Count"], "current_history_sufficient": b["Matrix History Sufficient"]}
        report.append(record)
    a = [r for r in report if r["active"]]
    totals = {w: sum(r["interest"][w] for r in a) for w in [10,30,60]}
    comparisons = {}
    for w in [10,30,60]:
        for cutoff in [70,75,80,85,90]:
            distribution = Counter()
            for r in a:
                r[f"share_{w}"] = r["interest"][w]/totals[w] if totals[w]>0 else None
                cat = quadrant(r[f"share_{w}"] >= 1/len(a), r["current_score"]>=cutoff)
                distribution[cat]+=1
                if cutoff==80:
                    r[f"corrected_{w}"] = cat
            comparisons[f"days{w}_stability{cutoff}"] = dict(distribution)
    summary = {"as_of":str(today),"active":len(a),"all_borrowers":len(report),
        "live_categories":dict(Counter(r["current_category"] for r in a)),
        "live_equal_share_values":sorted(set(r["current_equal_share"] for r in a)),
        "correct_equal_share":1/len(a),
        "score_range":[min(r["current_score"] for r in a),max(r["current_score"] for r in a)],
        "history_sufficient":sum(r["history_sufficient"] for r in a),
        "current_history_sufficient":sum(r["current_history_sufficient"] for r in a),
        "comparisons":comparisons,
        "source_counts":{t:len(x) for t,x in rows.items()},
        "checks":{"charge_amounts_nonnegative":all(num(c["Principal Due"])>=0 and num(c["Interest Due"])>=0 for c in rows["Charges"]),
                  "negative_repayments":sum(num(r["Principal Paid"])<0 or num(r["Interest Paid"])<0 for r in rows["Repayments"]),
                  "defaulted_loans":sum(bool(l["Defaulted"]) for l in loans.values()),
                  "zero_due_charges":sum(num(c["Principal Due"])+num(c["Interest Due"])==0 for c in rows["Charges"])} }
    out = snapshot.parent / "initial-simulation.json"
    out.write_text(json.dumps({"summary":summary,"borrowers":report},indent=2,default=str),encoding="utf-8")
    revised=revised_at(data,today,current_day=True,history_mode="overlap")
    independent=revised_at(data,today,current_day=True,history_mode="separate")
    days=revised_at(data,today,current_day=True,day_weighted=True)
    summary["revised"]={"same_windows":counts(revised),"nonoverlapping_history":counts(independent),"borrower_day_weighted":counts(days),
       "mature":counts([r for r in revised if r["sufficient"]]),"provisional":counts([r for r in revised if not r["sufficient"]]),
       "overrides_changing_category":sum(r["category"]!=r["without_override"] for r in revised),
       "movements":dict(Counter(r["current_category"]+" -> "+r["category"] for r in revised)),
       "sensitivity":{str(t):counts(revised_at(data,today,current_day=True,cutoff=t,history_mode="overlap")) for t in [70,75,80,85,90]},
       "separate_sensitivity":{str(t):counts(revised_at(data,today,current_day=True,cutoff=t,history_mode="separate")) for t in [70,75,80,85,90]}}
    recommended=revised_at(data,today,current_day=True,**RECOMMENDED)
    summary["recommended"]={"counts":counts(recommended),
       "established":counts([r for r in recommended if r["sufficient"]]),"provisional":counts([r for r in recommended if not r["sufficient"]]),
       "changed_from_live":sum(r["current_category"]!=r["category"] for r in recommended),
       "threshold_sensitivity":{str(t):counts(revised_at(data,today,current_day=True,cutoff=t,**RECOMMENDED)) for t in [70,75,80,85,90]},
       "value_sensitivity":{str(t):counts(revised_at(data,today,current_day=True,value_cutoff=t,**RECOMMENDED)) for t in [.8,1.0,1.2]},
       "window_sensitivity":{str(t):counts(revised_at(data,today,current_day=True,window=t,**RECOMMENDED)) for t in [10,30,60]},
       "near_reliability_boundary":sum(abs(r["score"]-80)<=5 for r in recommended),
       "near_value_boundary":sum(abs(r["value_multiple"]-1)<=.1 for r in recommended)}
    # Data-quality diagnostics use no borrower identifiers in public outputs.
    mature=[c for c in rows["Charges"] if date(c["Charge Date"])<today and num(c["Principal Due"])>=0 and num(c["Interest Due"])>=0 and num(c["Principal Due"])+num(c["Interest Due"])>0]
    mismatch=0
    for c in mature:
        ledger=repayment_timing(c,rep_by_charge[c["Row ID"]],today)
        legacy=(c["Payment Status"]=="ชำระแล้ว" and c["Payment Date"] is not None and date(c["Payment Date"])<=date(c["Charge Date"]))
        mismatch+=legacy!=ledger["on_time"]
    summary["quality"]={"timeliness_differences_mature_positive_charges":mismatch,
        "active_borrowers_with_prior_defaults":sum(r["default_count"]>0 for r in a),
        "negative_components_only_zero_cash_loss":all(bool(loans[r["Ref Loans"]]["Defaulted"]) and abs(num(r["Principal Paid"])+num(r["Interest Paid"]))<.005 for r in rows["Repayments"] if num(r["Principal Paid"])<0 or num(r["Interest Paid"])<0),
        "due_date_range":[str(min(date(c["Charge Date"]) for c in rows["Charges"])),str(max(date(c["Charge Date"]) for c in rows["Charges"]))],
        "oldest_active_history_days":max(r["history_days"] for r in recommended),
        "proposed_vs_live_active_count":len(recommended)==len(a),
        "shares_sum":sum(r["share"] for r in recommended),
        "due_today_pending_borrowers":sum(r["collection_status"]=="Not Paid" for r in a)}
    negative=[r for r in rows["Repayments"] if num(r["Principal Paid"])<0 or num(r["Interest Paid"])<0]
    summary["quality"]["negative_repayment_context"]={"total":len(negative),
      "linked_to_defaulted_loans":sum(bool(loans[r["Ref Loans"]]["Defaulted"]) for r in negative),
      "other_signed_adjustments":sum(not bool(loans[r["Ref Loans"]]["Defaulted"]) for r in negative)}
    # Independent reconstruction of the live quadrant from captured raw interest,
    # independent of the stored label and the new two-axis classifier.
    from decimal import ROUND_HALF_UP
    positive10={b["Row ID"]:sum(num(r["Interest Paid"]) for r in rep_by_borrower[b["Row ID"]] if today-dt.timedelta(days=10)<=date(r["Payment Date"])<today and num(r["Interest Paid"])>0) for b in active}
    total10=sum(positive10.values())
    live_matches=0
    for b in active:
        share=float(Decimal(str(positive10[b["Row ID"]]/total10)).quantize(Decimal(".01"),rounding=ROUND_HALF_UP))
        scaled=min(1,share*len(active)/2)
        expected="Star" if scaled>=.5 else "Question Mark"
        live_matches+=expected==b["Matrix Quadrant"]
    source_charges={c["Row ID"]:c for c in rows["Charges"]}
    principal_ties=all(abs(num(l["Principal Amount"])-sum(num(r["Principal Paid"]) for r in rows["Repayments"] if r["Ref Loans"]==lid)-num(l["Outstanding Principal"]))<.005 for lid,l in loans.items())
    charge_ties=all(abs(num(c["Principal Due"])+num(c["Interest Due"])-sum(num(r["Principal Paid"])+num(r["Interest Paid"]) for r in rep_by_charge[c["Row ID"]])-num(c["Amount Remaining"]))<.005 for c in rows["Charges"])
    summary["validation"]={
      "read_only_snapshot":data["identity"]["read_only"]=="on",
      "repeatable_read_snapshot":data["identity"]["isolation"]=="repeatable read",
      "unique_borrower_keys":len({r["id"] for r in recommended})==len(recommended),
      "categories_partition_active_cohort":sum(counts(recommended).values())==len(active),
      "economic_shares_sum_one":abs(sum(r["share"] for r in recommended)-1)<1e-10,
      "scores_in_range":all(0<=r["score"]<=100 for r in recommended),
      "raw_ledger_principal_matches_all_loans":principal_ties,
      "raw_ledger_remaining_matches_all_charges":charge_ties,
      "all_repayments_have_charge":all(r["Ref Charges"] in source_charges for r in rows["Repayments"]),
      "repayment_loan_and_charge_loan_agree":all(r["Ref Loans"]==source_charges[r["Ref Charges"]]["Ref Loans"] for r in rows["Repayments"]),
      "live_category_reproduction":live_matches==len(active),
      "today_unpaid_is_not_late":all(r["components"]["current"]==100 for r in recommended if r["current_days"]==0 and not r["recent_default"]),
      "high_reliability_no_severe_current_arrears":all(not r["reliable"] for r in recommended if r["current_days"]>7),
      "provisional_counts_reconcile":sum(summary["recommended"]["established"].values())+sum(summary["recommended"]["provisional"].values())==len(active)}
    if not all(summary["validation"].values()):
        raise AssertionError({k:v for k,v in summary["validation"].items() if not v})
    temporal=[]
    for back in [21,14,7]:
        at=today-dt.timedelta(days=back)
        hist=revised_at(data,at,**RECOMMENDED)
        future={"high":[],"low":[]}
        for r in hist:
            if r["category"]=="Unclassified":
                continue
            # Exclude default-history borrowers: mutable write-off-adjusted charge dues
            # cannot establish their originally due amounts at the historical cutoff.
            if any(l["Defaulted"] and l["Ref Borrowers"]==r["id"] for l in loans.values()):
                continue
            due=[c for c in charges_by[r["id"]] if at<=date(c["Charge Date"])<at+dt.timedelta(days=7) and num(c["Principal Due"])>=0 and num(c["Interest Due"])>=0 and num(c["Principal Due"])+num(c["Interest Due"])>0]
            outcomes=[repayment_timing(c,rep_by_charge[c["Row ID"]],today)["on_time"] for c in due]
            if outcomes:
                future["high" if r["reliable"] else "low"].append(statistics.mean(outcomes))
        temporal.append({"asof":str(at),"active_count":len(hist),"distribution":counts(hist),
            "next7days_equal_borrower_on_time":{k:{"borrowers":len(v),"rate":statistics.mean(v) if v else None} for k,v in future.items()}})
    summary["restated_historical_checks"]=temporal
    full={"summary":summary,"baseline_rows":report,"recommended_rows":recommended,"overlap_history_rows":revised,"day_weighted_rows":days}
    aggregate=Path(__file__).resolve().parents[2]/"outputs/borrower-matrix-simulation-20260924"
    aggregate.mkdir(parents=True,exist_ok=True)
    summary["snapshot_sha256"]=hashlib.sha256(snapshot.read_bytes()).hexdigest()
    summary["captured_at"]=data["identity"]["captured_at"]
    summary["database_read_only"]=data["identity"]["read_only"]
    summary["migration"]=data["migration"]["version"]
    (snapshot.parent/"simulation.json").write_text(json.dumps(full,indent=2,default=str),encoding="utf-8")
    (aggregate/"simulation-summary.json").write_text(json.dumps(summary,indent=2,default=str),encoding="utf-8")
    print(json.dumps({"counts":summary["recommended"]["counts"],"validation_passed":sum(summary["validation"].values()),"validation_total":len(summary["validation"]),"private_detail":str(snapshot.parent/"simulation.json")},default=str))


if __name__ == "__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("snapshot",type=Path)
    run(parser.parse_args().snapshot)
