# Rule Maintenance Guide for Project Lead

**Audience:** Project lead managing the rule enforcement system
**Purpose:** How to maintain and update rules as the project evolves

---

## Overview

The rule enforcement system has 3 components you manage:

1. **CRITICAL_FILES.md** - Registry of protected files
2. **Rule documents** - Specific requirements per file
3. **Agent education** - AGENT_CHECKLIST.md and related docs

Your responsibility: Keep these current and effective.

---

## Current Inventory

### Protected Files (9 total)

**🔴 CRITICAL (3)** - Data/timing
1. `shared/telemetry/f1_data.py` - F1_DATA_REVIEW_RULE.md (code review)
2. `backend/app/services/replay_service.py` - REPLAY_SERVICE_RULE.md (discovery)
3. `backend/app/websocket.py` - WEBSOCKET_RULE.md (spikes)

**🟡 HIGH (3)** - Architecture
4. `frontend/src/store/replayStore.ts` - GLOBAL_STORE_RULE.md (architecture review)
5. `backend/app/main.py` - BACKEND_INITIALIZATION_RULE.md (impact analysis)
6. `frontend/src/hooks/useReplayWebSocket.ts` - WEBSOCKET_HOOK_RULE.md (discovery)

**🟢 MEDIUM (3)** - Features
7. `frontend/src/components/Leaderboard.tsx` - LEADERBOARD_RULE.md (assumptions)
8. `backend/core/config.py` - CONFIG_RULE.md (compatibility check)
9. `legacy/main.py` - LEGACY_RULE.md (testing)

---

## Quarterly Review Checklist

Every 3 months, do this review:

### 1. Rule Relevance (30 min)

For each protected file:
- [ ] Is this file still critical?
- [ ] Has its role changed?
- [ ] Is the rule still accurate?
- [ ] Have agents reported the rule is unclear?

**Decision:**
- Keep as-is → No change
- Update rule → Modify the document
- Remove rule → File no longer critical (rare)
- Promote/demote → Change severity level

### 2. Emerging Critical Files (15 min)

Since last review:
- [ ] Were there any bugs in unprotected files?
- [ ] Were there any near-misses or close calls?
- [ ] Are there new architectural hubs?
- [ ] Are there new concurrency-sensitive areas?

**Decision:**
- New file needs protection? → Create rule and add to registry
- Existing file needs higher protection? → Promote in CRITICAL_FILES.md

### 3. Agent Feedback (15 min)

- [ ] Did any agents report rules are unclear?
- [ ] Did any agents ask for rule exceptions?
- [ ] Did any agents suggest improvements?
- [ ] Did any agents skip rules (caught in review)?

**Action items:**
- Clarify unclear rules
- Update rules based on feedback
- Educate agents who skipped rules

### 4. Compliance Report (15 min)

- [ ] What % of protected file changes followed rules?
- [ ] How many rule violations were caught in code review?
- [ ] What was the nature of violations?
- [ ] Have compliance rates improved over time?

**Metrics to track:**
- Rule compliance rate (target: 100%)
- Plan success rate (target: 95%+)
- Implementation iterations (target: 1)
- Bug rate in critical systems (target: 0)

---

## Adding a New Protected File

When you identify a file that should be protected:

### Step 1: Assess Why (5 min)

Ask yourself:
- **Is this critical?** (Does it control core functionality?)
- **Has it caused bugs?** (Pattern of issues?)
- **Is it architectural?** (Do other components depend heavily?)
- **Is it concurrency-sensitive?** (Threading, async, state?)

If YES to any 2+ → Protect it

### Step 2: Classify Severity (5 min)

Choose one:
- **🔴 CRITICAL** - Data, timing, core processing (requires code review or spikes)
- **🟡 HIGH** - Architecture, state, coordination (requires discovery or analysis)
- **🟢 MEDIUM** - Features, configs, specific components (requires assumptions or testing)

### Step 3: Create Rule Document (30-60 min)

**File:** `.claude/rules/[FILE]_RULE.md`

**Template:**
```markdown
# [FEATURE] Rule

**Status:** Active
**Severity:** [CRITICAL/HIGH/MEDIUM]
**Applies To:** `path/to/file.py` or `path/to/component.tsx`

## Rule Statement
[One sentence what must be done]

## When This Rule Applies
### Changes That Require [TYPE]
- Bullet list of what triggers

### Changes That DON'T Require [TYPE]
- Bullet list of exempt changes

## [TYPE] Requirements
[Specific section based on severity:
- Code Review Requirements (CRITICAL)
- Discovery Phase Requirements (HIGH)
- Planning Requirements (MEDIUM)
- etc.]

## Implementation Constraints
### ✅ DO
- List of what's allowed

### ❌ DON'T
- List of what's forbidden

## Code Review Checklist
- [ ] Item 1
- [ ] Item 2

## Related Rules
[Links to other rules]

## Why This Rule Exists
[Historical context - what went wrong]
```

Reference existing rules for structure and style.

### Step 4: Update CRITICAL_FILES.md (10 min)

1. Add row to appropriate severity section
2. Include file path
3. Include rule name
4. Include brief explanation
5. Specify enforcement type

Example:
```markdown
| `frontend/src/components/MyComponent.tsx` | [MY_COMPONENT_RULE.md](./MY_COMPONENT_RULE.md) | Complex state machine | Assumptions & Testing |
```

### Step 5: Update RULES.md if Necessary (5 min)

If this is a new severity level or introduces a new enforcement type:
- Update RULES.md introduction
- Add reference to CRITICAL_FILES.md

### Step 6: Commit (5 min)

```bash
git add .claude/rules/[FILE]_RULE.md .claude/rules/CRITICAL_FILES.md .claude/rules/RULES.md
git commit -m "rules: add [FILE] to protected files with [FILE]_RULE"
```

---

## Updating an Existing Rule

When a rule needs updating:

### Minor Update (Clarification)
1. Edit the rule document
2. Note change date if significant
3. Commit: `rules: clarify [RULE_NAME]`
4. No need to notify agents (they'll read updated version)

### Major Update (Behavior Change)
1. Edit the rule document
2. Update change date prominently
3. If enforcement changed: Commit and consider mentioning in AGENT_CHECKLIST.md
4. Commit: `rules: update [RULE_NAME] - [what changed]`

### Example Update Scenario

**Scenario:** WEBSOCKET_RULE used to require 3 spikes, but agents found 1 spike is sufficient.

**Action:**
1. Update WEBSOCKET_RULE.md to require 1 spike instead of 3
2. Provide example of good 1-spike approach
3. Commit: `rules: reduce websocket spike requirements from 3 to 1`
4. Optional: Mention in code reviews to agents

---

## Handling Rule Violations

When code review catches a rule violation:

### Scenario: Agent Skipped Code Review for f1_data.py Change

**Action:**
1. **Reject the PR** - Don't merge without rule compliance
2. **Educate** - Point agent to F1_DATA_REVIEW_RULE.md
3. **Request action** - Ask them to invoke code review agent
4. **Track** - Note that this agent violated the rule
5. **Follow up** - If repeated violations, talk to the agent

**Message template:**
```
This PR modifies shared/telemetry/f1_data.py, which requires
independent code review (see .claude/rules/F1_DATA_REVIEW_RULE.md).

Before this can be merged:
1. Invoke superpowers:requesting-code-review skill
2. Paste this PR and the rule
3. Get APPROVED status
4. Add approval to this PR
5. Then we can merge

This isn't optional - the rule exists because past changes to f1_data.py
caused silent data corruption. We can't bypass it.
```

### Scenario: Agent Skipped Discovery Phase

**Action:**
1. **Reject the PR** - Plan was approved, but discovery was skipped
2. **Request discovery** - Ask them to complete the required sections
3. **Suggest redoing plan** - Original plan is now invalid
4. **Track** - Note the violation

**Message template:**
```
This PR modifies [FILE], which requires a discovery phase
(see .claude/rules/[RULE_NAME].md).

The original plan was approved, but code review shows the
required sections are missing:
- [ ] [Section 1]
- [ ] [Section 2]

Before implementation, please:
1. Revisit the planning phase
2. Complete required sections
3. Document your findings
4. Then resume implementation

This ensures implementation is actually feasible.
```

---

## What NOT to Do

### ❌ Don't Remove a Rule Without Good Reason

Rules exist because bugs happened. You can:
- Update rules to be clearer
- Lower enforcement level
- But don't remove unless the file is genuinely no longer critical

### ❌ Don't Add Rules for Everything

Only protect files that are:
- Core to system operation
- Have caused bugs before
- Are hard to get right
- Have high impact when broken

Example: Don't protect every TypeScript file. Only protect the ones that really matter.

### ❌ Don't Let Rules Become Outdated

If a rule no longer reflects reality:
- Update it immediately
- The rule should always match current architecture
- Outdated rules are worse than no rules

### ❌ Don't Let Agents Skip Rules

Rules only work if they're enforced. If you allow exceptions:
- Other agents expect exceptions too
- Rules become suggestions instead of requirements
- System breaks down
- You're back to the original problem

---

## Mentoring Agents on Rules

When an agent is new or struggling with rules:

### 1. Start with AGENT_CHECKLIST.md
- Ask them to read it
- It's the clearest introduction

### 2. Walk Through an Example
- Pick a real example from their task
- Show them CRITICAL_FILES.md
- Show them the associated rule
- Explain each section

### 3. Review Their Plan
- Before they implement, check their plan
- Verify they included all required sections
- Verify their discovery/spikes are sufficient

### 4. Celebrate Success
- When they follow a rule well, acknowledge it
- Compliment the spikes, discovery, planning
- Use it as example for other agents

---

## Red Flags: When Rules Are Breaking Down

Watch for these signs:

### Sign 1: Increasing Rule Violations
If violations are increasing:
- Rules might be unclear → Clarify them
- Rules might be unreasonable → Update them
- Agents might need reminding → Educate them
- Rules might need removal → Assess if file is still critical

### Sign 2: Agents Asking for Exceptions
If agents frequently ask to skip rules:
- Rule might be too strict → Reduce scope
- Rule might be poorly explained → Clarify it
- Rule might be outdated → Update it
- This should be rare (1-2 times per year max)

### Sign 3: Plans Still Failing Despite Rules
If implementations still fail often:
- Rules might not be catching the right issues → Revise
- Discovery/spikes might not be sufficient → Strengthen them
- Agents might not understand why → Add more context
- There might be new failure patterns → Create new rules

### Sign 4: Rule Fatigue
If agents complain rules are excessive:
- You might have too many protected files → Re-evaluate
- Rules might be too restrictive → Adjust scope
- Agents might need better education → Improve AGENT_CHECKLIST.md
- Balance is needed: protective but not excessive

---

## Annual Rule Audit

Once per year, do a full audit:

### 1. Protected Files Review (1 hour)
- [ ] All 9 files still critical?
- [ ] Any should be promoted/demoted?
- [ ] Any should be removed?
- [ ] Any new files should be added?

### 2. Rule Quality Review (1 hour)
- [ ] All rules still accurate?
- [ ] Any rules unclear or confusing?
- [ ] Any rules conflicting with each other?
- [ ] Any rules missing important sections?

### 3. Compliance Metrics Review (30 min)
- [ ] Rule compliance rate (target: 100%)
- [ ] Implementation success rate (target: 95%+)
- [ ] Bug rate in critical systems (target: 0)
- [ ] Agent satisfaction with rules

### 4. Strategic Update (30 min)
- [ ] Document findings
- [ ] Plan any major updates
- [ ] Commit updated rules if needed
- [ ] Communicate changes to team

---

## Summary

Your role as project lead:
1. **Maintain the registry** - Keep CRITICAL_FILES.md current
2. **Maintain the rules** - Update as needed, keep clear
3. **Enforce compliance** - Don't allow exceptions
4. **Monitor metrics** - Track compliance and outcomes
5. **Educate agents** - Help them understand why rules matter
6. **Adjust as needed** - Quarterly reviews, annual audits

**Key principle:** Rules work because they're unavoidable and enforced consistently.
