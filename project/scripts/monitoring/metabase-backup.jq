def stamp: sub("[.][0-9]+Z$";"Z") | fromdateiso8601;
def sgt: stamp | . + 28800 | strftime("%Y-%m-%d %H:%M:%S SGT");
if .errors then
  {status:4,details:"__LABEL__ — Unknown\nRailway backup API could not be read. Check the Railway data source."}
else
  (.data.volumeInstanceBackupScheduleList // [] | map(select(.kind == "__KIND__")) | first) as $schedule |
  (.data.volumeInstanceBackupList // [] | map(select(.scheduleId != null and .scheduleId == $schedule.id)) | sort_by(.createdAt) | last) as $backup |
  (if $schedule == null then 0
   elif $backup == null then
     if now - ($schedule.createdAt | stamp) <= __FIRST_GRACE__ then 4 else 0 end
   else
     (now - ($backup.createdAt | stamp)) as $age |
     if $age <= __HEALTHY__ then 1 elif $age <= __DEGRADED__ then 2 else 0 end
   end) as $status |
  {status:$status,details:("__LABEL__ — " + (["Down","Healthy","Degraded","Paused","Unknown"][$status] // "Unknown") +
    "\nSchedule: " + (if $schedule == null then "missing" else $schedule.cron + " UTC" end) +
    "\nLast scheduled snapshot: " + (if $backup == null then "none yet" else ($backup.createdAt | sgt) end) +
    "\nRetention: " + (if $schedule == null then "unavailable" else (($schedule.retentionSeconds / 86400 | floor | tostring) + " days") end) +
    "\n" + (if $schedule == null then "The schedule has been removed."
                 elif $backup == null and $status == 4 then "Waiting for the first scheduled snapshot; manual snapshots do not count."
                 elif $backup == null then "No scheduled snapshot after the initial grace period."
                 else "Snapshot age: " + ((now - ($backup.createdAt | stamp)) / 3600 | floor | tostring) + " hours." end) +
    "\nA listed snapshot is not proof of a successful restore.")}
end
