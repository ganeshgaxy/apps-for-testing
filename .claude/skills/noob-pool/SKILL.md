---
name: noob-pool
description: Run QA pool agents for a ticket. Checks the qa_pool_agents table for existing config — if found, enumerates all pending test cases and launches one targeted sub-agent per test case (round-robin across agent configs) to eliminate race conditions. If no config found, registers it first. Supports updating fields before running.
---

# QA Pool

Orchestrate all configured QA agents for a ticket with zero race conditions. The key insight: **enumerate test cases first, then assign each one explicitly to a specific agent invocation**. No two agents ever compete for the same test case.

## Why Per-Test-Case Assignment?

When multiple `claude` processes run in parallel, they share the same SQLite database. If each agent independently claims the next available test case (SELECT → INSERT), two agents can race on the same unclaimed entry and duplicate it. Fixing this at the DB level (locks, UNIQUE constraints) is fragile.

The cleaner solution: **the orchestrator picks all test cases upfront** and passes each test case name directly into each `claude` invocation via `--name`. Each sub-agent runs exactly one test case it was explicitly told to claim. No competition possible.

---

## Step 1 — Check and Prepare Config

```bash
TICKET_ID="<TICKET-ID>"

AGENTS=$(noob-tester qa-pool list --ticket "$TICKET_ID" --json)
AGENT_COUNT=$(echo "$AGENTS" | jq 'length')
```

**If config found and user asked to update something:**

```bash
# Find the relevant entry (by agent path, or use .[0] if only one)
ENTRY_ID=$(echo "$AGENTS" | jq -r '.[] | select(.agent_path | contains("<partial-path>")) | .id' | head -1)

# Apply only the fields the user asked to change:
noob-tester qa-pool update "$ENTRY_ID" --target <new-target>       # if target changed
noob-tester qa-pool update "$ENTRY_ID" --role <new-role>           # if role changed
noob-tester qa-pool update "$ENTRY_ID" --agent <new-path>          # if agent changed
noob-tester qa-pool update "$ENTRY_ID" --file <new-file>           # if file changed
noob-tester qa-pool update "$ENTRY_ID" --launch-dir <new-dir>     # if launch dir changed

# Re-fetch after updates
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

## Step 2 — Get Latest Run Pack and Enumerate Pending Test Cases

`MAX_SPAWNS` controls how many agents are launched. Default is **5**. The user can say "run 10 agents" or "spawn 3" to override.

```bash
MAX_SPAWNS=5   # default — override if user specified a number

# Get the latest run pack for this ticket
RECENT_PACK=$(noob-tester runpack list --ticket "$TICKET_ID" --json | jq -r '.[0] // empty')

if [ -z "$RECENT_PACK" ]; then
  echo "No existing run pack found for $TICKET_ID. Create one first with noob-tester init."
  exit 1
fi

RUNPACK_ID=$(echo "$RECENT_PACK" | jq -r '.run_pack_id')
SESSION_ID=$(echo "$RECENT_PACK" | jq -r '.session_id')
RUN_ID=$(echo "$RECENT_PACK" | jq -r '.run_id')

echo "Using run pack: $RUNPACK_ID"

# Fetch all pending entries in the run pack
PACK_ENTRIES=$(noob-tester runpack list --pack "$RUNPACK_ID" --json)

# Filter to pending entries only (exclude running, passed, failed, skipped, blocked)
PENDING=$(echo "$PACK_ENTRIES" | jq '
  [.[] | select(.status == "pending")]
  | sort_by(.priority, .created_at)
  | .[:'"$MAX_SPAWNS"']
')

PENDING_COUNT=$(echo "$PENDING" | jq 'length')

if [ "$PENDING_COUNT" -eq 0 ]; then
  echo "No pending test cases in run pack $RUNPACK_ID. Nothing to run."
  exit 0
fi

echo "Dispatching $PENDING_COUNT pending test cases from run pack."
```

---

## Step 3 — Assign Pending Cases Round-Robin and Pre-Claim

Distribute pending run pack entries round-robin across agent configs, then pre-claim each one.

```bash
# Build an array of agent configs for round-robin
AGENT_PATHS=($(echo "$AGENTS" | jq -r '.[].agent_path'))
AGENT_TARGETS=($(echo "$AGENTS" | jq -r '.[].target // ""'))
AGENT_ROLES=($(echo "$AGENTS" | jq -r '.[].role // "default"'))
AGENT_FILES=($(echo "$AGENTS" | jq -r '.[].file // ""'))
AGENT_DIRS=($(echo "$AGENTS" | jq -r '.[].launch_dir // ""'))

i=0
LAUNCHES=()

echo "$PENDING" | jq -c '.[]' | while read -r ENTRY; do
  TEST_CASE_ID=$(echo "$ENTRY" | jq -r '.test_case_id')
  ENTRY_ID=$(echo "$ENTRY" | jq -r '.id')
  IDX=$(( i % AGENT_COUNT ))

  AGENT_PATH="${AGENT_PATHS[$IDX]}"
  TARGET="${AGENT_TARGETS[$IDX]}"
  ROLE="${AGENT_ROLES[$IDX]}"
  FILE="${AGENT_FILES[$IDX]}"
  DIR="${AGENT_DIRS[$IDX]}"

  # ← PRE-CLAIM: Transition entry to claimed status
  CLAIM_OUTPUT=$(noob-tester runpack entry claim --pack "$RUNPACK_ID" --entry "$ENTRY_ID" 2>/dev/null)
  CLAIMED=$(echo "$CLAIM_OUTPUT" | jq -r '.claimed // false')

  if [ "$CLAIMED" != "true" ]; then
    echo "  Warning: Could not claim entry '$ENTRY_ID' — skipping"
    i=$(( i + 1 ))
    continue
  fi

  # Save claimed data to unique file for this agent
  CLAIM_FILE="/tmp/pool-claim-${i}.json"
  echo "$CLAIM_OUTPUT" > "$CLAIM_FILE"

  # Build invocation that tells agent to use this claim file
  INVOCATION="run with agent @${AGENT_PATH} on jira ${TICKET_ID} entry ${ENTRY_ID}"
  [ -n "$TARGET" ] && INVOCATION="$INVOCATION with target $TARGET"
  [ -n "$ROLE" ] && [ "$ROLE" != "default" ] && INVOCATION="$INVOCATION and role $ROLE"
  [ -n "$FILE" ] && INVOCATION="$INVOCATION and file $FILE"
  INVOCATION="$INVOCATION and use claimed entry from $CLAIM_FILE"

  echo "$DIR|$AGENT_PATH|$INVOCATION" >> /tmp/pool-launches.txt
  i=$(( i + 1 ))
done

# Read all launches
mapfile -t LAUNCHES < /tmp/pool-launches.txt
rm -f /tmp/pool-launches.txt

echo "Prepared ${#LAUNCHES[@]} agent invocations (round-robin assigned and pre-claimed)."
```

---

## Step 4 — Launch Sub-Agents (Fire and Forget)

Each agent gets its own claimed entry file and launch directory. The agent reads from the claim file passed in the invocation. Each spawn is recorded for tracking and management.

```bash
for LAUNCH in "${LAUNCHES[@]}"; do
  DIR="${LAUNCH%%|*}"
  REST="${LAUNCH#*|}"
  AGENT_PATH="${REST%%|*}"
  INVOCATION="${REST#*|}"

  # Extract claim file path from invocation (format: "... from /tmp/pool-claim-N.json")
  CLAIM_FILE=$(echo "$INVOCATION" | grep -oP '/tmp/pool.*\.json')

  if [ -n "$CLAIM_FILE" ]; then
    echo "→ Spawning @${AGENT_PATH} with claim: $CLAIM_FILE"
  else
    echo "→ Spawning @${AGENT_PATH}"
  fi

  if [ -n "$DIR" ] && [ -d "$DIR" ]; then
    (cd "$DIR" && claude -p "$INVOCATION" --agent "@${AGENT_PATH}") &
  else
    [ -n "$DIR" ] && echo "  Warning: launch_dir '$DIR' not found, using current directory"
    claude -p "$INVOCATION" --agent "@${AGENT_PATH}" &
  fi

  # Record the spawn for tracking
  AGENT_PID=$!
  noob-tester pool-spawns record --ticket "$TICKET_ID" --agent "@${AGENT_PATH}" --pid $AGENT_PID --type pool > /dev/null 2>&1
done

echo "All ${#LAUNCHES[@]} agents spawned. Monitor progress at http://localhost:4040"
echo "Manage spawned agents: noob-tester pool-spawns list --ticket $TICKET_ID"
```

**Important:** Agents read from the claim file specified in the invocation. The file contains all test case data needed for execution.

Do **not** call `wait` — return to the user immediately after spawning. The agents run in the background and record their results to the database as they finish. Spawned agent tracking allows you to view and kill agents via the pool menu in the dashboard.

---

## Step 5 — Report

Tell the user:

- Run pack ID and how many pending test cases were found
- How many agents were launched (capped at MAX_SPAWNS)
- Which agent configs were used (round-robin distribution)
- Whether config was pre-existing or newly registered
- Whether any fields were updated before running
- Dashboard URL to monitor: `http://localhost:4040`

---

## Notes

- **Reuse existing run pack** — Step 2 retrieves the latest run pack for the ticket (created via `noob-tester init`). If no run pack exists, the skill exits and asks the user to create one first.
- **Pending entries only** — only entries with status `pending` are dispatched. Entries with status `running`, `passed`, `failed`, `skipped`, or `blocked` are skipped.
- **Pre-claim atomic** — each agent is assigned one pending entry via round-robin. The entry is atomically claimed (status → `claimed`) before the agent is launched, preventing race conditions.
- **Round-robin** — distributes pending entries evenly across agent configs. With 3 configs and 9 pending entries: config[0] gets entries 0,3,6 — config[1] gets 1,4,7 — config[2] gets 2,5,8.
- **Agent path** — stored without `@` in the DB; prepend `@` in the `claude` invocation.
- **Target** — a named reference in the `targets` table resolved at runtime by the sub-agent (not a raw URL).
- **Role** — selects which credential set to inject from the `secrets` table for the given target.
- **Missing agent file** — if a `.md` file doesn't exist on disk, warn the user and skip that config entry.
- **MAX_SPAWNS** — caps how many agents are launched. Default 5. Remaining pending entries stay unclaimed for a subsequent `/noob-pool` invocation.
