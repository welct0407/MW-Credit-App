# One row per Cloud Run service from a Cloud Monitoring response aggregated by
# resource.label.service_name: __MODE__ "last" keeps the newest aligned point,
# "sum" adds every point in the range. Services without data are absent, so the
# table shows no value for them rather than a zero.
if .error then error("Monitoring query failed")
elif .nextPageToken then error("Cloud Run response truncated; shorten the time range")
else
  [.timeSeries[]? | {service: (.resource.labels.service_name // .metric.labels.service_name),
    points: [.points[]? | {t: .interval.endTime,
      v: (try ((.value.doubleValue // .value.int64Value) | tonumber) catch null)} | select(.v != null)]} |
    select(.service != null and (.points | length) > 0)] |
  group_by(.service)[] |
  {Service: (.[0].service | sub("^mw-credit-app-"; "")),
   "__COLUMN__": (if "__MODE__" == "sum" then ([.[].points[].v] | add)
     else ([.[].points[]] | sort_by(.t) | last | .v) end)}
end
