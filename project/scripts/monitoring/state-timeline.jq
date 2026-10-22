# State timeline row: every sample in the range as a state code (0 Down, 1 OK,
# 2 Degraded, 3 Paused, 4 Unknown). Booleans map true 1, false 0. Samples of one
# collector run share a timestamp; the worst member wins (0, 4, 2, 3, then 1) and
# a run missing any of the __EXPECTED__ members is Unknown. A gap longer than
# the freshness bound ends in null at (sample + bound), so no state stretches across
# missing telemetry; a newest sample older than the bound also ends in null at
# (sample + bound), with a second null at now so Unknown reaches the right edge.
# Provider errors and truncation fail visibly.
def stamp: sub("[.][0-9]+Z$"; "Z") | fromdateiso8601;
def code: if type == "boolean" then (if . then 1 else 0 end)
  else (try tonumber catch null) | if . != null and IN(0, 1, 2, 3, 4) then . else 4 end end;
def worst: if any(.[]; . == 0) then 0 elif any(.[]; . == 4) then 4 elif any(.[]; . == 2) then 2
  elif any(.[]; . == 3) then 3 else 1 end;
if .error then error("Monitoring query failed")
elif .nextPageToken then error("Monitoring response truncated; shorten the time range")
else
  [.timeSeries[]? | .points[]? |
    {t: (try (.interval.endTime | stamp) catch null),
     v: (.value | if has("boolValue") then .boolValue else (.int64Value // .doubleValue) end)}] |
  map(select(.t != null and .t <= now + 120)) |
  group_by(.t) | map({t: .[0].t, n: length, v: ([.[].v | code] | worst)}) as $runs |
  [range(0; $runs | length) as $i | $runs[$i] as $r |
    {time: ($r.t | todateiso8601), value: (if $r.n == __EXPECTED__ then $r.v else 4 end)},
    (if $i + 1 < ($runs | length) and $runs[$i + 1].t - $r.t > __STALE__
     then {time: ($r.t + __STALE__ | todateiso8601), value: null} else empty end)] +
  (if ($runs | length) == 0 then [{time: (now | floor | todateiso8601), value: null}]
   elif now - ($runs | last | .t) > __STALE__
   then [{time: ($runs | last | .t + __STALE__ | todateiso8601), value: null}, {time: (now | floor | todateiso8601), value: null}]
   else [] end) |
  .[]
end
