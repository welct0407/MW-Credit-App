# Newest same-run snapshot of one collector component's numeric fields
# (worker_timing or metabase_probe). __FIELDS__ is a list of
# {key, label, scale?, state_key?}: scale multiplies (epoch seconds to ms);
# state_key names a same-run state field whose 0 (failed) turns the value into -1
# and whose 2 (overdue) turns it into -2, so the panel maps them to words; a missing
# state sample makes the value null (No report) rather than an unqualified age.
# Missing, negative, non-integer, stale (> 360 s) or future (> 120 s) samples are
# null, never zero. Provider errors and truncation fail visibly.
def stamp: sub("[.][0-9]+Z$"; "Z") | fromdateiso8601;
if .error then error("Monitoring query failed")
elif .nextPageToken then error("Collector response truncated; shorten the time range")
else
  [.timeSeries[]? | {field: .metric.labels.field, p: (.points | sort_by(.interval.endTime) | last)} |
    select(.p != null)] as $rows |
  ([$rows[].p.interval.endTime] | max) as $end |
  (try ($end | stamp) catch null) as $t |
  ($t != null and now - $t <= 360 and $t - now <= 120) as $fresh |
  def value($key):
    ([$rows[] | select(.field == $key and .p.interval.endTime == $end)] | first | .p.value.int64Value) as $raw |
    (try ($raw | tonumber) catch null) as $v |
    if $fresh and $v != null and $v >= 0 and ($v | floor) == $v then $v else null end;
  [__FIELDS__[] as $f |
    (value($f.key)) as $v |
    {key: $f.label,
     value: (if $v == null then null
             elif $f.state_key != null and value($f.state_key) == null then null
             elif $f.state_key != null and value($f.state_key) == 0 then -1
             elif $f.state_key != null and value($f.state_key) == 2 then -2
             else $v * ($f.scale // 1) end)}] |
  from_entries
end
