# BigQuery billing export grouped into MW Credit service categories (columns
# Service, Gross, Credits, Currency). Rows: each category's cost before credits,
# descending, then one Credits row, so the column total is the net SGD cost.
# A missing export table gives no rows (Unavailable, not zero).
if (.jobComplete != true) then error("Billing query is still running; refresh later")
elif .pageToken then error("Billing result truncated; shorten time range")
elif any(.rows[]?; .f[3].v != "SGD") then error("Unexpected GCP currency")
else
  [.rows[]? | select(.f[0].v != null) |
    {Service: .f[0].v, Gross: (.f[1].v | tonumber), Credits: (.f[2].v | tonumber)}] as $rows |
  if ($rows | length) == 0 then empty else
    ($rows | sort_by(-.Gross) | map({Service, SGD: .Gross})[]),
    {Service: "Credits", SGD: ($rows | map(.Credits) | add)}
  end
end
