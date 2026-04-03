/**
 * Test module for src/prompt.mjs
 *
 * Coverage:
 * - buildPrompt is an exported function
 * - Returns a string
 * - Contains the plan content in the output
 * - Contains default review criteria (e.g., "Missing edge cases", "Security issues")
 * - Does NOT include "Additional Review Instructions" when customPrompt is empty
 * - Does NOT include "Additional Review Instructions" when customPrompt is undefined
 * - Includes "Additional Review Instructions" section when customPrompt is non-empty
 * - Contains the custom prompt text in the additional section
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt } from "../src/prompt.mjs";

describe("buildPrompt", () => {
  // ==================== Basic export ====================

  it("is an exported function", () => {
    assert.equal(typeof buildPrompt, "function");
  });

  // ==================== Return type ====================

  it("returns a string", () => {
    const result = buildPrompt("Some plan content");
    assert.equal(typeof result, "string");
  });

  // ==================== Plan content included ====================

  it("contains the plan content in the output", () => {
    const planContent = "Step 1: Refactor the auth module\nStep 2: Add rate limiting";
    const result = buildPrompt(planContent);
    assert.ok(
      result.includes(planContent),
      "Output should contain the exact plan content",
    );
  });

  // ==================== Default review criteria ====================

  it('contains default review criteria "Missing edge cases"', () => {
    const result = buildPrompt("any plan");
    assert.ok(
      result.includes("Missing edge cases"),
      'Output should contain "Missing edge cases"',
    );
  });

  it('contains default review criteria "Security issues"', () => {
    const result = buildPrompt("any plan");
    assert.ok(
      result.includes("Security issues"),
      'Output should contain "Security issues"',
    );
  });

  // ==================== No custom prompt ====================

  it('does NOT include "Additional Review Instructions" when customPrompt is empty', () => {
    const result = buildPrompt("my plan", "");
    assert.ok(
      !result.includes("Additional Review Instructions"),
      'Output should NOT contain "Additional Review Instructions" for empty customPrompt',
    );
  });

  it('does NOT include "Additional Review Instructions" when customPrompt is undefined', () => {
    const result = buildPrompt("my plan", undefined);
    assert.ok(
      !result.includes("Additional Review Instructions"),
      'Output should NOT contain "Additional Review Instructions" for undefined customPrompt',
    );
  });

  // ==================== With custom prompt ====================

  it('includes "Additional Review Instructions" section when customPrompt is non-empty', () => {
    const result = buildPrompt("my plan", "Focus on testability");
    assert.ok(
      result.includes("## Additional Review Instructions"),
      'Output should contain "## Additional Review Instructions" header',
    );
  });

  it("contains the custom prompt text in the additional section", () => {
    const customText = "Pay special attention to database migration safety";
    const result = buildPrompt("my plan", customText);
    assert.ok(
      result.includes(customText),
      "Output should contain the custom prompt text",
    );
  });

  it("keeps the legacy prompt by default", () => {
    const result = buildPrompt("my plan");
    assert.ok(
      !result.includes("inspect the relevant project files"),
      "Default output should not mention repository inspection",
    );
  });

  it("includes project-aware instructions when the feature is enabled", () => {
    const result = buildPrompt("my plan", "", {
      useProjectContext: true,
      projectPath: "/repo/path",
    });
    assert.ok(
      result.includes("inspect the relevant project files"),
      "Output should instruct the reviewer to inspect the codebase when enabled",
    );
    assert.ok(
      result.includes("## Project Context"),
      "Output should include the project context section",
    );
    assert.ok(
      result.includes("/repo/path"),
      "Output should include the provided project path",
    );
  });
});
