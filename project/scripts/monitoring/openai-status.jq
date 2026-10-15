# The current OpenAI website's public summary includes groups and active incidents.
# Emit one stable alert label per product; incident text is dashboard-only metadata.
def sgt: try (sub("[.][0-9]+Z$"; "Z") | fromdateiso8601 | . + 28800 | strftime("%Y-%m-%d %H:%M SGT")) catch "Time unavailable";
def text: if type == "string" then . else "" end;
.summary as $s |
["ChatGPT", "Codex"][] as $product |
([$s.structure.items[]?.group? | select(.name == $product)] | first) as $group |
[$group.components[]? | select(.hidden != true) | .component_id] as $ids |
[$s.affected_components[]? | select(.component_id as $id | $ids | index($id))] as $affected |
[$s.ongoing_incidents[]? | select(.status != "resolved" and .status != "closed") |
 select(any(.affected_components[]?; .component_id as $id | $ids | index($id)))] as $incidents |
(($s.id == "01JMDK9XYNY6RXSED6SDWW50WY") and ($s.name == "OpenAI") and
 (($s.affected_components | type) == "array") and (($s.ongoing_incidents | type) == "array") and
 ($ids | length) > 0 and
 (all($s.ongoing_incidents[]?; (.affected_components | type) == "array" and (.affected_components | length) > 0)) and
 (all($affected[]; .status == "operational" or .status == "degraded_performance" or .status == "partial_outage" or .status == "full_outage" or .status == "major_outage" or .status == "under_maintenance"))) as $valid |
(if $valid != true then 4
 elif any($affected[]; .status == "full_outage" or .status == "major_outage") then 0
 elif any($affected[]; .status != "operational") or ($incidents | length) > 0 then 2
 else 1 end) as $status |
(if $status == 4 then "Unknown" elif $status == 0 then "Down" elif $status == 2 then "Degraded" else "Healthy" end) as $state |
($incidents | sort_by(.published_at) | reverse) as $ordered |
{component:($product | ascii_downcase), status:$status, value:(if $status == 0 or $status == 2 then 1 else 0 end),
 details:($product + " — " + $state + "\n" +
   (if $status == 4 then "Current provider status unavailable or response format changed."
    elif ($ordered | length) > 0 then
      ([$ordered[] | (.updates | sort_by(.published_at) | last) as $update |
        .name + "\nStatus: " + (.status | text) +
        "\nUpdated: " + (($update.published_at // .published_at) | sgt) +
        "\n" + (($update.message_string // $update.message.markdown // "No explanation published yet.") | text) +
        "\nhttps://status.openai.com/incidents/" + .id] | join("\n\n"))
    elif $status != 1 then "Affected components: " + ([$affected[] | .component_id as $id | $group.components[] | select(.component_id == $id) | .name] | join(", ")) + ". No incident explanation published yet."
    else "No active incident reported." end) +
   "\nChecked: " + (now + 28800 | strftime("%Y-%m-%d %H:%M SGT"))),
 url:(if ($ordered | length) > 0 then "https://status.openai.com/incidents/" + $ordered[0].id else "https://status.openai.com/" end)}
