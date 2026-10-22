# Recovery points from collector snapshots (worker_timing or metabase_probe).
# __ROWS__ is a list of {component, label, age, status?, status_is_state?, red?}:
# Age is the age field of the newest same-run sample; State 0 when the status
# field reports failure (0) or the age exceeds the documented red bound, the
# status itself when status_is_state, otherwise 1. Missing or stale (> 360 s)
# telemetry gives Age null and State 4, never a healthy value.
def stamp: sub("[.][0-9]+Z$"; "Z") | fromdateiso8601;
if .error then error("Monitoring query failed")
elif .nextPageToken then error("Collector response truncated; shorten the time range")
else
  [.timeSeries[]? | {component: .metric.labels.component, field: .metric.labels.field,
    p: (.points | sort_by(.interval.endTime) | last)} | select(.p != null)] as $rows |
  __ROWS__[] as $r |
  [$rows[] | select(.component == $r.component)] as $mine |
  ([$mine[].p.interval.endTime] | max) as $end |
  (try ($end | stamp) catch null) as $t |
  ($t != null and now - $t <= 360 and $t - now <= 120) as $fresh |
  def value($key):
    if $key == null then null else
      ([$mine[] | select(.field == $key and .p.interval.endTime == $end)] | first | .p.value.int64Value) as $raw |
      (try ($raw | tonumber) catch null) as $v |
      if $fresh and $v != null and $v >= 0 and ($v | floor) == $v then $v else null end
    end;
  (value($r.age)) as $age | (value($r.status)) as $status |
  {Source: $r.label,
   Age: $age,
   State: (if $age == null then 4
     elif $r.status != null and $status == null then 4
     elif $r.status_is_state == true then (if $status | IN(0, 1, 2, 3, 4) then $status else 4 end)
     elif $r.status != null and $status == 0 then 0
     elif $r.red != null and $age > $r.red then 0
     else 1 end)}
end
