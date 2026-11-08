# Anthropic Claude API billed cost of the current UTC calendar month against the owner's monthly limit of
# US$__LIMIT__ (cost_report without group_by over a rolling 31 days). The report holds complete UTC days only
# (start rounded up, end down), so the figure runs to the end of yesterday (UTC). Buckets of earlier months are
# left out. One row: USD (field To yesterday (UTC)) and Share (field Limit used, percent); a month without a complete day or without
# spending is 0, never no data. Amounts are US cents as decimal strings. A truncated report is an error, not an
# undercount.
if .has_more then error("Anthropic cost report has more pages; it needs more than 31 daily buckets")
elif (.data | type) != "array" then error("Anthropic cost report unavailable")
else (now | strftime("%Y-%m")) as $month
  | (([.data[] | select((.starting_at // "")[0:7] == $month) | .results[]? | .amount | tonumber] | add // 0) / 100) as $usd
  | {USD: $usd, Share: ($usd / __LIMIT__ * 100)}
end
