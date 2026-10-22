# Provider and model of one collector component (worker_timing{component}): the newest run's
# numeric provider field (1 Gemini, 2 Codex, 3 Claude) and that same run's field "model:<id>"
# (value 1; the collector exports the configured model id as a label) as one text value,
# "Gemini · gemini-3.5-flash-lite"; the provider alone when the run has no model field; null
# (No report) when stale (> 360 s), future (> 120 s) or the provider code is unknown.
# Provider errors and truncation fail visibly.
def stamp: sub("[.][0-9]+Z$"; "Z") | fromdateiso8601;
if .error then error("Monitoring query failed")
elif .nextPageToken then error("Collector response truncated; shorten the time range")
else
  [.timeSeries[]? | {field: (.metric.labels.field // ""), p: (.points // [] | sort_by(.interval.endTime) | last)} |
    select(.p != null)] as $rows |
  ([$rows[] | select(.field == "provider") | .p.interval.endTime] | max) as $end |
  (try ($end | stamp) catch null) as $t |
  ($t != null and now - $t <= 360 and $t - now <= 120) as $fresh |
  ([$rows[] | select(.field == "provider" and .p.interval.endTime == $end) | .p.value.int64Value] | first) as $code |
  ({"1": "Gemini", "2": "Codex", "3": "Claude"}[$code // "" | tostring]) as $name |
  ([$rows[] | select((.field | startswith("model:")) and .p.interval.endTime == $end) | .field[6:]] | sort | last) as $model |
  {Provider: (if ($fresh | not) or $name == null then null elif $model == null or $model == "" then $name else $name + " · " + $model end)}
end
