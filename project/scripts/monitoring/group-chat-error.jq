# R166: the group chat summary's last error as one short text value, from worker_timing{component="group_chat_summary"}:
# the newest fresh last_error_at sample (at most 360 s old, not more than 120 s ahead) and that same run's fields
# "last_error:<CODE>" (the value is the code's rank, 1 the most frequent). 0 (no error in 7 days) is "None"; otherwise the
# most frequent code in words (__WORDS__: code to words, a key ending in * is a prefix; an unknown code reads "Other
# error"), "+N" for the other codes, and the age: "Model reply unreadable +1 · 23 h" (UX-CSMON-10: short enough for the
# tile at 1440 and 390 px). Stale or missing is null (No report). Provider errors and truncation fail visibly.
def stamp: sub("[.][0-9]+Z$"; "Z") | fromdateiso8601;
def human: if . < 60 then "\(.) s" elif . < 3600 then "\(. / 60 | floor) min" elif . < 86400 then "\(. / 3600 | floor) h" else "\(. / 86400 | floor) d" end;
def words($map): . as $code |
  ($map[$code] // ([$map | to_entries[] | .key as $key | select(($key | endswith("*")) and ($code | startswith($key[:-1]))) | .value] | first) // "Other error");
if .error then error("Monitoring query failed")
elif .nextPageToken then error("Collector response truncated; shorten the time range")
else
  __WORDS__ as $map |
  [.timeSeries[]? | {field: (.metric.labels.field // ""), p: (.points // [] | sort_by(.interval.endTime) | last)} | select(.p != null)] as $rows |
  ([$rows[] | select(.field == "last_error_at") | .p.interval.endTime] | max) as $end |
  (try ($end | stamp) catch null) as $t |
  ($t != null and now - $t <= 360 and $t - now <= 120) as $fresh |
  ([$rows[] | select(.field == "last_error_at" and .p.interval.endTime == $end) | (try (.p.value.int64Value | tonumber) catch null)] | first) as $at |
  ([$rows[] | select((.field | startswith("last_error:")) and .p.interval.endTime == $end) |
    {code: .field[11:], rank: (try (.p.value.int64Value | tonumber) catch 99)}] | sort_by(.rank, .code)) as $codes |
  {"Last error": (if ($fresh | not) or $at == null or $at < 0 then null
                  elif $at == 0 then "None"
                  else (if ($codes | length) > 0 then ($codes[0].code | words($map)) else "Error" end)
                    + (if ($codes | length) > 1 then " +" + (($codes | length) - 1 | tostring) else "" end)
                    + " · " + ([now - $at, 0] | max | floor | human) end)}
end
