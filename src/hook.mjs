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

    // 3. Check review count against maxReviews
    const count = deps.getReviewCount(input.session_id);
    deps.stderr.write(`[cpr] session=${input.session_id} count=${count}/${config.maxReviews}\n`);
    if (count >= config.maxReviews) {
      deps.stderr.write(`[cpr] maxReviews reached, allowing ExitPlanMode\n`);
      return;
    }

    // 4. Find latest plan file
    const plan = deps.findLatestPlan();
    deps.stderr.write(`[cpr] plan=${plan ? plan.path : 'null'}\n`);
    if (plan === null) {
      deps.stderr.write(`[cpr] no plan found, allowing ExitPlanMode\n`);
      return;
    }

    // 5. Build prompt and run review
    const prompt = deps.buildPrompt(plan.content, config.prompt);
    const adapter = deps.getAdapter(config.adapter);
    deps.stderr.write(`[cpr] reviewing with ${config.adapter}...\n`);
    const result = await adapter.review(prompt, config[config.adapter]);

    // 6. Increment review count
    deps.incrementReviewCount(input.session_id);

    // 7. Output deny decision to stdout (blocks ExitPlanMode)
    const output = JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: result,
      },
    });
    deps.stdout.write(output + "\n");
    deps.stderr.write(`[cpr] review complete, denying ExitPlanMode\n`);
  } catch (err) {
    // On any error, allow ExitPlanMode (no stdout = allow)
    deps.stderr.write(`[cpr] ERROR: ${err.message ?? err}\n${err.stack ?? ''}\n`);
  }
}
