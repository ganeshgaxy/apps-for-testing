---
name: noob-visual-pool
description: Run visual QA pool agents for a ticket. Checks qa_pool_agents for config, creates a visual run, populates entries, enumerates pending visual test cases (filtering already-claimed), then launches one sub-agent per test case (round-robin across agent configs). Each sub-agent claims its assigned test case by name via --name flag — no race conditions.
---

# Visual QA Pool

Orchestrate visual testing agents for a ticket with zero race conditions. Creates a visual run, populates entries, enumerates pending ones (filtering already-claimed/done), assigns each to a sub-agent by **name** using round-robin, then fires one `claude` process per visual test case. Each sub-agent claims its own specific test case via `visual-run claim-next --name "TITLE"` — no two agents get the same title, so no races.

---

## Step 1 — Check and Prepare Config

```bash
TICKET_ID="<TICKET-ID>"
MODE="${1:-baseline}"   # passed by calling agent: baseline or verification

AGENTS=$(noob-tester qa-pool list --ticket "$TICKET_ID" --json)
AGENT_COUNT=$(echo "$AGENTS" | jq 'length')

if [ "$AGENT_COUNT" -eq 0 ]; then
  echo "No QA pool agents configured for $TICKET_ID."
  exit 1
fi
```

**If config found and user asked to update something:**

```bash
ENTRY_ID=$(echo "$AGENTS" | jq -r '.[] | select(.agent_path | contains("<partial-path>")) | .id' | head -1)

noob-tester qa-pool update "$ENTRY_ID" --target <new-target>       # if target changed
noob-tester qa-pool update "$ENTRY_ID" --role <new-role>           # if role changed
noob-tester qa-pool update "$ENTRY_ID" --agent <new-path>          # if agent changed
noob-tester qa-pool update "$ENTRY_ID" --file <new-file>           # if file changed
noob-tester qa-pool update "$ENTRY_ID" --launch-dir <new-dir>     # if launch dir changed

AGENTS=$(noob-tester qa-pool list --ticket "$TICKET_ID" --json)
AGENT_COUNT=$(echo "$AGENTS" | jq 'length')
```

**If no config found, register it first:**

```bash
noob-tester qa-pool add \
  --ticket "$TICKET_ID" \
  --agent <agent-path> \
  --target <target-name> \
  --role <role> \
  --file <file-path> \
  --launch-dir <directory>   # optional — defaults to pwd if omitted

AGENTS=$(noob-tester qa-pool list --ticket "$TICKET_ID" --json)
AGENT_COUNT=$(echo "$AGENTS" | jq 'length')
```

---

## Step 2 — Get Latest Visual Run (by mode) and Enumerate Pending Entries

`MAX_SPAWNS` controls how many agents are launched. Default is **5**. Override if user specifies a number.

```bash
MAX_SPAWNS=5   # default — override if user specified a number

# Get the latest visual run for this ticket in the specified mode
ALL_RUNS=$(noob-tester visual-run list --ticket "$TICKET_ID" --json)
RECENT_RUN=$(echo "$ALL_RUNS" | jq --arg mode "$MODE" '.[] | select(.mode == $mode) | . // empty' | head -1)

if [ -z "$RECENT_RUN" ] || [ "$RECENT_RUN" = "null" ]; then
  echo "No existing visual run found for $TICKET_ID in mode '$MODE'. Create one first with noob-tester visual-run start."
  exit 1
fi

VISUAL_RUN_ID=$(echo "$RECENT_RUN" | jq -r '.id')

echo "Using visual run: $VISUAL_RUN_ID (mode: $MODE)"

# Fetch all entries in the visual run
RUN_ENTRIES=$(noob-tester visual-run get "$VISUAL_RUN_ID" --entries | jq '.entries // []')

# Filter to pending entries only (exclude running, passed, failed, skipped)
PENDING=$(echo "$RUN_ENTRIES" | jq '
  [.[] | select(.status == "pending")]
  | .[:'"$MAX_SPAWNS"']
')

PENDING_COUNT=$(echo "$PENDING" | jq 'length')

if [ "$PENDING_COUNT" -eq 0 ]; then
  echo "No pending visual test case entries in run $VISUAL_RUN_ID. Nothing to run."
  exit 0
fi

echo "Dispatching $PENDING_COUNT pending visual test case entries (max: $MAX_SPAWNS)."
```

---

## Step 3 — Assign Pending Entries Round-Robin and Pre-Claim

Distribute pending visual run entries round-robin across agent configs, then pre-claim each one.

```bash
# Build an array of agent configs for round-robin
AGENT_PATHS=($(echo "$AGENTS" | jq -r '.[].agent_path'))
AGENT_TARGETS=($(echo "$AGENTS" | jq -r '.[].target // ""'))
AGENT_ROLES=($(echo "$AGENTS" | jq -r '.[].role // "default"'))
AGENT_FILES=($(echo "$AGENTS" | jq -r '.[].file // ""'))
AGENT_DIRS=($(echo "$AGENTS" | jq -r '.[].launch_dir // ""'))

i=0
LAUNCHES=()

# Assign and pre-claim visual test case entries
echo "$PENDING" | jq -c '.[]' | while read -r ENTRY; do
  ENTRY_ID=$(echo "$ENTRY" | jq -r '.id')
  IDX=$(( i % AGENT_COUNT ))

  AGENT_PATH="${AGENT_PATHS[$IDX]}"
  TARGET="${AGENT_TARGETS[$IDX]}"
  ROLE="${AGENT_ROLES[$IDX]}"
  FILE="${AGENT_FILES[$IDX]}"
  DIR="${AGENT_DIRS[$IDX]}"

  # ← PRE-CLAIM: Transition entry to claimed status
  CLAIM_OUTPUT=$(noob-tester visual-run entry-claim --run "$VISUAL_RUN_ID" --entry "$ENTRY_ID" 2>/dev/null)
  CLAIMED=$(echo "$CLAIM_OUTPUT" | jq -r '.claimed // false')

  if [ "$CLAIMED" != "true" ]; then
    echo "  Warning: Could not claim entry '$ENTRY_ID' — skipping"
    i=$(( i + 1 ))
    continue
  fi

  # Save claimed data to unique file for this agent
  CLAIM_FILE="/tmp/pool-visual-claim-${i}.json"
  echo "$CLAIM_OUTPUT" > "$CLAIM_FILE"

  # Build invocation for visual test with claim file
  INVOCATION="run visual $MODE test for ticket $TICKET_ID, run $VISUAL_RUN_ID entry $ENTRY_ID with agent @${AGENT_PATH}"
  [ -n "$TARGET" ] && INVOCATION="$INVOCATION with target $TARGET"
  [ -n "$ROLE" ] && [ "$ROLE" != "default" ] && INVOCATION="$INVOCATION and role $ROLE"
  [ -n "$FILE" ] && INVOCATION="$INVOCATION and file $FILE"
  INVOCATION="$INVOCATION and use claimed entry from $CLAIM_FILE"

  echo "$DIR|$AGENT_PATH|$INVOCATION" >> /tmp/pool-visual-launches.txt
  i=$(( i + 1 ))
done

# Read all launches
if [ -f /tmp/pool-visual-launches.txt ]; then
  mapfile -t LAUNCHES < /tmp/pool-visual-launches.txt
  rm -f /tmp/pool-visual-launches.txt
fi

echo "Prepared ${#LAUNCHES[@]} agent invocations (round-robin assigned and pre-claimed)."
```

---

## Step 4 — Launch Sub-Agents (Fire and Forget)

Each agent entry has its own `launch_dir`. The `cd` happens per-spawn in a subshell so agents can launch from different directories. Each spawn is recorded for tracking and management.

```bash
for LAUNCH in "${LAUNCHES[@]}"; do
  DIR="${LAUNCH%%|*}"
  REST="${LAUNCH#*|}"
  AGENT_PATH="${REST%%|*}"
  INVOCATION="${REST#*|}"

  echo "→ Spawning @${AGENT_PATH} for: $(echo "$INVOCATION" | grep -o 'Test case: "[^"]*"')"

  if [ -n "$DIR" ] && [ -d "$DIR" ]; then
    (cd "$DIR" && claude -p "$INVOCATION" --agent "@${AGENT_PATH}") &
  else
    [ -n "$DIR" ] && echo "  Warning: launch_dir '$DIR' not found, using current directory"
    claude -p "$INVOCATION" --agent "@${AGENT_PATH}" &
  fi

  # Record the spawn for tracking
  AGENT_PID=$!
  noob-tester pool-spawns record --ticket "$TICKET_ID" --agent "@${AGENT_PATH}" --pid $AGENT_PID --type visual-pool > /dev/null 2>&1
done

echo "All ${#LAUNCHES[@]} visual test agents spawned. Monitor at http://localhost:4040 → Visual Runs"
echo "Manage spawned agents: noob-tester pool-spawns list --ticket $TICKET_ID --active"
```

Do **not** call `wait` — return to the user immediately after spawning. The agents run in the background and record their results to the database as they finish. Spawned agent tracking allows you to view and kill agents via the pool menu in the dashboard.

---

## Step 5 — Report

Tell the user:

- Visual run ID and mode (baseline or verification)
- How many pending visual test case entries were dispatched
- How many agents were launched (capped at MAX_SPAWNS)
- Which agent configs were used (round-robin distribution)
- Whether config was pre-existing or newly registered
- Whether any fields were updated before running
- Dashboard URL to monitor: `http://localhost:4040` → Visual Runs

---

## Notes

- **Reuse existing visual run** — Step 2 retrieves the latest visual run for the ticket in the specified mode (baseline or verification, created via `noob-tester visual-run start`). If no run exists in that mode, the skill exits and asks the user to create one first.
- **Mode parameter** — passed by the calling agent (e.g., `--mode baseline` or `--mode verification`). The mode determines which visual run to use and is stored on the `visual_runs` table.
- **Pending entries only** — only entries with status `pending` are dispatched. Entries with status `running`, `passed`, `failed`, or `skipped` are skipped.
- **Pre-claim atomic** — each agent is assigned one pending entry via round-robin. The entry is atomically claimed (status → `claimed`) before the agent is launched, preventing race conditions.
- **Claim file format** — saved to `/tmp/pool-visual-claim-${i}.json` and contains the full entry data including visual_run_id, entry_id, test case details, and visual_steps config. Agents read this via the `CLAIM_FILE` path passed in invocation.
- **Round-robin** — distributes pending entries evenly across agent configs. With 2 configs and 6 pending entries: config[0] gets entries 0,2,4 — config[1] gets 1,3,5.
- **Agent path** — stored without `@` in the DB; prepend `@` in the `claude` invocation.
- **Target** — a named reference in the `targets` table resolved at runtime by the sub-agent (not a raw URL).
- **Role** — selects which credential set to inject from the `secrets` table for the given target.
- **Missing agent file** — if a `.md` file doesn't exist on disk, warn the user and skip that config entry.
- **Mode semantics** — `baseline` captures reference screenshots; `verification` captures + diffs against baseline. A baseline run must complete before verification can run.
- **MAX_SPAWNS** — caps how many agents are launched. Default 5. Remaining pending entries stay unclaimed for a subsequent `/noob-visual-pool` invocation.
