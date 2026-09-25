def epoch: sub("[.][0-9]+Z$";"Z") | fromdateiso8601;
if .nextPageToken or .error then error("Receipt trend unavailable or truncated") else
[.timeSeries[]?.points[]? | {time:.interval.endTime,value:(try (.value.int64Value|tonumber) catch null)} |
 select(.value!=null and .value>=0 and (.value|floor)==.value)] | sort_by(.time) |
 reduce .[] as $p ([]; if length>0 and (($p.time|epoch)-(last.time|epoch))>360
 then .+[{time:((last.time|epoch)+1|todateiso8601),value:null},$p] else .+[$p] end) | .[]
end
