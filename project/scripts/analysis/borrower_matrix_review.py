"""Render a private static owner-review page; no remote resources or network calls."""
import argparse
import csv
import datetime as dt
import html
import json
import math
from pathlib import Path

COLORS={"Star":"#087d65","Cash Cow":"#2563a6","Question Mark":"#b36a08","Dog":"#ad3448","Unclassified":"#697584"}

def render(folder):
    assert folder.resolve().is_relative_to((Path.home()/"Documents/ChatGPT").resolve())
    source=json.loads((folder/"simulation.json").read_text(encoding="utf-8"))
    rows=source["recommended_rows"]
    esc=lambda x:html.escape(str(x))
    fmt=lambda v:"N/A" if v is None else f"{v:.1f}"
    xmax=math.ceil(max(r["value_multiple"] for r in rows)*2)/2
    xmin=min(0,math.floor(min(r["value_multiple"] for r in rows)))
    x=lambda v:70+(v-xmin)/(xmax-xmin)*800
    y=lambda v:420-v*3.6
    sx=x(1);sy=y(80)
    svg=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 940 490" role="img" aria-label="Borrower contribution versus payment reliability. Bubble area represents current principal. Dashed outline means provisional history.">']
    for label,xx,yy,ww,hh in [("Cash Cow",70,60,sx-70,sy-60),("Star",sx,60,870-sx,sy-60),("Dog",70,sy,sx-70,420-sy),("Question Mark",sx,sy,870-sx,420-sy)]:
        svg.append(f'<rect x="{xx}" y="{yy}" width="{ww}" height="{hh}" fill="{COLORS[label]}" opacity=".07"/><text x="{xx+10}" y="{yy+22}" fill="{COLORS[label]}" font-size="14" font-weight="bold">{label}</text>')
    for score in [0,20,40,60,80,100]:
        svg.append(f'<line x1="70" y1="{y(score)}" x2="870" y2="{y(score)}" stroke="#cdd4dc"/><text x="57" y="{y(score)+5}" text-anchor="end" fill="#465564">{score}</text>')
    for tick in range(int(xmin),math.ceil(xmax)+1):
        if tick<=xmax:
            svg.append(f'<text x="{x(tick)}" y="443" text-anchor="middle" fill="#465564">{tick}×</text>')
    svg += [f'<line x1="{sx}" y1="60" x2="{sx}" y2="420" stroke="#627080" stroke-dasharray="6 4"/>',f'<line x1="70" y1="{sy}" x2="870" y2="{sy}" stroke="#627080" stroke-dasharray="6 4"/>']
    maxp=max(r["principal"] for r in rows)
    for r in sorted(rows,key=lambda r:-r["principal"]):
        radius=max(5,math.sqrt(max(r["principal"],0)/maxp)*23)
        title=f'{r["alias"]} · {r["name"]} | {r["category"]} | reliability {r["score"]:.1f} | contribution {r["value_multiple"]:.2f}× equal share | '+('Established' if r["sufficient"] else 'Provisional')
        dash='' if r['sufficient'] else ' stroke-dasharray="3 2"'
        svg.append(f'<circle cx="{x(r["value_multiple"])}" cy="{y(r["score"])}" r="{radius}" fill="{COLORS[r["category"]]}" fill-opacity=".62" stroke="{COLORS[r["category"]]}" stroke-width="2"{dash}><title>{esc(title)}</title></circle>')
    svg += ['<text x="470" y="480" text-anchor="middle" fill="#263646">30-day contribution ÷ equal-share contribution (high value ≥ 1×)</text>','<text x="18" y="240" transform="rotate(-90 18 240)" text-anchor="middle" fill="#263646">Payment reliability · 0–100 (high ≥ 80)</text>','</svg>']
    bodyrows=[]
    csvrows=[]
    for r in sorted(rows,key=lambda r:(list(COLORS).index(r["category"]),-r["score"],r["alias"])):
        comp=r["components"]
        confidence='Established' if r['sufficient'] else 'Provisional'
        values=[r['alias'],r['name'],r['current_category'],r['category'],f'{r["share"]*100:.2f}%',f'{r["value_multiple"]:.2f}×',fmt(r['score']),confidence,r['history_days'],r['counts']['recent'],fmt(comp['recent']),fmt(comp['historical']),fmt(comp['delay']),fmt(comp['current']),r['current_days']]
        bodyrows.append('<tr>'+''.join(f'<td>{esc(v)}</td>' for v in values)+'</tr>')
        csvrows.append(values)
    headers=['Alias','Borrower','Live category','Proposed category','Contribution share','Relative value','Reliability','History confidence','History days','Recent obligations','Recent score','Older score','Delay score','Current score','Oldest unpaid days']
    summary=source['summary']['recommended']
    captured=dt.datetime.fromisoformat(source['summary']['captured_at']).astimezone(dt.timezone(dt.timedelta(hours=7)))
    cards=''.join(f'<div class="kpi" style="border-top-color:{COLORS[c]}"><b>{summary["counts"][c]}</b><span>{c}</span><small>{summary["established"][c]} established · {summary["provisional"][c]} provisional</small></div>' for c in COLORS if c!='Unclassified')
    document='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Borrower matrix — private simulation review</title>
<style>body{font:15px/1.55 system-ui,sans-serif;color:#263646;background:#f3f5f7;margin:0}main{max-width:1280px;margin:auto;padding:28px}h1{font-size:28px;margin-bottom:4px}h2{font-size:21px}p{max-width:1000px}.meta{color:#5c6a79}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.kpi{background:white;padding:16px;border-top:4px solid;display:grid}.kpi b{font-size:34px}.kpi small{color:#5c6a79}.chart{max-width:1020px;background:white;margin-top:20px;padding:12px}svg{width:100%;height:auto}.scroll{overflow:auto;background:white}table{border-collapse:collapse;font-size:13px;white-space:nowrap}td,th{text-align:left;padding:9px 12px;border-bottom:1px solid #d9e0e6}th{background:#e8edf2}tr:nth-child(even){background:#f7f9fb}a{color:#175a9a}@media(max-width:700px){main{padding:14px}.cards{grid-template-columns:repeat(2,1fr)}}</style><main>
<h1>Borrower value & payment reliability</h1><p class="meta">Private simulation • production snapshot 24 September 2026, 20:00 Bangkok • 22 active borrowers • no live changes</p>
<p>Existing: 11 Stars, 11 Question Marks. Proposed: two independent axes, reliability boundary 80, and 30 completed days of signed interest contribution. Eighteen borrowers change category. Provisional placements remain visible but are not established ratings.</p>
'''+f'<div class="cards">{cards}</div><div class="chart">'+''.join(svg)+'''</div>
<p class="meta">Bubble area = outstanding principal. Dashed outline = less than 30 days / insufficient due-day history. Hover a bubble for its borrower details; all details also appear in the table. These are descriptive categories, not lending approvals or probability-of-default estimates.</p>
<h2>Method</h2><p>X = borrower’s signed interest contribution over the previous 30 completed Bangkok dates ÷ portfolio contribution, relative to 1/22 = 4.545%. Y = 45% recent on-time rate + 15% older on-time rate + 15% average delay severity + 25% current condition; missing components are omitted and available weights renormalized. Older history excludes the recent 30 days. More than seven days of current arrears or a default in the past 90 days caps the score at 60. Today’s unpaid dues are not late.</p>
<p>Established history requires at least three distinct due dates and 30 days since the first matured positive obligation. Current data supplies only 50 days at most. No quotas were used to populate the four categories.</p>
<h2>Borrower-level movement and score components</h2><div class="scroll"><table><thead><tr>'''+''.join(f'<th>{h}</th>' for h in headers)+'</tr></thead><tbody>'+''.join(bodyrows)+'''</tbody></table></div><p class="meta">This report contains private borrower information and is stored outside the repository. Snapshot values are fixed; this is not a live dashboard. The full methodology and sanitized aggregate evidence are in the repository simulation report.</p></main></html>'''
    (folder/'OWNER_REVIEW.html').write_text(document,encoding='utf-8')
    # Replace snapshot-specific labels from the same validated dataset.
    document=document.replace('24 September 2026, 20:00 Bangkok',captured.strftime('%d %B %Y, %H:%M Bangkok'))
    document=document.replace('22 active borrowers',f'{len(rows)} active borrowers')
    document=document.replace('Eighteen borrowers change category',f'{summary["changed_from_live"]} borrowers change category')
    document=document.replace('1/22 = 4.545%',f'1/{len(rows)} = {100/len(rows):.3f}%')
    document=document.replace('only 50 days at most',f'only {max(r["history_days"] for r in rows)} days at most')
    live=source['summary']['live_categories']
    document=document.replace('Existing: 11 Stars, 11 Question Marks.', 'Existing: '+', '.join(f'{v} {k}' for k,v in live.items())+'.')
    (folder/'OWNER_REVIEW.html').write_text(document,encoding='utf-8')
    (folder/'matrix.svg').write_text(''.join(svg),encoding='utf-8')
    with (folder/'borrower-review.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.writer(f);w.writerow(headers);w.writerows(csvrows)
    print(json.dumps({'private_review':str(folder/'OWNER_REVIEW.html'),'rows':len(rows)}))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('private_folder',type=Path);render(p.parse_args().private_folder)
