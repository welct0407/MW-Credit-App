# Left edge of a state-timeline row. The row query starts before the panel range (the hidden
# lookback_from variable) and the row's own selector turns it into {time, value} events as usual.
# Here every event before the range start (epoch s) is dropped except the last one at or before it,
# which moves to exactly the range start: the state carried in from before the range. A carried
# state older than the row's freshness bound at the range start becomes null (Unknown), never a stretched old
# state; with nothing before the start the row also begins with null. No event lies before the
# range start or after now, so every row starts exactly at the range start.
def clip($from; $stale):
  . as $e |
  ([$e[] | select(.t <= $from)] | last) as $c |
  (if $c == null or ($c.value != null and $from - $c.t > $stale) then {t: $from, value: null}
   else {t: $from, value: $c.value} end),
  ($e[] | select(.t > $from) | .t |= ([., (now | floor)] | min));
(__FROM__) as $from |
[
__SELECTOR__
] | map({t: (.time | fromdateiso8601), value}) | [clip($from; __STALE__)] | .[] | {time: (.t | todateiso8601), value}
