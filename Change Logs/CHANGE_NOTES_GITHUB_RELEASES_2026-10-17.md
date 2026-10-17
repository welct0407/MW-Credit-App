# GitHub Releases from the Release tag workflow — 17 October 2026

Purpose: owner request to publish release information to GitHub Releases when a release is promoted to production, and to backfill the released history. Until now only R063 had a GitHub Release (created by hand); the other tags R061 to R068 had none, and R059 and R060 had neither tag nor release.

Changed scope: `.github/workflows/release-tag.yml` gains a `Publish the GitHub Release` step after the tag is created: body from the new optional `notes` input, else the tag message; title is the tag; `--verify-tag`; marked latest only when the tag is the highest Rnnn in the repository; an existing GitHub Release for the tag is refused. New `publish_only=true` input publishes the release for an existing tag (the tag must sit on the given commit) without creating a tag; the tag message is then not required. `check_only` is unchanged. Rule text in `project/Documents/Rules/Release_Workflow.md` step 4 updated.

Backfill plan (dispatches of this workflow after it is on `main`): R059 and R060 get tag plus release on their recorded source commits (`7aecf69`, `a2f683e`, both on `main`); R061, R062 and R064 to R068 get `publish_only` releases on their existing tags; R063 keeps its existing release. R058 is not backfilled: its Debian source commit `a8cf949` is not in this repository's history. Release bodies are condensed from the tracker's released paragraphs and link to the owning record.

Checks: YAML and bash syntax validated; the publication is exercised by the backfill dispatches recorded below. Recovery: revert this commit; a published release can be deleted in GitHub Releases without touching the tag.
