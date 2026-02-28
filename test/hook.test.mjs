/**
 * Test module for hook.mjs
 *
 * Coverage:
 * - processHook is an exported async function
 * - Calls cleanStaleSessions on every invocation
 * - Returns silently when review count >= maxReviews (allows ExitPlanMode)
 * - Returns silently when no plan file found (allows ExitPlanMode)
 * - Calls buildPrompt with plan content and config prompt
 * - Calls getAdapter with config.adapter name
 * - Calls adapter.review with built prompt and adapter options
 * - Increments review count after successful review
 * - Outputs hookSpecificOutput with deny decision to stdout on success
 * - Returns silently on adapter error (allows ExitPlanMode)
 * - Writes error message to stderr on adapter error
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { processHook } from '../src/hook.mjs';

const HOOK_INPUT = { session_id: 'abc-123', tool_name: 'ExitPlanMode', hook_event_name: 'PreToolUse' };

/**
 * Creates a deps object with sensible defaults and optional overrides.
 * Exposes stdoutChunks, stderrChunks for assertions.
 */
function createDeps(overrides = {}) {
  const stdoutChunks = [];
  const stderrChunks = [];
  return {
    loadConfig: () => ({
      adapter: 'codex',
      maxReviews: 2,
      prompt: '',
      codex: { model: '', sandbox: 'read-only' },
    }),
    getReviewCount: () => 0,
    incrementReviewCount: () => 1,
    cleanStaleSessions: () => {},
    findLatestPlan: () => ({ path: '/tmp/plan.md', content: '# Plan\nDo stuff' }),
    buildPrompt: (content, custom) => `Review: ${content}`,
    getAdapter: () => ({ review: async () => 'LGTM' }),
    stdout: { write: (data) => stdoutChunks.push(data) },
    stderr: { write: (data) => stderrChunks.push(data) },
    stdoutChunks,
    stderrChunks,
    ...overrides,
  };
}

describe('processHook', () => {
  it('is an exported async function', () => {
    assert.equal(typeof processHook, 'function');
    const AsyncFunction = (async () => {}).constructor;
    assert.ok(
      processHook instanceof AsyncFunction,
      'processHook should be an async function',
    );
  });

  it('calls cleanStaleSessions on every invocation', async () => {
    let cleanCalled = false;
    const deps = createDeps({
      cleanStaleSessions: () => { cleanCalled = true; },
    });

    await processHook(HOOK_INPUT, deps);

    assert.ok(cleanCalled, 'cleanStaleSessions should have been called');
  });

  it('produces no stdout when review count >= maxReviews', async () => {
    const deps = createDeps({
      getReviewCount: () => 2,
    });

    await processHook(HOOK_INPUT, deps);

    assert.deepEqual(deps.stdoutChunks, []);
  });

  it('produces no stdout when no plan file found', async () => {
    const deps = createDeps({
      findLatestPlan: () => null,
    });

    await processHook(HOOK_INPUT, deps);

    assert.deepEqual(deps.stdoutChunks, []);
  });

  it('calls buildPrompt with plan content and config prompt', async () => {
    let buildPromptArgs = null;
    const deps = createDeps({
      buildPrompt: (content, custom) => {
        buildPromptArgs = { content, custom };
        return `Review: ${content}`;
      },
    });

    await processHook(HOOK_INPUT, deps);

    assert.notEqual(buildPromptArgs, null, 'buildPrompt should have been called');
    assert.equal(buildPromptArgs.content, '# Plan\nDo stuff');
    assert.equal(buildPromptArgs.custom, '');
  });

  it('calls getAdapter with config.adapter name', async () => {
    let getAdapterArg = null;
    const deps = createDeps({
      getAdapter: (name) => {
        getAdapterArg = name;
        return { review: async () => 'LGTM' };
      },
    });

    await processHook(HOOK_INPUT, deps);

    assert.equal(getAdapterArg, 'codex');
  });

  it('calls adapter.review with built prompt and adapter options', async () => {
    let reviewArgs = null;
    const deps = createDeps({
      getAdapter: () => ({
        review: async (prompt, options) => {
          reviewArgs = { prompt, options };
          return 'LGTM';
        },
      }),
    });

    await processHook(HOOK_INPUT, deps);

    assert.notEqual(reviewArgs, null, 'adapter.review should have been called');
    assert.equal(reviewArgs.prompt, 'Review: # Plan\nDo stuff');
    assert.deepEqual(reviewArgs.options, { model: '', sandbox: 'read-only' });
  });

  it('increments review count after successful review', async () => {
    let incrementedSessionId = null;
    const deps = createDeps({
      incrementReviewCount: (sessionId) => { incrementedSessionId = sessionId; return 1; },
    });

    await processHook(HOOK_INPUT, deps);

    assert.equal(incrementedSessionId, 'abc-123');
  });

  it('outputs hookSpecificOutput with deny decision to stdout on success', async () => {
    const deps = createDeps();

    await processHook(HOOK_INPUT, deps);

    const output = deps.stdoutChunks.join('');
    const parsed = JSON.parse(output.trim());
    assert.deepEqual(parsed, {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'LGTM',
      },
    });
  });

  it('produces no stdout on adapter error (allows ExitPlanMode)', async () => {
    const deps = createDeps({
      getAdapter: () => ({
        review: async () => { throw new Error('API timeout'); },
      }),
    });

    await processHook(HOOK_INPUT, deps);

    assert.deepEqual(deps.stdoutChunks, []);
  });

  it('writes error message to stderr on adapter error', async () => {
    const deps = createDeps({
      getAdapter: () => ({
        review: async () => { throw new Error('API timeout'); },
      }),
    });

    await processHook(HOOK_INPUT, deps);

    const stderrOutput = deps.stderrChunks.join('');
    assert.ok(
      stderrOutput.includes('API timeout'),
      `stderr should contain the error message, got: ${stderrOutput}`,
    );
  });
});
