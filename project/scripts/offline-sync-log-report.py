#!/usr/bin/env python3
"""Read-only offline-dataset sync report from Cloud Run request logs.

Pulls request-log metadata (method, path, status, latency, response size, source address, user agent)
for the PWA reader and command services of one environment and reports:
  1. per-endpoint count / p50 / p90 / average response size (dataset domains, receipts, OPTIONS);
  2. unchanged-poll cost (small dataset bursts);
  3. walk bursts (more than 6 dataset requests per device with gaps of 4 s or less): wall, server, client gap;
  4. post-write cycles (from a payment-command POST until the device is quiet).

No request bodies are read. Devices are shown as an 8-character hash of source address and user agent;
addresses are never printed. Nothing is written to disk. Use synthetic windows for DEV; PROD is read-only.

Usage:
  python3 project/scripts/offline-sync-log-report.py --env prod --from 2026-10-17T00:00:00Z --to 2026-10-19T17:00:00Z
  python3 project/scripts/offline-sync-log-report.py --input rows.json     # saved gcloud JSON or rows, for a dry test
"""
import argparse, collections, datetime as dt, hashlib, json, re, statistics, subprocess, sys

PROJECT = "clever-oasis-508610-n7"
GAP = 4.0          # seconds between dataset requests inside one walk burst
BURST_MIN = 7      # more than 6 dataset requests
QUIET = 4.0        # seconds without a request from the device that ends a post-write cycle (--quiet)


def parse_time(s):
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()


def fetch(env, start, end, limit, project):
    flt = (f'resource.type="cloud_run_revision" AND resource.labels.service_name=~"mw-credit-app-(read|command)-{env}" '
           f'AND log_name=~"requests" AND timestamp>="{start}" AND timestamp<"{end}"')
    cmd = ["gcloud", "logging", "read", flt, "--project", project, "--format=json", "--order=asc", f"--limit={limit}"]
    out = subprocess.run(cmd, check=True, capture_output=True, text=True).stdout
    return json.loads(out or "[]")


def to_rows(entries):
    rows = []
    for x in entries:
        if "httpRequest" not in x:  # already a row (saved rows.json shape)
            rows.append(dict(x, ts=parse_time(x["t"])))
            continue
        h = x["httpRequest"]
        rows.append(dict(
            t=x["timestamp"], ts=parse_time(x["timestamp"]),
            svc=x["resource"]["labels"]["service_name"].replace("mw-credit-app-", ""),
            m=h.get("requestMethod"), p=re.sub(r"https?://[^/]+", "", h.get("requestUrl", "")),
            st=h.get("status"), lat=float((h.get("latency") or "0s").rstrip("s") or 0),
            size=int(h.get("responseSize", 0) or 0), ip=h.get("remoteIp", ""), ua=(h.get("userAgent") or "")[:40]))
    rows.sort(key=lambda r: r["ts"])
    for r in rows:
        r["dev"] = hashlib.sha256(f"{r.get('ip','')}|{r.get('ua','')}".encode()).hexdigest()[:8]
        r.pop("ip", None)  # never kept past this point
    return rows


def norm(p):
    path, _, q = p.partition("?")
    m = re.search(r"domain=(\w+)", q)
    path = re.sub(r"[0-9a-f]{8}-[0-9a-f-]{27}", "{id}", path)
    path = re.sub(r"pwa%3A[\w%-]+", "pwa:{id}", path)
    path = re.sub(r"/[A-Za-z0-9_-]{22}(?=/|$)", "/{key}", path)
    path = re.sub(r"/\d+(?=/|$)", "/{n}", path)
    return path + (f"?domain={m.group(1)}" if m else "")


def kind(r):
    p = r["p"]
    if r["m"] == "OPTIONS":
        if "offline-dataset" in p:
            return "OPTIONS " + norm(p)
        return "OPTIONS receipts" if "receipt" in p else "OPTIONS other"
    if "offline-dataset" in p:
        return f"{r['m']} " + norm(p)
    if "receipt" in p:
        return f"{r['m']} receipts"
    return None


def pct(v, q):
    v = sorted(v)
    return v[min(len(v) - 1, int(len(v) * q))]


def line(label, v, sizes):
    return f"{label:46}{len(v):6}{pct(v,.5):8.2f}{pct(v,.9):8.2f}{statistics.mean(sizes)/1024:9.1f}"


def endpoint_table(rows):
    g = collections.defaultdict(list)
    for r in rows:
        k = kind(r)
        if k:
            g[k].append(r)
    print("== Endpoints (latency s, response KB)")
    print(f"{'endpoint':46}{'n':>6}{'p50':>8}{'p90':>8}{'avgKB':>9}")
    for k, v in sorted(g.items(), key=lambda kv: -len(kv[1])):
        print(line(k[:46], [r["lat"] for r in v], [r["size"] for r in v]))
    opt = sum(len(v) for k, v in g.items() if k.startswith("OPTIONS /api/offline-dataset"))
    post = sum(len(v) for k, v in g.items() if k.startswith("POST /api/offline-dataset"))
    print(f"preflights {opt} for {post} dataset POSTs")
    print()


def bursts(rows):
    by = collections.defaultdict(list)
    for r in rows:
        if r["m"] != "OPTIONS" and "offline-dataset" in r["p"]:
            by[r["dev"]].append(r)
    out = []
    for dev, v in by.items():
        cur = [v[0]]
        for r in v[1:]:
            if r["ts"] - (cur[-1]["ts"] + cur[-1]["lat"]) <= GAP:
                cur.append(r)
            else:
                out.append((dev, cur)); cur = [r]
        out.append((dev, cur))
    return out


def span(group):
    start = min(r["ts"] for r in group)
    end = max(r["ts"] + r["lat"] for r in group)
    busy, last = 0.0, start  # union of request intervals
    for r in sorted(group, key=lambda r: r["ts"]):
        a, b = max(r["ts"], last), r["ts"] + r["lat"]
        if b > a:
            busy += b - a; last = b
    wall = end - start
    return wall, sum(r["lat"] for r in group), max(0.0, wall - busy), sum(r["size"] for r in group)


def summarize(label, items):
    if not items:
        print(f"{label}: none"); return
    cols = list(zip(*items))
    n = len(items)
    print(f"{label}: n={n}  requests p50={pct(cols[0],.5):.0f}  wall p50={pct(cols[1],.5):.1f}s p90={pct(cols[1],.9):.1f}s  "
          f"server p50={pct(cols[2],.5):.1f}s  client gap p50={pct(cols[3],.5):.1f}s (share {sum(cols[3])/max(sum(cols[1]),1e-9):.0%} of wall)  "
          f"KB p50={pct(cols[4],.5)/1024:.0f}")


def walk_report(rows):
    walks, polls = [], []
    for dev, g in bursts(rows):
        w, s, gap, sz = span(g)
        item = (len(g), w, s, gap, sz)
        if len(g) >= BURST_MIN:
            walks.append(item)
        elif len(g) >= 2 and sz < 32 * 1024:
            polls.append(item)
    print("== Unchanged polls (2-6 dataset requests, under 32 KB)")
    summarize("polls", polls)
    print("== Walk bursts (7+ dataset requests, gaps of 4 s or less)")
    summarize("walks", walks)
    print()


def write_cycles(rows, quiet):
    by = collections.defaultdict(list)
    for r in rows:
        if r["m"] != "OPTIONS" and r["svc"].startswith("command"):
            by[r["dev"]].append(r)
    print(f"== Post-write cycles (payment-command POST until the device is quiet for {quiet:g} s)")
    items = []
    for dev, v in by.items():
        i = 0
        while i < len(v):
            if v[i]["m"] == "POST" and re.fullmatch(r"/api/payment-commands/?(\?.*)?", v[i]["p"]):
                grp, last = [v[i]], v[i]["ts"] + v[i]["lat"]
                j = i + 1
                while j < len(v) and v[j]["ts"] - last <= quiet:
                    grp.append(v[j]); last = max(last, v[j]["ts"] + v[j]["lat"]); j += 1
                w, s, gap, sz = span(grp)
                items.append((dev, v[i]["t"][:19] + "Z", len(grp), w, s, sz))
                i = j
            else:
                i += 1
    if not items:
        print("none"); return
    print(f"{'device':10}{'start (UTC)':22}{'req':>5}{'wall s':>8}{'server s':>10}{'KB':>8}")
    for d, t, n, w, s, sz in items:
        print(f"{d:10}{t:22}{n:5}{w:8.1f}{s:10.1f}{sz/1024:8.0f}")


def main():
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("--env", choices=["dev", "prod"])
    a.add_argument("--from", dest="start")
    a.add_argument("--to", dest="end")
    a.add_argument("--project", default=PROJECT)
    a.add_argument("--limit", type=int, default=100000)
    a.add_argument("--quiet", type=float, default=QUIET, help="quiet seconds that end a post-write cycle")
    a.add_argument("--input", help="saved gcloud JSON or rows file instead of calling gcloud")
    a = a.parse_args()
    if a.input:
        entries = json.load(open(a.input))
        label = a.input
    elif a.env and a.start and a.end:
        entries = fetch(a.env, a.start, a.end, a.limit, a.project)
        label = f"{a.env} {a.start} .. {a.end}"
    else:
        sys.exit("give --env, --from and --to, or --input")
    rows = to_rows(entries)
    print(f"Offline sync report: {label}; {len(rows)} request-log rows"
          + (f" ({rows[0]['t'][:19]}Z .. {rows[-1]['t'][:19]}Z)" if rows else ""))
    if len(rows) >= a.limit:
        print(f"WARNING: row limit {a.limit} reached; the window is truncated, raise --limit")
    print()
    endpoint_table(rows); walk_report(rows); write_cycles(rows, a.quiet)


if __name__ == "__main__":
    main()
