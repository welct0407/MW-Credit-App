# GCP budget "Budget-GCP" from the Cloud Billing Budget API v1
# (GET billingbudgets.googleapis.com/v1/billingAccounts/<account>/budgets), one row:
#   Name   display name, null when none
#   Kind   "specified", "last period" or "none" (no budget named Budget-GCP; never 0)
#   SGD    monthly amount, units + nanos / 1e9, null unless Kind is "specified"
#   Scope  "whole billing account" (no project filter) or the projects it is limited to
# Errors, never a value: provider error, truncated list (nextPageToken), unreadable response,
# several budgets named Budget-GCP, a budget that is not monthly, a currency other than SGD.
if type != "object" then error("Budget response unavailable")
elif .error then error("Budget API error: " + ((.error.message // .error.status // .error) | tostring))
elif (.nextPageToken // "") != "" then error("Budget list truncated")
elif (.budgets // []) | type != "array" then error("Budget response unavailable")
else
  [(.budgets // [])[] | select(.displayName == "Budget-GCP")] as $mine |
  if ($mine | length) == 0 then {Name: null, Kind: "none", SGD: null, Scope: null}
  elif ($mine | length) > 1 then error("Several GCP budgets named Budget-GCP")
  else
    $mine[0] as $b | $b.displayName as $name |
    ((($b.budgetFilter.projects // []) | if length == 0 then "whole billing account" else "projects " + join(", ") end) +
      (if (($b.budgetFilter.services // []) | length) > 0 then " · selected services" else "" end)) as $scope |
    if $b.budgetFilter.customPeriod != null or ($b.budgetFilter.calendarPeriod // "MONTH") != "MONTH" then error("GCP budget " + $name + " is not monthly")
    elif $b.amount.lastPeriodAmount != null then {Name: $name, Kind: "last period", SGD: null, Scope: $scope}
    elif ($b.amount.specifiedAmount | type) != "object" then error("GCP budget " + $name + " has no amount")
    elif $b.amount.specifiedAmount.currencyCode != "SGD" then error("GCP budget currency is not SGD")
    else {Name: $name, Kind: "specified", Scope: $scope,
      SGD: ((($b.amount.specifiedAmount.units // "0") | tonumber) + (($b.amount.specifiedAmount.nanos // 0) / 1000000000))}
    end
  end
end
