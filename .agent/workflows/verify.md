---
description: How to verify changes after completing a task
---

# Verify Changes Workflow

// turbo-all

## Step 1: Build Check

1. Run TypeScript compilation:
   ```bash
   cd /Users/vinhlam/workspace/bot/agent-foxblaze && npm run build
   ```

2. If errors exist → fix them before continuing.

## Step 2: Prisma Check (if schema was modified)

3. Regenerate Prisma client:
   ```bash
   cd /Users/vinhlam/workspace/bot/agent-foxblaze && npx prisma generate
   ```

4. Validate schema:
   ```bash
   cd /Users/vinhlam/workspace/bot/agent-foxblaze && npx prisma validate
   ```

## Step 3: Dependency Check

5. Ensure no missing dependencies:
   ```bash
   cd /Users/vinhlam/workspace/bot/agent-foxblaze && npm ls --depth=0 2>&1 | grep -E "UNMET|missing"
   ```

6. If any UNMET dependencies → `npm install <package>`.

## Step 4: Import Graph Check

7. Ensure no circular dependencies by reviewing import chains.
   - Module A should NOT import Module B if Module B already imports Module A.
   - Use `forwardRef()` only as a last resort.

## Step 5: Report

8. Output a summary:
   - Build status: PASS / FAIL
   - Prisma status: VALID / INVALID / NOT_MODIFIED
   - Files modified in this task
   - Any warnings or assumptions
