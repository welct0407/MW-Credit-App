# Counts per value of one metric label (log-based counters), summed over every
# aligned point in the range. The label values come from the data, not a fixed
# list. No series at all gives no rows (the panel shows its noValue text).
if .error then error("Monitoring query failed")
elif .nextPageToken then error("Counter response truncated; shorten the time range")
else
  [.timeSeries[]? | {label: (.metric.labels.__LABEL__ // "unlabelled"),
    n: ([.points[]? | (try ((.value.int64Value // .value.doubleValue // 0) | tonumber) catch 0)] | add // 0)}] |
  group_by(.label) | map({Outcome: .[0].label, Count: (map(.n) | add)}) | sort_by(-.Count, .Outcome) | .[]
end
