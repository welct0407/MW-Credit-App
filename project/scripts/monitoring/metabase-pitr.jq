def stamp: sub("[.][0-9]+Z$";"Z") | fromdateiso8601;
if .nextPageToken then error("PITR response truncated") else
 [.timeSeries[]? | {field:.metric.labels.field,point:(.points|sort_by(.interval.endTime)|last)}] as $rows |
 ($rows|map(select(.field=="status"))|first|.point) as $p |
 ($p != null and (now-($p.interval.endTime|stamp)) <= 360) as $fresh |
 (if $fresh then ($p.value.int64Value|tonumber) else 4 end) as $status |
 ([$rows[]|select(.point.interval.endTime==$p.interval.endTime)|{key:.field,value:(.point.value.int64Value|tonumber)}]|from_entries) as $v |
 {status:$status,details:("🛡 PITR archive — "+(["Down","Healthy","Degraded","Paused","Unknown"][$status]//"Unknown")+
 "\nRailway Postgres pgBackRest coverage and live WAL archiver."+
 "\nLatest WAL archive: "+(if ($v.last_archived//0)>0 then ($v.last_archived+28800|gmtime|strftime("%Y-%m-%d %H:%M:%S SGT")) else "Unavailable" end)+
 "\nArchive lag: "+(if $fresh and ($v.last_archived//0)>0 then (($v.archive_age_seconds//0)/60|floor|tostring)+" minutes" else "Unavailable" end)+
 "\nBackup sets: "+(if $fresh then (($v.backup_sets//0)|tostring) else "Unavailable" end)+
 "\nObserved: "+(if $p!=null then ($p.interval.endTime|stamp|.+28800|strftime("%Y-%m-%d %H:%M:%S SGT")) else "Unavailable" end)+
 "\nGreen requires an enabled archive, reachable live probe, backup set, WAL coverage and a recent successful archive. This does not validate a restore.")}
end
