# Change notes — Metabase memory pressure, 22 October 2026

## Purpose
Railway Metabase memory sat at about 1.9 GB of its 2.0 GB per-replica cap after today's redeploys, above the 90% memory pressure alert. The owner approved adding native-memory limits to the production service.

## Changes
- Diagnosis: the chart spike to about 3.6–4 GB between 11:19Z and 12:43Z was old and new containers counted together during four redeploys (encryption-key work), not a leak. The JVM heap stays healthy (768 MB maximum, about 0.4–0.7 GB in use); the remainder is outside the heap.
- History (7-day Railway metrics against the deployment list): a long-running container sat at about 1.38–1.40 GB until the 16 October 19:42Z deployment, the only real deployment between then and today (no Metabase file change; a manual deployment). Memory then held about 1.95 GB for about 10 hours, relaxed to about 1.75 GB a day later and to about 1.5 GB from 18 October. Today's restarts repeat the same jump. The rise follows container restarts, not a configuration change; the current 1.9 GB is expected to relax the same way.
- Railway Metabase (production, service `2959d509-c829-4420-8650-e72827d88170`): added `MALLOC_ARENA_MAX=2` and set `JAVA_OPTS=-Xmx768m -XX:ActiveProcessorCount=2 -XX:ReservedCodeCacheSize=128m -XX:MaxDirectMemorySize=128m`. One new deployment on the unchanged source commit; no other variable, limit or source changed.
- `project/scripts/metabase/README.md`: current runtime settings.

## Checks
| Command | Result |
| --- | --- |
| Railway deployment status and deploy logs | Pass: SUCCESS 13:19Z; JVM reports 768.0 MB heap, 2 processors; no option errors |
| Railway health check `/api/health` | Pass: 200 at 13:18:57Z |
| Railway `MEMORY_USAGE_GB` at 13:48Z | Not improved: 1.94 GB of 2.0 GB (97%); before the change 1.89 GB |

## Not run
Memory inside the container (process RSS against file cache) could not be measured: the Railway tools give no shell into the container.

## Recovery
Remove `MALLOC_ARENA_MAX` and set `JAVA_OPTS=-Xmx768m -XX:ActiveProcessorCount=2`; the variable change starts a new deployment. Prior good deployment: `407582d3-a729-4e5a-b1a6-d387f0b51a8a`.

## Open questions
- Keep or revert the native-memory limits, given they did not lower the reported figure.
- Raise the 2.0 GB cap or retune the memory pressure alert, if the reported figure is mostly reclaimable file cache.

## Remaining work
Re-read memory about 32 hours after the 13:19Z restart (scheduled 23 October 21:00Z) and decide the next step with the owner: retune the alert for post-restart warm-up if memory has relaxed, otherwise raise the cap.
