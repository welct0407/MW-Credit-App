# Collector snapshot fields of one component (worker_timing or metabase_probe). __FIELDS__ is a list of
# {key, label, scale?, state_key?}: scale multiplies (epoch seconds to ms); state_key names a state field
# whose 0 (failed) turns the value into -1 and whose 2 (overdue) into -2, so the panel maps them to
# words. FINAL3-1: each field takes its own newest fresh sample in the query window (at most 360 s old,
# not more than 120 s ahead), not only the newest collector run's: a field the collector leaves out of one
# run (Poll age while a poll is running) keeps its last fresh value instead of flipping to No report. A
# state_key must come from the same run as its value; a missing state sample makes the value null (No
# report) rather than an unqualified age. Missing, stale, future, negative or non-integer samples are
# null, never zero. Provider errors and truncation fail visibly.
def stamp: sub("[.][0-9]+Z$"; "Z") | fromdateiso8601;
def number: (try (.v | tonumber) catch null) as $n | if $n != null and $n >= 0 and ($n | floor) == $n then $n else null end;
if .error then error("Monitoring query failed")
elif .nextPageToken then error("Collector response truncated; shorten the time range")
else
  [.timeSeries[]? | .metric.labels.field as $field | .points[]? |
    (try (.interval.endTime | stamp) catch null) as $t |
    select($t != null and now - $t <= 360 and $t - now <= 120) |
    {field: $field, t: $t, v: .value.int64Value}] as $samples |
  [__FIELDS__[] as $f |
    ([$samples[] | select(.field == $f.key)] | sort_by(.t) | last) as $s |
    (if $s == null then null else ($s | number) end) as $v |
    {key: $f.label,
     value: (if $v == null then null
             elif $f.state_key == null then $v * ($f.scale // 1)
             else ([$samples[] | select(.field == $f.state_key and .t == $s.t)] | first) as $state |
               (if $state == null then null else ($state | number) end) as $code |
               if $code == null then null elif $code == 0 then -1 elif $code == 2 then -2 else $v * ($f.scale // 1) end
             end)}] |
  from_entries
end
