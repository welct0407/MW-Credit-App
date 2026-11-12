#!/usr/bin/env bash
# One-off backfill of the R001 to R058 release tags (owner instruction, 12 November 2026).
# Run only by the "Release tag" workflow's backfill job, from the branch that carries this file.
#
# For every manifest entry it creates the annotated tag on the given commit with the tag date set to the original
# release time, then publishes the GitHub Release (first line: the real release date). An entry marked "replace" may
# replace a tag that the workflow created on 12 November 2026 with that day's date, on the same commit only; the
# owner approved that replacement for those thirteen tags. Nothing else is ever deleted or moved.
# DRY_RUN=true prints the plan and changes nothing.
set -euo pipefail

manifest=${1:?usage: backfill-release-tags.sh <manifest.json>}
dry=${DRY_RUN:-false}
repo=${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}
pause=${BACKFILL_PAUSE_SECONDS:-2}
fail() { echo "::error::$*"; exit 1; }
run() { if [ "$dry" = "true" ]; then echo "  dry run: $*"; else "$@"; fi; }

count=$(jq 'length' "$manifest")
[ "$count" -gt 0 ] || fail "empty manifest"
[ "$(jq -r '[.[].tag] | unique | length' "$manifest")" = "$count" ] || fail "duplicate tag in the manifest"
created=0; replaced=0; kept=0; published=0

for i in $(seq 0 $((count - 1))); do
  tag=$(jq -r ".[$i].tag" "$manifest")
  commit=$(jq -r ".[$i].commit" "$manifest")
  when=$(jq -r ".[$i].date" "$manifest")
  released=$(jq -r ".[$i].released" "$manifest")
  message=$(jq -r ".[$i].message" "$manifest")
  replace=$(jq -r ".[$i].replace // false" "$manifest")

  [[ "$tag" =~ ^R0(0[1-9]|[1-4][0-9]|5[0-8])$ ]] || fail "$tag is outside R001 to R058"
  [[ "$commit" =~ ^[0-9a-f]{40}$ ]] || fail "$tag: commit must be a full 40-character SHA"
  [[ -n "${message//[[:space:]]/}" && -n "$released" ]] || fail "$tag: message and released are required"
  want=$(date -u -d "$when" +%s) || fail "$tag: unreadable date $when"
  git cat-file -e "$commit^{commit}" || fail "$tag: commit $commit not found"
  git merge-base --is-ancestor "$commit" origin/main || fail "$tag: commit $commit is not on main"

  make=true
  if git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null; then
    git fetch --quiet origin "+refs/tags/$tag:refs/tags/$tag"
    [ "$(git rev-list -n1 "$tag")" = "$commit" ] || fail "$tag exists on another commit; release tags are never moved"
    have=$(git for-each-ref --format='%(taggerdate:unix)' "refs/tags/$tag")
    tagger=$(git for-each-ref --format='%(taggername)' "refs/tags/$tag")
    if [ "$have" = "$want" ]; then
      make=false; kept=$((kept + 1)); echo "$tag: already on ${commit:0:10} with the release date"
    elif [ "$replace" = "true" ] && [ "$tagger" = "github-actions[bot]" ] && [ -n "$have" ] && [ "$(date -u -d "@$have" +%F)" = "2026-11-12" ]; then
      echo "$tag: replacing the tag dated 12 November 2026 (same commit ${commit:0:10})"
      if gh release view "$tag" --repo "$repo" >/dev/null 2>&1; then run gh release delete "$tag" --repo "$repo" --yes; fi
      run git push --quiet origin --delete "refs/tags/$tag"
      run git tag -d "$tag"
      replaced=$((replaced + 1))
    else
      fail "$tag exists with another date and is not an approved replacement"
    fi
  fi

  if [ "$make" = "true" ]; then
    echo "$tag: tag on ${commit:0:10} dated $when"
    if [ "$dry" != "true" ]; then
      GIT_COMMITTER_DATE="$when" git tag -a "$tag" "$commit" -m "$message"
      git push --quiet origin "refs/tags/$tag"
    fi
    created=$((created + 1))
  fi

  if [ "$dry" != "true" ] && gh release view "$tag" --repo "$repo" >/dev/null 2>&1; then
    echo "$tag: GitHub Release already exists; left as it is"
  else
    notes=$(mktemp)
    printf 'Released %s (Asia/Bangkok).\n\n%s\n' "$released" "$message" >"$notes"
    run gh release create "$tag" --repo "$repo" --verify-tag --title "$tag" --notes-file "$notes" --latest=false
    rm -f "$notes"
    published=$((published + 1))
  fi
  [ "$dry" = "true" ] || sleep "$pause"
done

echo "Backfill finished (dry run: $dry): $count entries, $created tags created ($replaced of them replacements), $kept already correct, $published GitHub Releases published"
