#!/bin/bash
# Hook: SubagentStop → auto-log metrics to noob-tester
# Reads agent transcript from stdin JSON, extracts token breakdown/tools/duration/model,
# parses noob-tester session ID from last_assistant_message, calls noob-tester metrics log.

set -euo pipefail

# Read stdin JSON
INPUT=$(cat)

exec 2>>/tmp/hook-debug.log
echo "=== $(date) ===" >&2
echo "INPUT: $INPUT" >&2

TRANSCRIPT=$(echo "$INPUT" | jq -r '.agent_transcript_path // empty')
LAST_MSG=$(echo "$INPUT" | jq -r '.last_assistant_message // empty')

# Bail if no transcript
if [[ -z "$TRANSCRIPT" || ! -f "$TRANSCRIPT" ]]; then
  exit 0
fi

# Extract noob-tester session ID from agent's last message
# Look for "Session: <UUID>" or "Session ID: <UUID>" pattern (not just first UUID,
# which may be a map ID, runpack ID, or tech issue ID)
NOOB_SESSION=$(echo "$LAST_MSG" | grep -oiP '(?:session(?:\s*id)?[:\s*`]+)\K[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | tail -1)
# Fallback: first UUID if no "Session:" pattern found
if [[ -z "$NOOB_SESSION" ]]; then
  NOOB_SESSION=$(echo "$LAST_MSG" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
fi

if [[ -z "$NOOB_SESSION" ]]; then
  exit 0
fi

# Extract token breakdown from all assistant messages
USAGE=$(cat "$TRANSCRIPT" | jq -c 'select(.type == "assistant") | .message.usage' 2>/dev/null \
  | jq -s '{
    input_tokens: (map(.input_tokens // 0) | add // 0),
    output_tokens: (map(.output_tokens // 0) | add // 0),
    cache_read_tokens: (map(.cache_read_input_tokens // 0) | add // 0),
    cache_create_tokens: (map(.cache_creation_input_tokens // 0) | add // 0)
  }')

INPUT_TOKENS=$(echo "$USAGE" | jq '.input_tokens')
OUTPUT_TOKENS=$(echo "$USAGE" | jq '.output_tokens')
CACHE_READ=$(echo "$USAGE" | jq '.cache_read_tokens')
CACHE_CREATE=$(echo "$USAGE" | jq '.cache_create_tokens')

# Count tool_use blocks
TOOLS=$(cat "$TRANSCRIPT" | jq -c 'select(.type == "assistant") | [.message.content[]? | select(.type == "tool_use")] | length' 2>/dev/null \
  | jq -s 'add // 0')

# Get model from first assistant message
MODEL=$(cat "$TRANSCRIPT" | jq -c 'select(.type == "assistant") | .message.model // empty' 2>/dev/null | head -1 | tr -d '"')

# Calculate duration from first to last timestamp
FIRST_TS=$(cat "$TRANSCRIPT" | jq -r '.timestamp // empty' 2>/dev/null | head -1)
LAST_TS=$(cat "$TRANSCRIPT" | jq -r '.timestamp // empty' 2>/dev/null | tail -1)

DURATION=0
if [[ -n "$FIRST_TS" && -n "$LAST_TS" ]]; then
  if command -v python3 &>/dev/null; then
    DURATION=$(python3 -c "
from datetime import datetime
t1 = datetime.fromisoformat('$FIRST_TS'.replace('Z','+00:00'))
t2 = datetime.fromisoformat('$LAST_TS'.replace('Z','+00:00'))
print(int((t2-t1).total_seconds() * 1000))
" 2>/dev/null || echo "0")
  fi
fi

# Build metrics log command with token breakdown
CMD="noob-tester metrics log $NOOB_SESSION"
[[ "$INPUT_TOKENS" -gt 0 ]] && CMD="$CMD --input-tokens $INPUT_TOKENS"
[[ "$OUTPUT_TOKENS" -gt 0 ]] && CMD="$CMD --output-tokens $OUTPUT_TOKENS"
[[ "$CACHE_READ" -gt 0 ]] && CMD="$CMD --cache-read-tokens $CACHE_READ"
[[ "$CACHE_CREATE" -gt 0 ]] && CMD="$CMD --cache-create-tokens $CACHE_CREATE"
[[ "$TOOLS" -gt 0 ]] && CMD="$CMD --tools $TOOLS"
[[ "$DURATION" -gt 0 ]] && CMD="$CMD --duration $DURATION"
[[ -n "$MODEL" ]] && CMD="$CMD --model $MODEL"
CMD="$CMD --actions 1"

eval "$CMD" 2>/dev/null || true
