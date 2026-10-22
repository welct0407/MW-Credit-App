# Telemetry freshness: age in seconds of the newest sample of one source, so a
# wave of grey state rows can be traced to stale telemetry. No sample at all
# gives Age null; the panel maps null and ages above 360 s to "stale".
def stamp: sub("[.][0-9]+Z$"; "Z") | fromdateiso8601;
if .error then error("Monitoring query failed")
elif .nextPageToken then error("Monitoring response truncated; shorten the time range")
else
  ([.timeSeries[]?.points[]?.interval.endTime | try stamp catch empty] | map(select(. <= now + 120)) | max) as $t |
  {Source: "__LABEL__", Age: (if $t == null then null else ([now - $t, 0] | max | floor) end)}
end
