#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "run as root" >&2
  exit 1
fi

repo=/opt/mw-integration-agent-src
if [ -n "$(git -C "$repo" status --porcelain)" ]; then
  echo "refusing to update a dirty checkout" >&2
  exit 1
fi

git -C "$repo" fetch --prune origin main
git -C "$repo" merge --ff-only origin/main
git -C "$repo" rev-parse HEAD
