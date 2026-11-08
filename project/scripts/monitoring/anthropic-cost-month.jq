# Anthropic Claude API billed cost of the current calendar month (UTC days) against the owner's monthly limit of
# US$__LIMIT__ (cost_report without group_by over the month to date). Amounts are US cents as decimal strings.
# A bucket outside the current UTC month (the Bangkok month start falls on the previous UTC day) is left out.
# One row: Month to date in USD and Limit used in percent; a month without spending is 0, never no data.
# A truncated report is an error, not an undercount.
if .has_more then error("Anthropic cost report has more pages; the month needs more than 31 daily buckets")
elif (.data | type) != "array" then error("Anthropic cost report unavailable")
else (now | strftime("%Y-%m")) as $month
  | (([.data[] | select((.starting_at // "")[0:7] == $month) | .results[]? | .amount | tonumber] | add // 0) / 100) as $usd
  | {USD: $usd, Share: ($usd / __LIMIT__ * 100)}
end
