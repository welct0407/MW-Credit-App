# Anthropic public status (Statuspage, status.claude.com/api/v2/summary.json; status.anthropic.com answers
# 301 to it and Grafana's Infinity proxy is pointed at the final host). R143: Claude Opus 5.5 reads PROD slips
# and the chat uses Claude, both through api.anthropic.com, so only the component "Claude API
# (api.anthropic.com)" (id k8w3r06qmzrp) counts; claude.ai, Console, Claude Code and the cloud-platform
# components do not. Status codes as the Railway and Google Cloud rows: 0 Outage (the API component in
# major_outage, or an open incident on it with impact critical), 2 Incident open (an open incident on the
# API, or the API degraded or in partial outage), 3 Maintenance (an in-progress or verifying maintenance on
# the API, or the API under_maintenance), 1 No incident (operational, nothing open), 4 Feed unreadable
# (anything else, including a changed shape or a missing API component).
def objects($k): (.[$k] // []) | if type == "array" then [.[] | select(type == "object")] else null end;
def touches($id): [(.components // [])[]? | select(type == "object") | .id] | index($id) != null;
"k8w3r06qmzrp" as $api |
if type != "object" or objects("components") == null or objects("incidents") == null
   or objects("scheduled_maintenances") == null
   or ([objects("components")[] | select(.id == $api and (.status | type) == "string")] | length) != 1
then {name: "Anthropic", status: 4, details: "Anthropic status feed unreadable or format changed."}
else
  ([objects("components")[] | select(.id == $api)][0].status) as $component |
  [objects("incidents")[] | select((.status // "") != "resolved" and (.status // "") != "postmortem" and touches($api))] as $incidents |
  [objects("scheduled_maintenances")[] | select((.status == "in_progress" or .status == "verifying") and touches($api))] as $maintenance |
  {name: "Anthropic",
   status: (if $component == "major_outage" or any($incidents[]; .impact == "critical") then 0
            elif ($incidents | length) > 0 or $component == "partial_outage" or $component == "degraded_performance" then 2
            elif ($maintenance | length) > 0 or $component == "under_maintenance" then 3
            elif $component == "operational" then 1 else 4 end),
   details: (if ($incidents | length) + ($maintenance | length) == 0 then "Claude API: " + $component + "."
     else ([$incidents[] | (.name // "Incident") + " · " + ((.impact // .status // "") | tostring)] +
           [$maintenance[] | (.name // "Maintenance") + " · maintenance"] | join("\n")) end)}
end
