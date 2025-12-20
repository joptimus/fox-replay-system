# Development Guidelines

This folder contains development standards and critical rules for contributing to the F1 Race Replay project.

## ⚠️ CRITICAL RULES

### F1 Data Processing Review Rule

**ANY logic changes to `shared/telemetry/f1_data.py` REQUIRE independent code review by an expert agent BEFORE committing.**

This rule exists because `shared/telemetry/f1_data.py` is the core telemetry processing hub:
- Handles all telemetry extraction and transformation
- Processes complex timing coordinate system conversions
- Every session replay depends on its output
- A single logic error can cause silent data corruption affecting all users

**Before modifying f1_data.py logic:**
1. Make the change
2. Invoke specialized code review agent with expertise in timing systems and telemetry
3. Get APPROVED status from review agent
4. Create risk assessment document
5. Reference review document in commit message

**Full Details:** [f1-data-review-rule.md](./f1-data-review-rule.md)

This is not optional. Do not bypass this rule.

---

## Development Standards

See [`CLAUDE.md`](../../CLAUDE.md) for:
- Project architecture overview
- Common development commands
- Running the application (frontend + backend)
- Data structures and caching strategy
- Backend and frontend development guidelines

---

## Documentation

All development-related documentation should be organized in this folder.
