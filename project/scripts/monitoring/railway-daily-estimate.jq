def seconds: sub("[.][0-9]+Z$";"Z") | fromdateiso8601;
def rate:
  if . == "CPU_USAGE" then 0.00000772
  elif . == "MEMORY_USAGE_GB" then 0.00000386
  elif . == "DISK_USAGE_GB" then 0.00000006
  else null end;
if .errors then error(.errors | tostring)
elif .data.workspace.customer.billingPeriod.start == null then error("Railway billing period unavailable")
elif .data.services == null or .data.volumes == null then error("Railway usage metrics unavailable")
else
  (.data.workspace.customer.billingPeriod.start | seconds) as $cycle_start |
  [(.data.services[]?, .data.volumes[]?) | .measurement as $measurement |
    ($measurement | rate) as $rate |
    select($rate != null) |
    .values[]? | select(.ts >= $cycle_start) |
    {day:((((.ts + 28800) / 86400 | floor) * 86400 - 28800) * 1000),
     cost:(.value * 3600 * $rate)}] |
  group_by(.day)[] |
  {Time:.[0].day, EstimatedUSD:(map(.cost)|add)}
end
