if .nextPageToken then error("Metabase probe response truncated") else
  ["metabase_platform","metabase_appdb","metabase_reporting","metabase_charts"] as $wanted |
  [.timeSeries[]? | select(.metric.labels.field == "status") |
    {component:.metric.labels.component,point:(.points|sort_by(.interval.endTime)|last)}] as $samples |
  $wanted[] as $component |
  ([$samples[]|select(.component == $component)]|first|.point) as $point |
  {component:$component,value:(
    if $point == null then 0
    elif (now-($point.interval.endTime|sub("[.][0-9]+Z$";"Z")|fromdateiso8601)) > 360 then 0
    else ($point.value.int64Value|tonumber) as $status |
      if $status == 0 or $status == 2 then 1 else 0 end
    end)}
end
