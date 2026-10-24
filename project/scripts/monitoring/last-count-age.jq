# Age in seconds of the newest point with a count above zero of a log-based counter (R093, the in-app chat's last
# turn), read from the raw points of the panel's range. No such point gives the field null (the panel shows its
# grey "None" text, never an age of zero); provider errors and truncation fail visibly.
def stamp: sub("[.][0-9]+Z$"; "Z") | fromdateiso8601;
if .error then error("Monitoring query failed")
elif .nextPageToken then error("Counter response truncated; shorten the time range")
else
  ([.timeSeries[]?.points[]? | select((try ((.value.int64Value // .value.doubleValue // 0) | tonumber) catch 0) > 0) |
    .interval.endTime | try stamp catch empty] | map(select(. <= now + 120)) | max) as $t |
  {"__LABEL__": (if $t == null then null else ([now - $t, 0] | max | floor) end)}
end
