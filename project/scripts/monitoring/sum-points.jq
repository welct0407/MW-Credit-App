# Total of every aligned point in the range (log-based counters, request counts).
# No series at all gives no row, so the panel shows its noValue text rather than
# a healthy zero; provider errors and truncation fail visibly.
if .error then error("Monitoring query failed")
elif .nextPageToken then error("Counter response truncated; shorten the time range")
else
  [.timeSeries[]?.points[]? | (try ((.value.int64Value // .value.doubleValue) | tonumber) catch null) |
    select(. != null)] as $values |
  if ($values | length) == 0 then empty else {value: ($values | add)} end
end
