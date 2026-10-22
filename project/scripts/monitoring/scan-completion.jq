# Instagram group scan, last completion (worker_timing{polling}): the newest positive last_completion
# reported in the query window (the stat reads the last 3 hours), not only in the newest collector run.
# While a scan runs the collector reports last_completion 0 (systemd resets the exit time on start), so
# the newest run alone often had no completion. Freshness rule unchanged: the newest status sample must be
# at most 360 s old (and not more than 120 s ahead), else null (shown as "—"). A completion in the future
# is ignored. One row {details: "Last scan completion", status: epoch ms or null}.
def stamp: sub("[.][0-9]+Z$"; "Z") | fromdateiso8601;
if .error then error("Monitoring query failed")
elif .nextPageToken then error("Worker timing response truncated")
else
  ([.timeSeries[]? | select(.metric.labels.field == "status") | .points[]?] | sort_by(.interval.endTime) | last) as $p |
  ($p != null and (try (now - ($p.interval.endTime | stamp)) catch 1e9) <= 360 and
    (try (($p.interval.endTime | stamp) - now) catch 1e9) <= 120) as $fresh |
  ([.timeSeries[]? | select(.metric.labels.field == "last_completion") | .points[]? |
    (try (.value.int64Value | tonumber) catch null) | select(. != null and . > 0 and . <= now + 120)] | max) as $last |
  {details: "Last scan completion", status: (if $fresh and $last != null then $last * 1000 else null end)}
end
