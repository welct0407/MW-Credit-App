# Cloud Scheduler attempts from the log-based counter mw_scheduler_attempts_<env>,
# ALIGN_SUM per 300 s bucket and per label series. An attempt failed when its
# __STATUS_LABEL__ label is non-empty and not OK, or its __HTTP_LABEL__ label is
# not 2xx. Bucket with any failed attempt 0, only successful attempts 1; a bucket
# without attempts is null (blank), never a healthy value.
def stamp: sub("[.][0-9]+Z$"; "Z") | fromdateiso8601;
if .error then error("Monitoring query failed")
elif .nextPageToken then error("Scheduler attempt response truncated; shorten the time range")
else
  [.timeSeries[]? |
    ((.metric.labels.__STATUS_LABEL__ // "") as $s | $s != "" and $s != "OK") as $bad_status |
    ((.metric.labels.__HTTP_LABEL__ // "") as $h | $h != "" and ($h | startswith("2") | not)) as $bad_http |
    ($bad_status or $bad_http) as $failed |
    .points[]? |
    {t: (try (.interval.endTime | stamp) catch null),
     n: (try ((.value.int64Value // .value.doubleValue // 0) | tonumber) catch 0),
     failed: $failed}] |
  map(select(.t != null and .n > 0)) |
  group_by(.t) | map({t: .[0].t, v: (if any(.[]; .failed) then 0 else 1 end)}) as $b |
  [range(0; $b | length) as $i | $b[$i] as $r |
    {time: ($r.t - __PERIOD__ | todateiso8601), value: $r.v},
    (if $i + 1 < ($b | length) and $b[$i + 1].t - $r.t <= __PERIOD__ then empty
     else {time: ($r.t | todateiso8601), value: null} end)] |
  .[]
end
