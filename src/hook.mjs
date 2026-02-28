/**
 * Process a PreToolUse hook invocation from Claude Code.
 *
 * Fires before ExitPlanMode is called. Reviews the plan and either:
 * - Outputs hookSpecificOutput with permissionDecision:"deny" to block (with review feedback)
 * - Outputs nothing to allow ExitPlanMode to proceed
 *
 * @param {object} input - Parsed JSON from Claude Code stdin
 * @param {string} input.session_id - The current session ID
 * @param {string} input.tool_name - Should be "ExitPlanMode"
 * @param {object} deps - Dependency injection container
 */
export async function processHook(input, deps) {
  try {
    deps.stderr.write(`[cpr] hook called: tool_name=${input.tool_name}\n`);

    // 1. Housekeeping: clean stale sessions
    deps.cleanStaleSessions();

    // 2. Load config
    const config = deps.loadConfig();

    // 3. Find latest plan file (before maxReviews check)
    const plan = deps.findLatestPlan();
    deps.stderr.write(`[cpr] plan=${plan ? plan.path : 'null'}\n`);
    if (plan === null) {
      deps.stderr.write(`[cpr] no plan found, allowing ExitPlanMode\n`);
      return;
    }

    // 4. Display current plan to stderr
    deps.stderr.write(`\n\x1b[1;33m━━━ Current Plan ━━━\x1b[0m\n\n`);
    deps.stderr.write(plan.content + '\n');

    // 5. Check review count against maxReviews
    const count = deps.getReviewCount(input.session_id);
    deps.stderr.write(`[cpr] session=${input.session_id} count=${count}/${config.maxReviews}\n`);
    if (count >= config.maxReviews) {
      const originalPlan = deps.getOriginalPlan(input.session_id);
      if (originalPlan !== null) {
        const diff = deps.computeDiff(originalPlan, plan.content);
        if (diff) {
          deps.stderr.write(`\n\x1b[1;35m━━━ Plan Evolution (Original → Final) ━━━\x1b[0m\n\n`);
          deps.stderr.write(diff + '\n');
        }
      }
      deps.stderr.write(`[cpr] maxReviews reached, allowing ExitPlanMode\n`);
      return;
    }

    // 6. Save original plan on first review
    if (count === 0) {
      deps.saveOriginalPlan(input.session_id, plan.content);
    }

    // 7. Build prompt and run review
    const prompt = deps.buildPrompt(plan.content, config.prompt);
    const adapter = deps.getAdapter(config.adapter);
    deps.stderr.write(`[cpr] reviewing with ${config.adapter}...\n`);
    deps.stderr.write(`\n\x1b[1;36m━━━ Claude Plan Reviewer ━━━ Reviewing with ${config.adapter}... ━━━\x1b[0m\n\n`);
    const result = await adapter.review(prompt, config[config.adapter], {
      onData: (chunk) => deps.stderr.write(String(chunk)),
    });

    deps.stderr.write(`\n\x1b[1;36m━━━ Review complete ━━━\x1b[0m\n\n`);

    // 8. Increment review count
    deps.incrementReviewCount(input.session_id);

    // 9. Output deny decision to stdout (blocks ExitPlanMode)
    const output = JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `ExitPlanMode was blocked by claude-plan-reviewer. Revise your plan based on the following review feedback, then call ExitPlanMode again.\n\n${result}`,
      },
    });
    deps.stdout.write(output + "\n");
    deps.stderr.write(`[cpr] review complete, denying ExitPlanMode\n`);
  } catch (err) {
    // On any error, allow ExitPlanMode (no stdout = allow)
    deps.stderr.write(`[cpr] ERROR: ${err.message ?? err}\n${err.stack ?? ''}\n`);
  }
}
