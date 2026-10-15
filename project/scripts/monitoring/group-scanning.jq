def stamp: sub("[.][0-9]+Z$";"Z") | fromdateiso8601;
def sgt: . + 28800 | strftime("%Y-%m-%d %H:%M SGT");
if .nextPageToken then error("Worker timing response truncated") else
  [.timeSeries[]? | {field:.metric.labels.field, point:(.points | sort_by(.interval.endTime) | last)}] as $rows |
  ($rows | map(select(.field == "status")) | first | .point) as $p |
  ($p != null and (now - ($p.interval.endTime | stamp)) <= 360 and
    (($p.interval.endTime | stamp) - now) <= 120 and
    ($p.value.int64Value | tonumber | IN(0,1,2,3,4))) as $fresh |
  (if $fresh then ($p.value.int64Value | tonumber) else 4 end) as $status |
  ([$rows[] | select(.point.interval.endTime == $p.interval.endTime) |
    {key:.field,value:(.point.value.int64Value | tonumber)}] | from_entries) as $v |
  [
    {details:("IG polling — " + (["Down","Healthy","Degraded","Paused","Unknown"][$status] // "Unknown") +
      "\nLast scan completion: " + (if $fresh and ($v.last_completion // 0) > 0 then ($v.last_completion | sgt) else "Unavailable" end) +
      "\nWorker: " + (if $fresh and $v.running == 1 then "Running" elif $fresh and $v.running == 0 then "Idle" else "Not observed" end) +
      "\nSchedule: 5 minutes after the previous run finishes (plus timer scheduling delay)." +
      "\nCompletion includes scans with no new images; it does not mean a payment was posted." +
      "\nObserved: " + (if $p != null then ($p.interval.endTime | stamp | sgt) else "Unavailable" end) +
      (if $fresh then "\nTiming telemetry updates about every 2 minutes." else "\nTelemetry missing or older than 6 minutes; refresh for current status." end)),
     status:$status},
    {details:"Last scan completion",status:(if $fresh and ($v.last_completion // 0) > 0 then $v.last_completion * 1000 else null end)}
  ][]
end
