#!/usr/bin/env bash
# SessionStart hook for Claude Code cloud sessions (registered in
# .claude/settings.json). The environment snapshot is built before the
# repository is cloned, so per-checkout preparation happens here, once per
# session, synchronously: root dependencies, the Python path for the pinned
# psycopg, proxy bypass for the app origins (Chromium ignores Playwright host
# mapping when the sandbox proxy handles them), a disposable PostgreSQL lab
# directory the postgres user can write, and a full fetch refspec so the git
# stop hook counts unpushed commits against the real upstream.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci --no-audit --no-fund >/dev/null
fi

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    [ -d /workspace/.setup/python-deps ] && echo 'export PYTHONPATH="/workspace/.setup/python-deps${PYTHONPATH:+:$PYTHONPATH}"'
    hosts="dev-lm.mw-credit.com,lm.mw-credit.com,.web.app,.run.app"
    echo "export NO_PROXY=\"\${NO_PROXY:+\$NO_PROXY,}$hosts\""
    echo "export no_proxy=\"\${no_proxy:+\$no_proxy,}$hosts\""
    echo 'export MW_LAB_DIR=/tmp/mw-labs'
  } >> "$CLAUDE_ENV_FILE"
fi

if id postgres >/dev/null 2>&1; then
  install -d -m 700 -o postgres -g postgres /tmp/mw-labs
fi

if ! git config --get-all remote.origin.fetch | grep -qx '+refs/heads/\*:refs/remotes/origin/\*'; then
  git config --add remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
fi
