#!/bin/bash
set -euo pipefail

# SessionStart hook: install Node dependencies so linters, tests, and the
# build actually work in Claude Code on the web. The remote container is
# cloned fresh with no node_modules, so without this every session starts
# with `npm run lint` / `vitest` / `vite build` non-functional.
#
# Scope: web/remote only. Local sessions manage their own dependencies.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# `npm install` (not `npm ci`) on purpose: it's idempotent — a near no-op when
# node_modules is already current — and the container caches state after the
# hook completes, so repeat sessions stay fast. npm chatter is redirected to a
# logfile OUTSIDE the repo so it never pollutes git status or the agent's
# context; only a one-line status goes to stderr.
LOG="/tmp/eliterank-install-deps.log"
if npm install --no-audit --no-fund > "$LOG" 2>&1; then
  echo "session-start: npm install complete" >&2
else
  echo "session-start: npm install FAILED — see $LOG; session continues without deps" >&2
fi

# Never fail the session start, even if install failed.
exit 0
