---
description: How to execute a task from the FoxBlaze task list
---

# Execute Task Workflow

// turbo-all

## Pre-flight Check

1. Read the current task list to identify which task to execute:
   ```
   View file: /Users/vinhlam/.gemini/antigravity/brain/6d9f8a7c-2d6f-49eb-a3ea-fb08c7c9d6ec/task.md
   ```

2. Read the implementation plan for detailed specs of the current task:
   ```
   View file: /Users/vinhlam/.gemini/antigravity/brain/6d9f8a7c-2d6f-49eb-a3ea-fb08c7c9d6ec/implementation_plan.md
   ```

3. Identify the **first uncompleted task** (marked `[ ]` or `[/]`).

4. If no uncompleted task exists → notify user "All tasks complete."

## Execution Steps

5. Mark the current task as `[/]` (in progress) in task.md.

6. For each sub-item in the task:
   - Create/modify the specified file(s)
   - Follow the coding rules defined in `.agent/RULES.md`
   - Only write code for the current task — do NOT touch files belonging to future tasks

7. After all sub-items are complete, run verification:
   ```bash
   cd /Users/vinhlam/workspace/bot/agent-foxblaze && npm run build
   ```

8. If build fails:
   - Read error output carefully
   - Fix ONLY the errors related to current task
   - Re-run `npm run build`
   - Repeat until 0 errors

9. If build passes:
   - Mark all sub-items as `[x]` in task.md
   - Mark the task itself as `[x]` in task.md

10. Present a summary to the user:
    - Files created/modified
    - Build result
    - Any decisions made or assumptions

11. **STOP and wait for user confirmation** before proceeding to the next task.
