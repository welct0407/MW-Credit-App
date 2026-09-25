def stamp: sub("[.][0-9]+Z$";"Z") | fromdateiso8601;
if .nextPageToken or .error then error("Health response unavailable or truncated") else
["tunnel","tailscale_node","webhook_local","oltp","olap","conversations","receipts","polling","daily_jobs","database","audit_relay","codex_ready"] as $wanted |
[(.timeSeries // [])[] | {c:.metric.labels.component,p:(.points|sort_by(.interval.endTime)|last)}] as $rows |
$wanted[] as $n | ($n=="receipts" or $n=="polling") as $critical |
([$rows[]|select(.c==$n)]|sort_by(.p.interval.endTime)|last|.p) as $p |
(try ($p.interval.endTime|stamp) catch null) as $t |
(try ($p.value.int64Value|tonumber) catch null) as $v |
($t!=null and now-$t<=360 and $t-now<=120 and ($v|IN(0,1,2,3,4))) as $valid |
{component:$n,value:(if ($valid|not) then (if $critical then 1 else 0 end)
 elif $v==0 or $v==2 or ($critical and $v==4) then 1 else 0 end)}
end
