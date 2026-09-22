WITH selected AS (
 SELECT * FROM {{model:income-daily}} d WHERE true [[AND {{statement_period}}]]
), totals AS (
 SELECT min("Date") starts,max("Date") ends,count(*) days,coalesce(sum("Operating Income"),0) income,
  coalesce(sum("Expenses"),0) expenses,coalesce(sum("Partner A Net Profit"),0) pa,
  coalesce(sum("Partner B Net Profit"),0) pb FROM selected
), opening AS (SELECT * FROM selected ORDER BY "Date" LIMIT 1),
closing AS (SELECT * FROM selected ORDER BY "Date" DESC LIMIT 1),
allocated AS (
 SELECT t.*,public.fifo_current_month_settled(coalesce(o."Prior Partner A Net",0),t.pa,coalesce(c."Partner A Settled Through Date",0)) draw_a,
  public.fifo_current_month_settled(coalesce(o."Prior Partner B Net",0),t.pb,coalesce(c."Partner B Settled Through Date",0)) draw_b,
  c."Net Profit Through Date" profit_to_end
 FROM totals t LEFT JOIN opening o ON true LEFT JOIN closing c ON true
), valid AS (SELECT * FROM allocated WHERE starts IS NULL OR days=ends-starts+1)
SELECT a.starts AS "Period Start",a.ends AS "Period End",v.income AS "Operating Income",-v.expenses AS "Operating Expenses",
 v.income-v.expenses AS "Net Profit",(v.income-v.expenses)/NULLIF(v.income,0) AS "Net Margin",
 -v.draw_a AS "Tommy Draw",-v.draw_b AS "Lisa Draw",v.income-v.expenses-v.draw_a-v.draw_b AS "Unsettled Profit",
 v.profit_to_end AS "Net Profit Through Period End",
 CASE WHEN a.starts IS NULL THEN 'No recorded activity' WHEN v.starts IS NULL THEN 'Select one continuous period; exclusions are not supported' ELSE 'Ready' END AS "Selection Status"
FROM allocated a LEFT JOIN valid v ON true
