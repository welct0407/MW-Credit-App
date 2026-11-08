# Anthropic Claude API billed cost by model and cost type over the selected days (cost_report with
# group_by[]=description). Amounts are US cents as decimal strings; rows without a model (web search,
# code execution) show an em dash. Largest first; a truncated report is an error, not an undercount.
if .has_more then error("Anthropic cost report has more pages; narrow the date range")
else [.data[].results[]?]
  | group_by([.model // "", .cost_type // "", .token_type // ""])
  | map({Model: (.[0].model // "—"),
         Type: ([.[0].cost_type, .[0].token_type] | map(select(. != null)) | join(" · ")),
         USD: ((map(.amount | tonumber) | add) / 100)})
  | sort_by(-.USD) | .[]
end
