def stamp: sub("[.][0-9]+Z$";"Z") | fromdateiso8601;
if .nextPageToken then error("Probe response truncated") else
 [.timeSeries[]? | {field:.metric.labels.field,point:(.points|sort_by(.interval.endTime)|last)}] as $rows |
 ($rows|map(select(.field=="status"))|first|.point) as $p |
 ($p != null and (now-($p.interval.endTime|stamp)) <= 360) as $fresh |
 (if $fresh then ($p.value.int64Value|tonumber) else 4 end) as $status |
 ([$rows[]|select(.point.interval.endTime==$p.interval.endTime)|{key:.field,value:(.point.value.int64Value|tonumber)}]|from_entries) as $v |
 {status:$status,details:("__LABEL__ — "+(["Down","Healthy","Degraded","Paused","Unknown"][$status]//"Unknown")+
 "\n__CHECK__"+
 "\nResult: "+(if $fresh then (if $status==1 then "Expected response confirmed" elif $status==2 then "Passed, but slower than 5 seconds" elif $status==0 then "Request failed or unexpected response" else "Probe could not establish health" end) else "Telemetry missing or older than 6 minutes" end)+
 "\nHTTP: "+(if $fresh then (($v.http_code//0)|tostring) else "Unavailable" end)+
 "\nProbe duration: "+(if $fresh then (($v.duration_ms//0)|tostring)+" ms" else "Unavailable" end)+
 "\nObserved: "+(if $p!=null then ($p.interval.endTime|stamp|.+28800|strftime("%Y-%m-%d %H:%M:%S SGT")) else "Unavailable" end)+
 "\nChecked from Debian about every 2 minutes. This is not a browser-render test.")}
end
