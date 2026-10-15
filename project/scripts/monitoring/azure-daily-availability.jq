# Query must use PT1M Average; a sample represents [timeStamp,timeStamp+60s).
# Macro bounds are supplied by the dashboard patch, in Unix milliseconds.
def epoch: sub("[.][0-9]+Z$";"Z") | fromdateiso8601;
if .interval != "PT1M" then error("Expected unadjusted PT1M availability buckets") else . end |
(__FROM_MS__ / 1000) as $from | (__TO_MS__ / 1000) as $to |
if $to <= $from or ($to-$from)>31*86400 then error("Select at most 31 days") else . end |
if (.value|type)!="array" or (.value|length)!=1 or .value[0].name.value!="VmAvailabilityMetric" then error("Availability metric unavailable or incompatible") else . end |
if (.value[0].timeseries|length)>1 then error("Multiple Context series; reconcile before use") else . end |
[.value[0].timeseries[]?.data[]? |
 {t:(.timeStamp|epoch),v:.average} |
 select(.t < $to and .t+60 > $from)] as $samples |
if ($samples|group_by(.t)|any(length>1)) then error("Duplicate availability buckets") else . end |
if ($samples|any(.v!=null and ((.v|type)!="number" or .v<0 or .v>1))) then error("Invalid availability value") else . end |
((($from+28800)/86400|floor)*86400-28800) as $day |
[range($day;$to;86400) as $start |
 ([$start,$from]|max) as $lo | ([$start+86400,$to]|min) as $hi |
 [$samples[] | select(.v!=null) |
   ([.t,$lo]|max) as $a | ([.t+60,$hi]|min) as $b |
   select($b>$a) | {seconds:($b-$a),running:(($b-$a)*.v)}] as $known |
 ($known|map(.seconds)|add // 0) as $seconds |
 {Day:(($start+28800)|strftime("%Y-%m-%d")),
  "Observed available hours":(if $seconds>0 then ($known|map(.running)|add)/3600 else null end),
  "Unknown hours":(($hi-$lo-$seconds)/3600),
  "Coverage percent":(100*$seconds/($hi-$lo))}]
