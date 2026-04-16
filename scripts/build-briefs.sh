#!/bin/bash
# Auto-orchestrate implementation of briefs 155-165
# Uses git worktrees + claude -p to build each brief in isolation
#
# Usage:
#   ./scripts/build-briefs.sh              # Run all Wave 1 (independent briefs)
#   ./scripts/build-briefs.sh --wave 2     # Run Wave 2 (dependent briefs, after Wave 1 merged)
#   ./scripts/build-briefs.sh --brief 158  # Run a single brief
#   ./scripts/build-briefs.sh --dry-run    # Show what would run without executing
#
# Each brief gets:
#   - Its own git worktree (isolated copy of the repo)
#   - Its own branch (build/brief-NNN)
#   - A claude -p invocation with the dev-builder prompt
#   - A PR created automatically when done
#
# After all Wave 1 PRs are merged, run --wave 2 for dependent briefs.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKTREE_BASE="$REPO_ROOT/.worktrees"
LOG_DIR="$REPO_ROOT/.worktrees/logs"
BASE_BRANCH="main"
MAX_PARALLEL=4  # Max concurrent builds — adjust based on your machine
DRY_RUN=false
WAVE=""
SINGLE_BRIEF=""

# Wave 1: No dependencies — can all run in parallel
WAVE1_BRIEFS=(158 161 162 163 164 165 155 159)
# Wave 2: Depend on Wave 1 results
WAVE2_BRIEFS=(156 157 160)

# Brief metadata
declare -A BRIEF_FILES=(
  [155]="155-goal-decomposition-progress.md"
  [156]="156-goal-framing-e2e-test.md"
  [157]="157-onboarding-handoff-and-streaming.md"
  [158]="158-briefing-quality.md"
  [159]="159-correction-rate-tracking.md"
  [160]="160-trust-milestone-ux.md"
  [161]="161-email-thread-context-and-fast-path.md"
  [162]="162-exception-handling-quality.md"
  [163]="163-cycle-management-metrics.md"
  [164]="164-process-editing-and-versioning.md"
  [165]="165-proactive-suggestions.md"
)

declare -A BRIEF_NAMES=(
  [155]="goal-decomposition-progress"
  [156]="goal-framing-e2e-test"
  [157]="onboarding-handoff-streaming"
  [158]="briefing-quality"
  [159]="correction-rate-tracking"
  [160]="trust-milestone-ux"
  [161]="email-thread-context"
  [162]="exception-handling-quality"
  [163]="cycle-management-metrics"
  [164]="process-editing-versioning"
  [165]="proactive-suggestions"
)

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --wave)    WAVE="$2"; shift 2 ;;
    --brief)   SINGLE_BRIEF="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --max-parallel) MAX_PARALLEL="$2"; shift 2 ;;
    --base)    BASE_BRANCH="$2"; shift 2 ;;
    -h|--help)
      head -17 "$0" | tail -15
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Determine which briefs to build
if [[ -n "$SINGLE_BRIEF" ]]; then
  BRIEFS=("$SINGLE_BRIEF")
elif [[ "$WAVE" == "2" ]]; then
  BRIEFS=("${WAVE2_BRIEFS[@]}")
elif [[ "$WAVE" == "1" || -z "$WAVE" ]]; then
  BRIEFS=("${WAVE1_BRIEFS[@]}")
else
  echo "Unknown wave: $WAVE (use 1 or 2)"
  exit 1
fi

echo "═══════════════════════════════════════════════════════════"
echo "  Ditto Brief Builder — $(date '+%Y-%m-%d %H:%M')"
echo "  Building ${#BRIEFS[@]} briefs, max $MAX_PARALLEL parallel"
echo "  Base branch: $BASE_BRANCH"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Setup
mkdir -p "$WORKTREE_BASE" "$LOG_DIR"

build_brief() {
  local brief_num="$1"
  local brief_file="${BRIEF_FILES[$brief_num]}"
  local brief_name="${BRIEF_NAMES[$brief_num]}"
  local branch="build/brief-${brief_num}"
  local worktree_path="$WORKTREE_BASE/brief-${brief_num}"
  local log_file="$LOG_DIR/brief-${brief_num}.log"

  echo "[Brief $brief_num] Starting: $brief_name"

  if $DRY_RUN; then
    echo "[Brief $brief_num] DRY RUN — would create worktree at $worktree_path on branch $branch"
    echo "[Brief $brief_num] DRY RUN — would run claude -p with docs/briefs/$brief_file"
    return 0
  fi

  # Clean up any existing worktree for this brief
  if [ -d "$worktree_path" ]; then
    git -C "$REPO_ROOT" worktree remove "$worktree_path" --force 2>/dev/null || true
  fi
  git -C "$REPO_ROOT" branch -D "$branch" 2>/dev/null || true

  # Create worktree with new branch
  git -C "$REPO_ROOT" worktree add -b "$branch" "$worktree_path" "$BASE_BRANCH" >> "$log_file" 2>&1

  # Install dependencies in worktree
  (cd "$worktree_path" && pnpm install --frozen-lockfile >> "$log_file" 2>&1) || true

  # Build the prompt
  local prompt
  prompt=$(cat <<PROMPT
You are the Dev Builder for the Ditto project.

## Your task
Implement Brief ${brief_num} completely. The brief is at docs/briefs/${brief_file}.

## Instructions
1. Read CLAUDE.md for project conventions
2. Read docs/state.md (first 80 lines) for current context
3. Read the brief at docs/briefs/${brief_file} — this is your complete spec
4. Implement every acceptance criterion in the brief
5. Run \`pnpm run type-check\` to verify your changes compile
6. Run any relevant tests with \`pnpm test\` (or specific test files)
7. Do NOT update docs/state.md — that will be done in a batch later
8. Do NOT create a PR — just commit your changes to the current branch
9. Write clear commit messages referencing "Brief ${brief_num}"

## Constraints
- Follow existing code patterns exactly
- Do not refactor or improve code outside the brief's scope
- If the brief references other files, read them before modifying
- If you encounter a blocker, commit what you have with a note about what's blocked

## When done
Commit all changes with a message like:
  feat: [description] (Brief ${brief_num})

Then run type-check one final time to confirm everything compiles.
PROMPT
  )

  # Run claude in the worktree
  echo "[Brief $brief_num] Running claude -p (log: $log_file)"
  (
    cd "$worktree_path"
    claude -p "$prompt" --max-turns 50 >> "$log_file" 2>&1
  )
  local exit_code=$?

  if [ $exit_code -eq 0 ]; then
    # Check if there are actual commits beyond the base
    local commit_count
    commit_count=$(git -C "$worktree_path" rev-list --count "${BASE_BRANCH}..HEAD" 2>/dev/null || echo "0")
    if [ "$commit_count" -gt 0 ]; then
      echo "[Brief $brief_num] ✓ Complete — $commit_count commit(s) on branch $branch"
      # Push the branch
      git -C "$worktree_path" push -u origin "$branch" >> "$log_file" 2>&1 || echo "[Brief $brief_num] ⚠ Push failed — branch exists locally"
    else
      echo "[Brief $brief_num] ⚠ Claude finished but made no commits"
    fi
  else
    echo "[Brief $brief_num] ✗ Failed (exit code $exit_code) — check $log_file"
  fi

  return $exit_code
}

# Track background jobs
declare -A PIDS=()
FAILURES=0

run_with_throttle() {
  local brief_num="$1"

  # Wait if we're at max parallel
  while [ ${#PIDS[@]} -ge $MAX_PARALLEL ]; do
    for pid in "${!PIDS[@]}"; do
      if ! kill -0 "$pid" 2>/dev/null; then
        wait "$pid" || ((FAILURES++))
        unset "PIDS[$pid]"
        break
      fi
    done
    sleep 2
  done

  # Launch in background
  build_brief "$brief_num" &
  PIDS[$!]="$brief_num"
}

# Launch all briefs with throttling
for brief in "${BRIEFS[@]}"; do
  run_with_throttle "$brief"
done

# Wait for remaining jobs
echo ""
echo "All briefs launched. Waiting for completion..."
for pid in "${!PIDS[@]}"; do
  wait "$pid" || ((FAILURES++))
done

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Build complete: $((${#BRIEFS[@]} - FAILURES))/${#BRIEFS[@]} succeeded"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Summary of branches
echo "Branches created:"
for brief in "${BRIEFS[@]}"; do
  local branch="build/brief-${brief}"
  if git -C "$REPO_ROOT" rev-parse --verify "$branch" >/dev/null 2>&1; then
    local count=$(git -C "$REPO_ROOT" rev-list --count "${BASE_BRANCH}..${branch}" 2>/dev/null || echo "?")
    echo "  $branch — $count commit(s)"
  else
    echo "  $branch — not created"
  fi
done

echo ""
echo "Next steps:"
echo "  1. Review each branch: git log main..build/brief-NNN"
echo "  2. Create PRs: gh pr create --base main --head build/brief-NNN"
echo "  3. Merge non-conflicting PRs first"
echo "  4. After Wave 1 is merged, run: ./scripts/build-briefs.sh --wave 2"

# Cleanup worktrees (optional — uncomment if you want auto-cleanup)
# for brief in "${BRIEFS[@]}"; do
#   git -C "$REPO_ROOT" worktree remove "$WORKTREE_BASE/brief-${brief}" --force 2>/dev/null || true
# done

exit $FAILURES
