# One point per completed item from a collector component: the __VALUE__ field at
# each run, kept only where the same run's __KEY__ field equals __CODE__ (for
# example the provider of a Partner conversation turn), so each provider is its
# own series. Points older than the range simply do not appear; nothing is
# filled in between runs.
def stamp: sub("[.][0-9]+Z$"; "Z") | fromdateiso8601;
if .error then error("Monitoring query failed")
elif .nextPageToken then error("Collector response truncated; shorten the time range")
else
  [.timeSeries[]? | .metric.labels.field as $f | .points[]? |
    {field: $f, t: .interval.endTime, v: (try (.value.int64Value | tonumber) catch null)}] as $pts |
  ([$pts[] | select(.field == "__KEY__" and .v == __CODE__) | .t] | unique) as $keep |
  [$pts[] | select(.field == "__VALUE__" and .v != null and .v >= 0 and (.t as $t | $keep | index($t)))] |
  sort_by(.t) | .[] | {time: .t, value: .v}
end
