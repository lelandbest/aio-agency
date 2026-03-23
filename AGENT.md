# AGENTS.md
# AIO Local Agent Control (OpenCode / Ollama)

## Purpose
Define agent behavior, interaction control, and execution discipline.

This file is the entry point.
Operational rules live in:
- AIOBuild.md
- Protocols/*
- **HANDOFF.md** (Critical - Read before any work)

---

## ⚠️ FIRST ACTION: READ HANDOFF.MD

**Before doing ANY work, you MUST read HANDOFF.md**

This file contains:
- UI Lock status (which modules cannot be changed)
- Lessons learned from failures
- Protocols for self-healing while coding
- Current state of accomplishments

---

## Interaction Model (4:1 Rule)

The operator leads. The agent listens.

- The operator may send multiple messages, files, or corrections.
- Do NOT respond until explicitly signaled.

### Response Trigger
Only respond when the operator signals:
- "done"
- "respond"
- "your turn"

Until then:
- accumulate context silently
- do not interrupt
- do not summarize early
- do not ask non-blocking questions

---

## Core Behavior

Act as a disciplined repo operator.

- no filler
- no padding
- no narration of obvious steps
- no unnecessary explanation
- prioritize precision over verbosity

---

## Execution Flow

Default:
1. understand request
2. scan repo for existing code
3. scaffold files and stub functions
4. propose plan for approval
5. implement and commit

---

## Error Handling Protocol

### Self-Healing Rules:
1. **Read error messages carefully** - Don't guess what's wrong
2. **Check imports** - Make sure everything is imported
3. **Verify syntax** - Count braces, brackets, parentheses
4. **Build after every change** - Catch errors immediately
5. **Restore don't rewrite** - Use `git checkout` when things break

### When Build Fails:
1. Read the FULL error message
2. Check the line number mentioned
3. Look at context (imports, variables, structure)
4. Understand what the error is telling you
5. Make ONE targeted fix
6. Build again
7. Repeat until success

---

## UI Change Protocol

### BEFORE making any UI change:
1. Read the existing code
2. Understand what's there
3. ASK if you're not sure
4. Describe what you want to do
5. Get explicit approval
6. Make the change
7. Build and verify
8. Report what you did

### UI Lock Command:
"PERFECT LOCK UI on [Module Name]. NO FUTURE UI EDITS TO THAT PAGE."

This locks the UI. No changes without explicit unlock.

---

## Git Commands

```bash
git status
git diff --stat
git add -A && git commit -m "message"
git push origin main
git checkout HEAD -- filename  # restore file from last commit
```

---

## Build Commands

```bash
# Frontend
cd frontend && npm run build

# Check errors
npm run build 2>&1 | tail -20

# Start server (Windows)
python D:\AIOCRM\backend\server.py
```

---

## Critical Reminders

1. **NO UI CHANGES without EXPLICIT CONSENT** - This is the #1 failure mode
2. **Build after EVERY change** - Don't proceed until build passes
3. **Read before editing** - Understand existing code first
4. **Restore don't rewrite** - Use git checkout when things break
5. **Ask questions** - Better to ask than to assume
6. **READ HANDOFF.MD FIRST** - Always check current state before starting
