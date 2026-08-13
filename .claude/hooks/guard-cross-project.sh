#!/usr/bin/env bash
#
# PreToolUse guard: keep the legacy app and the v2 rebuild from touching
# each other.
#
# Why this exists: two separate projects are both named "eliterank", and the
# directory names differ by a single suffix.
#
#   /development/eliterank            legacy — eliterank-co/eliterank
#                                     LIVE PRODUCTION, real users, real money
#                                     Supabase jioblcflgpqcfdmzjnto
#   /development/eliterank-workplace  v2 rebuild — eliterank-co/eliterank-infra
#                                     Supabase dhiipdxsspmvaifvfffb
#
# Both repos moved under the same GitHub org on 2026-08-13, so the org no
# longer separates them. This guard never relied on it — it discriminates on
# filesystem path and Supabase project ref, both of which are still exact.
#
# `eliterank` is a strict prefix of `eliterank-workplace`, so a careless glob
# or a half-remembered path lands in the wrong tree. Sessions have already
# confused the two: 11 worktrees were created in the shared parent, and the v2
# rebuild docs were found sitting untracked inside the legacy checkout.
#
# Reads across the boundary are allowed and useful — comparing legacy
# behaviour against v2 is the point of a migration. MUTATIONS are not.
#
# Decision: "ask". The owner can always say yes; an agent cannot decide alone.
# Exit 0 + JSON on stdout drives the decision. Silence = allow.

set -uo pipefail

LEGACY_DIR='/Users/guillermovillegas/development/eliterank'
V2_DIR='/Users/guillermovillegas/development/eliterank-workplace'
LEGACY_REF='jioblcflgpqcfdmzjnto'   # legacy Supabase — LIVE PRODUCTION
V2_REF='dhiipdxsspmvaifvfffb'       # eliterank-v2 Supabase

payload="$(cat)"
tool="$(printf '%s' "$payload" | jq -r '.tool_name // empty')"

# Orient: which side of the boundary is this session on?
here="${CLAUDE_PROJECT_DIR:-$PWD}"
case "$here" in
  "$V2_DIR"|"$V2_DIR"/*) other_dir="$LEGACY_DIR"; other_ref="$LEGACY_REF"; other_name='the LEGACY production app'; own_ref="$V2_REF" ;;
  *)                     other_dir="$V2_DIR";     other_ref="$V2_REF";     other_name='the v2 rebuild workplace';  own_ref="$LEGACY_REF" ;;
esac

ask() {
  jq -n --arg r "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: $r
    }
  }'
  exit 0
}

# Match the other project's root but NEVER its longer-named sibling:
# "eliterank/" must not match "eliterank-workplace/". Requiring a "/" or
# end-of-string immediately after the root is what keeps them apart.
crosses_dir() {
  printf '%s' "$1" | grep -qE "(^|[^A-Za-z0-9_-])${other_dir}(/|\$|[^A-Za-z0-9_-])"
}

case "$tool" in
  Write|Edit|NotebookEdit)
    path="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')"
    [ -z "$path" ] && exit 0
    if crosses_dir "$path"; then
      ask "CROSS-PROJECT WRITE BLOCKED — this session is in $(basename "$here"), but the target is inside $other_name:

  $path

These are two different projects that happen to share a name. Confirm only if you deliberately intend to edit $other_name from here."
    fi
    ;;

  Bash)
    cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty')"
    [ -z "$cmd" ] && exit 0

    # Supabase project refs are unambiguous — flag either direction.
    if printf '%s' "$cmd" | grep -q "$other_ref"; then
      ask "CROSS-PROJECT DATABASE REFERENCE — this session is in $(basename "$here"), but the command references $other_name's Supabase project ($other_ref).

The two databases are not interchangeable. Confirm only if this is deliberate."
    fi

    # Naming the WRONG project is only half the risk. Naming NO project is the
    # other half, and it is the one that actually bit us.
    #
    # A `supabase` subcommand that mutates a remote takes its target from
    # ambient link state (supabase/.temp/project-ref), not from the command
    # text — so the dangerous command looks completely innocent at the call
    # site. Before this repo had a supabase/config.toml, the CLI climbed to
    # $HOME and resolved that state to an unrelated project in a different org.
    # `supabase db push` here meant "push 136 migrations to somebody else's
    # production database".
    #
    # config.toml now makes that fail closed, but config.toml is one `rm` away.
    # This rule is the belt to its braces: a remote mutation must NAME the
    # project this repo owns, or the owner confirms it.
    sb_mutators='(db[[:space:]]+(push|reset)|db[[:space:]]+remote[[:space:]]+commit|migration[[:space:]]+(up|repair)|functions[[:space:]]+(deploy|delete)|secrets[[:space:]]+(set|unset)|(^|[[:space:]])link([[:space:]]|$))'
    if printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])supabase([[:space:]]|$)' \
       && printf '%s' "$cmd" | grep -qE "$sb_mutators" \
       && ! printf '%s' "$cmd" | grep -q "$own_ref"; then
      ask "UNPINNED SUPABASE MUTATION — this command changes a remote Supabase project without naming one:

  $cmd

The target would come from ambient link state, which is invisible here and has previously resolved to an unrelated production project. This repo owns exactly one database:

  $own_ref

Prefer an explicit --project-ref $own_ref. Confirm only if you are certain which database this lands on."
    fi

    # Path crossings only matter when the command can MUTATE. Reads are fine.
    #
    # Mutation verbs are matched as free-standing words rather than anchored to
    # their program, because `git -C <path> push` puts flags between the two —
    # anchoring on `git[[:space:]]+push` misses it entirely.
    mutators='(^|[;&|[:space:]])(rm|mv|cp|mkdir|rmdir|touch|tee|dd|chmod|chown|ln|npm|pnpm|yarn|supabase|vercel)([[:space:]]|$)'
    subcmds='(^|[[:space:]])(commit|push|checkout|switch|restore|reset|clean|rebase|merge|worktree|stash|apply|cherry-pick|init|add)([[:space:]]|$)'
    if crosses_dir "$cmd" && printf '%s' "$cmd" | grep -qE "$mutators|$subcmds|>[^&]|>>"; then
      ask "CROSS-PROJECT MUTATION BLOCKED — this session is in $(basename "$here"), but the command writes into $other_name:

  $cmd

Reads across the two projects are fine; writes are not. Confirm only if you deliberately intend this."
    fi
    ;;
esac

exit 0
