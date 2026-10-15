def stamp: sub("[.][0-9]+Z$";"Z") | fromdateiso8601;
if .nextPageToken or .error then error("Receipt telemetry unavailable or truncated") else
[.timeSeries[]? | {field:.metric.labels.field,p:(.points|sort_by(.interval.endTime)|last)}] as $rows |
([$rows[]|select(.field=="status")]|sort_by(.p.interval.endTime)|last|.p) as $p |
(try ($p.interval.endTime|stamp) catch null) as $t |
(try ($p.value.int64Value|tonumber) catch null) as $status |
($t!=null and now-$t<=360 and $t-now<=120 and ($status|IN(0,1,2,3,4))) as $fresh |
__FIELDS__[] as $f |
([$rows[]|select(.field==$f.key and .p.interval.endTime==$p.interval.endTime)]|first|.p.value.int64Value) as $raw |
(try ($raw|tonumber) catch null) as $v |
{name:$f.label,key:$f.key,value:(if $fresh and $status!=3 and $v!=null and $v>=0 and ($v|floor)==$v then $v else null end)}
end
