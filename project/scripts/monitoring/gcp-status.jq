# Google Cloud public incidents feed (status.cloud.google.com/incidents.json, an
# array). Open incidents (no end) whose affected products include a service MW
# Credit uses and whose current locations are empty (global) or include
# asia-southeast1 or global: status 2 with titles and update time; none 1; a
# response that is not the documented array shape 4 (feed unreadable).
def bkk: try (sub("[.][0-9]+"; "") | sub("[+]00:00$"; "Z") | fromdateiso8601 | . + 25200 |
  strftime("%Y-%m-%d %H:%M ICT")) catch "time unavailable";
["Cloud Run", "Cloud SQL", "Vertex AI", "Cloud Scheduler", "Cloud Monitoring", "Firebase Hosting"] as $products |
if type != "array" or any(.[]; type != "object" or ((.affected_products // []) | type) != "array")
then {name: "Google Cloud", status: 4, details: "Google Cloud status feed unreadable or format changed."}
else
  [.[] | select(.end == null) |
    select(any(.affected_products[]?; (.title // "") as $t | any($products[]; . as $p | $t | contains($p)))) |
    select(((.currently_affected_locations // []) | length) == 0 or
      any(.currently_affected_locations[]?; .id == "asia-southeast1" or .id == "global"))] as $open |
  {name: "Google Cloud",
   status: (if ($open | length) > 0 then 2 else 1 end),
   details: (if ($open | length) == 0 then "No open incident for Cloud Run, Cloud SQL, Vertex AI, Cloud Scheduler, Cloud Monitoring or Firebase Hosting in asia-southeast1 or global."
     else ([$open[] | (.external_desc // "Incident") + " · " + ((.most_recent_update.status // .severity // "") | tostring) +
       " · updated " + ((.most_recent_update.when // "") | bkk)] | join("\n")) end)}
end
