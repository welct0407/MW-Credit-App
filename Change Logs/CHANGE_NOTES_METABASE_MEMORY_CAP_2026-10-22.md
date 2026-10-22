# Change notes — Metabase memory cap raised to 3 GB and native-memory limits reverted, 22 October 2026

## Purpose
After the 22 October restarts, Railway Metabase memory stayed close to its 2.0 GB cap and peaked at 1.99 GB. The memory-pressure session (branch `claude/quirky-mccarthy-3umyb9`, note `CHANGE_NOTES_METABASE_MEMORY_2026-10-22.md`) recommended 3 GB as the safer option, and the owner approved raising the cap to 3 GB.

## Changes
- Railway Metabase (project `c8e57452-36dc-41f1-8d00-856b521a96c7`, environment production `df3ba125-0d62-446a-b4d8-5196780982c9`, service `2959d509-c829-4420-8650-e72827d88170`): the per-replica memory limit went from 2.0 GB to 3.0 GB, at about 19:13Z. The CPU limit stays at 2 vCPU, with 1 replica, and no variable, `JAVA_OPTS` or source changed. Railway applied the limit to the running deployment `79e97ca2` without a restart.
- Incident during the change: the first limit update passed only `memoryGB`, and Railway reset the CPU limit to the plan maximum (24 vCPU). A second update set `memoryGB: 3, vCPUs: 2` about a minute later. When you change one Railway limit, always pass both values.
- Native-memory limits reverted (owner request, 19:37Z): the memory-pressure session's `MALLOC_ARENA_MAX=2` was removed and `JAVA_OPTS` set back to `-Xmx768m -XX:ActiveProcessorCount=2` (dropping `-XX:ReservedCodeCacheSize=128m -XX:MaxDirectMemorySize=128m`). Both changes were staged as one Railway patch and committed once, giving deployment `a3fbb31e` on the unchanged source commit; `79e97ca2` was removed. The first `accept-deploy` call timed out without applying; the patch was confirmed still staged with no new deployment before Railway's agent committed it.
- Records: `project/scripts/metabase/README.md` (current runtime) and `project/Documents/Resource_Monitoring.md` (limits table).

## Checks
| Command | Result |
| --- | --- |
| Railway service config before the change | Production Metabase, 2 vCPU / 2,000,000,000 bytes, 1 replica in `asia-southeast1-eqsg3a` |
| Railway service config after the change | Pass: 2 vCPU / 3,000,000,000 bytes, 1 replica, nothing staged |
| Railway `MEMORY_LIMIT_GB` / `CPU_LIMIT` | Pass: 3.0 GB and 2 shortly after the change |
| Railway deployment list | Pass: `79e97ca2` still SUCCESS and the only active deployment; memory unchanged at 1.76 GB (no restart) |
| `https://reports.mw-credit.com/api/health` | Pass: 200 |
| Railway staged patch before the revert commit | Pass: exactly 2 Metabase changes (`JAVA_OPTS` set, `MALLOC_ARENA_MAX` removed), not destructive |
| Deployment `a3fbb31e` status and logs | Pass: SUCCESS 19:39Z; JVM 768.0 MB heap, 2 processors, total memory 2.8 GB; Metabase initialization complete; no option or out-of-memory errors |
| Service config after the revert | Pass: `MALLOC_ARENA_MAX` absent; 3 GB / 2 vCPU, 1 replica, nothing staged |
| `/api/health` after the revert | Pass: 200 |

## Not run
- The Grafana memory-pressure alert was not changed. It divides by the live limit, so 1.76 GB now reads about 59% and the alert should clear without changes.

## Recovery
Set the limits back with both values: `memoryGB: 2, vCPUs: 2` (Railway `update-service` limits, or the service settings in the dashboard). The change applies to the running deployment. To restore the native-memory limits, set `MALLOC_ARENA_MAX=2` and `JAVA_OPTS=-Xmx768m -XX:ActiveProcessorCount=2 -XX:ReservedCodeCacheSize=128m -XX:MaxDirectMemorySize=128m` in one staged change; it starts a new deployment.

## Open questions
- None.

## Remaining work
- The settle check already scheduled by the memory-pressure session (23 October 21:00Z) should read memory against the new 3 GB limit, starting from the 19:39Z restart. That session's unmerged branch `claude/quirky-mccarthy-3umyb9` still describes the native-memory limits as current; it needs updating before it is merged.
