# Azure Cost Management query with timeframe TheLastMonth, Daily granularity
# grouped by ResourceId: the previous month's cost up to today's UTC day of month
# (Azure keeps provider UTC days). Same checks as the current-month query.
if .properties.nextLink then error("Cost response truncated; shorten time range")
elif (.properties.rows | type) != "array" then error("Azure cost response unavailable")
elif any(.properties.rows[]; .[3] != "USD") then error("Unexpected Azure currency")
else
  (now | gmtime | .[2]) as $day |
  {Category: "Reported costs",
   amount: ([.properties.rows[] | select(((.[1] | tostring | .[6:8]) | tonumber) <= $day) | .[0]] | add // 0)}
end
