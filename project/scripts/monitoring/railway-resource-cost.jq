def price:
  if . == "CPU_USAGE" then 0.0004632
  elif . == "MEMORY_USAGE_GB" then 0.0002316
  elif . == "DISK_USAGE_GB" then 0.0000036
  elif . == "NETWORK_TX_GB" then 0.05
  else null end;
def resource($id):
  if $id == "2959d509-c829-4420-8650-e72827d88170" then "Metabase"
  elif $id == "6ba627ff-bc6d-41e7-8182-6c0f1fb03998" then "Postgres + volume"
  elif $id == "00000000-0000-0000-0000-000000000000" then "Unassigned volume"
  elif $id == null then "Unallocated"
  else "Other / removed service " + $id[0:8] end;
if .errors then error(.errors | tostring)
elif .data.usage == null then error("Railway usage unavailable")
else
  [.data.usage[] | .measurement as $measurement |
    ($measurement | price) as $rate |
    select($rate != null) |
    {id:.tags.serviceId, cost:(.value * $rate)}] |
  group_by(.id)[] |
  {Resource:resource(.[0].id), Cost:(map(.cost)|add), Currency:"USD"}
end
