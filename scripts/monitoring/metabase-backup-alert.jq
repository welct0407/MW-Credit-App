def stamp: sub("[.][0-9]+Z$";"Z") | fromdateiso8601;
if .errors then error("Railway backup API failed") else
  .data as $data |
  [{kind:"DAILY",component:"metabase_backup_daily",healthy:108000,degraded:129600,first_grace:108000},
   {kind:"WEEKLY",component:"metabase_backup_weekly",healthy:691200,degraded:777600,first_grace:691200}][] as $cfg |
  ($data.volumeInstanceBackupScheduleList // [] | map(select(.kind == $cfg.kind)) | first) as $schedule |
  ($data.volumeInstanceBackupList // [] | map(select(.scheduleId != null and .scheduleId == $schedule.id)) | sort_by(.createdAt) | last) as $backup |
  {component:$cfg.component,value:(
    if $schedule == null then 1
    elif $backup == null then (if now - ($schedule.createdAt | stamp) <= $cfg.first_grace then 0 else 1 end)
    else (if now - ($backup.createdAt | stamp) <= $cfg.healthy then 0 else 1 end)
    end)}
end
