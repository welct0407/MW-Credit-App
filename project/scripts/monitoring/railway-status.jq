# Railway public status (Instatus, railway.instatus.com/summary.json; Railway hosts Metabase and
# the reports). Live when healthy: {"page": {"name": "Railway", "url": ..., "status": "UP"}}; when
# not, page.status is HASISSUES or UNDERMAINTENANCE and the optional arrays activeIncidents
# ({name, impact, status, started}) and activeMaintenances ({name, status, start}) list the events.
# Status codes as the Google Cloud row: 0 Outage (a MAJOROUTAGE incident), 2 Incident open (any
# active incident or HASISSUES), 3 Maintenance (an in-progress maintenance or UNDERMAINTENANCE),
# 1 No incident (UP, nothing active), 4 Feed unreadable (anything else, including a changed shape).
def listed($k): (.[$k] // []) | if type == "array" then [.[] | select(type == "object")] else null end;
if type != "object" or (.page | type) != "object" or (.page.status | type) != "string"
   or listed("activeIncidents") == null or listed("activeMaintenances") == null
then {name: "Railway", status: 4, details: "Railway status feed unreadable or format changed."}
else
  listed("activeIncidents") as $incidents |
  [listed("activeMaintenances")[] | select((.status // "INPROGRESS") == "INPROGRESS")] as $maintenance |
  .page.status as $page |
  {name: "Railway",
   status: (if any($incidents[]; .impact == "MAJOROUTAGE") then 0
            elif ($incidents | length) > 0 or $page == "HASISSUES" then 2
            elif ($maintenance | length) > 0 or $page == "UNDERMAINTENANCE" then 3
            elif $page == "UP" then 1 else 4 end),
   details: (if ($incidents | length) + ($maintenance | length) == 0 then "Railway status: " + $page + "."
     else ([$incidents[] | (.name // "Incident") + " · " + ((.impact // .status // "") | tostring)] +
           [$maintenance[] | (.name // "Maintenance") + " · maintenance"] | join("\n")) end)}
end
