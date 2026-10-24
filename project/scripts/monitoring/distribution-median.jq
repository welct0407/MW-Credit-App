# Median of a log-based distribution metric over the whole range (R093, the in-app chat's turn time and rounds):
# the bucket counts of every aligned point are merged (the series share one bucket layout), then the median is
# read from the merged buckets: MODE "interpolate" interpolates linearly inside the bucket that holds the middle
# rank, as Cloud Monitoring's percentile reducers do (a single value is its exact mean); MODE "lower" takes that
# bucket's lower bound, exact for whole numbers in unit-wide linear buckets (model rounds). The value is divided
# by SCALE (milliseconds to seconds). No turn at all gives the field null (the panel shows its grey None, never a
# healthy zero); provider errors, truncation and mixed bucket layouts fail visibly.
def n: (. // 0) | tonumber;
# [lower, upper] of bucket $i ($k finite buckets; 0 is the underflow, $k + 1 the overflow bucket with no upper bound).
def bounds($o; $i; $k):
  if $o.exponentialBuckets then ($o.exponentialBuckets.scale | n) as $s | ($o.exponentialBuckets.growthFactor | n) as $g |
    [(if $i == 0 then 0 else $s * pow($g; $i - 1) end), (if $i > $k then null else $s * pow($g; $i) end)]
  elif $o.linearBuckets then ($o.linearBuckets.offset | n) as $a | ($o.linearBuckets.width | n) as $w |
    [(if $i == 0 then $a else $a + $w * ($i - 1) end), (if $i > $k then null else $a + $w * $i end)]
  elif $o.explicitBuckets then ($o.explicitBuckets.bounds | map(n)) as $b |
    [(if $i == 0 then $b[0] else $b[$i - 1] end), (if $i >= ($b | length) then null else $b[$i] end)]
  else error("Unknown distribution bucket layout") end;
if .error then error("Monitoring query failed")
elif .nextPageToken then error("Distribution response truncated; shorten the time range")
else
  [.timeSeries[]?.points[]?.value.distributionValue | select(. != null and ((.count | n) > 0))] as $d |
  if ($d | length) == 0 then {"__LABEL__": null}
  else
    $d[0].bucketOptions as $o |
    if any($d[]; .bucketOptions != $o) then error("Distribution bucket layouts differ")
    else
      ($o.exponentialBuckets.numFiniteBuckets // $o.linearBuckets.numFiniteBuckets // (($o.explicitBuckets.bounds // [0]) | length - 1) | n) as $k |
      ($d | map(.count | n) | add) as $count |
      ([$d[] | (.bucketCounts // []) | to_entries[] | {i: .key, c: (.value | n)}] | group_by(.i) | map({i: .[0].i, c: (map(.c) | add)})) as $buckets |
      (0.5 * $count) as $rank |
      (if $count == 1 and "__MODE__" == "interpolate" then ($d | map((.mean // 0) * (.count | n)) | add)
       else
         first(foreach $buckets[] as $x ({cum: 0, before: 0}; {cum: (.cum + $x.c), before: .cum};
           if $x.c > 0 and .cum >= $rank then {i: $x.i, c: $x.c, before} else empty end)) as $hit |
         bounds($o; $hit.i; $k) as [$lo, $hi] |
         if "__MODE__" == "lower" or $hi == null then $lo else $lo + ($hi - $lo) * (($rank - $hit.before) / $hit.c) end
       end) as $value |
      {"__LABEL__": ($value / __SCALE__)}
    end
  end
end
