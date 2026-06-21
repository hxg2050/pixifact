---
name: change-workflow
description: Use when implementing code changes, new features, bug fixes, refactors, docs updates tied to code, or multi-turn work that needs planning, tests, verification, resumability, and clean commits across any repository.
---

# Change Workflow

Use this skill for repository changes. Combine it with the current project's own instructions; project rules override this workflow when they are more specific.

## Required Flow

1. **Read Context**
   - Read project instructions such as `AGENTS.md`, `CODEX.md`, `README`, testing docs, and relevant source.
   - Check current worktree state before editing.
   - If a matching plan exists, read it before reasoning from scratch.

2. **Classify Change**
   - **Small**: local fix, docs tweak, or one narrow behavior with low risk.
   - **Medium**: one subsystem or several files, needs coordinated tests or docs.
   - **Large**: cross-subsystem change, public API change, migration, or likely multi-session work.

3. **Plan**
   - Small: state a short plan in the conversation.
   - Medium or Large: create or update a plan file in the project, normally `docs/plans/<feature>.md`.
   - Treat plan `Decisions` as the source of truth unless the user explicitly asks to redesign.

4. **Tests First**
   - New feature: write failing tests for the intended behavior before implementation when practical.
   - Bug fix: write a reproducing test before fixing when practical.
   - If automated tests are not practical, write concrete validation steps in the plan or final response.

5. **Implement**
   - Keep changes scoped to the goal.
   - Avoid unrelated refactors, compatibility shims, aliases, fallbacks, or speculative abstractions unless the project asks for them.
   - Work with existing user changes; do not overwrite unrelated work.

6. **Verify**
   - Run the smallest relevant test or check first.
   - Then run broader checks according to risk and project guidance.
   - If checks fail, continue fixing until they pass or record a real blocker.

7. **Resume Notes**
   - If the task is unfinished, update the plan with `Progress` and `Resume Notes`.
   - Resume notes must include `Done`, `Currently Failing` or `Current State`, and `Next`.

8. **Commit**
   - When project rules require commits, commit only the relevant tracked changes after verification.
   - Do not include unrelated untracked files or user work.

## Plan File Requirements

For Medium and Large changes, the plan should include:

- `Goal`
- `Decisions`
- `Non-Goals`
- `Implementation Scope`
- `Test Plan`
- `Verification`
- `Progress`
- `Resume Protocol`
- `Resume Notes`

Use `references/plan-template.md` as a starting point when the project has no local template.

## Resume Protocol

When continuing an existing task:

1. Read project instructions and the plan file.
2. Run worktree status.
3. Run the smallest relevant failing or targeted test from `Resume Notes`.
4. Continue from `Next`; do not re-open settled design decisions.
5. Before stopping unfinished work, update `Progress` and `Resume Notes`.

## Good Handoff Notes

Use this shape:

```md
## Resume Notes

Last updated: YYYY-MM-DD

Done:
- ...

Current State:
- ...

Currently Failing:
- ...

Next:
1. ...
2. ...
```

