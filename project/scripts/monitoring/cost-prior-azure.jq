# Azure Cost Management Custom query (Daily, grouped by ResourceId) over the previous month to the same
# moment: a guard keeps only rows of the previous UTC month up to today's UTC day of month (Azure keeps
# provider UTC days; the shifted Bangkok window can reach one day earlier). Same checks as the current query.
if .properties.nextLink then error("Cost response truncated; shorten time range")
elif (.properties.rows | type) != "array" then error("Azure cost response unavailable")
elif any(.properties.rows[]; .[3] != "USD") then error("Unexpected Azure currency")
else
  (now | gmtime) as $g | $g[2] as $day |
  ((if $g[1] == 0 then ($g[0] - 1) * 100 + 12 else $g[0] * 100 + $g[1] end) | tostring) as $month |
  {Category: "Reported costs",
   amount: ([.properties.rows[] | (.[1] | tostring) as $d | select($d[0:6] == $month and ($d[6:8] | tonumber) <= $day) | .[0]] | add // 0)}
end
