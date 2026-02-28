/**
 * Test module for diff.mjs — computeDiff(original, revised)
 *
 * Coverage:
 * - computeDiff is an exported function
 * - Returns empty string when inputs are identical
 * - Shows removed lines in red (ANSI \x1b[31m)
 * - Shows added lines in green (ANSI \x1b[32m)
 * - Shows context lines with space prefix
 * - Handles complete replacement (all lines different)
 * - Includes header lines (--- Original Plan / +++ Final Plan)
 * - Handles empty original
 * - Handles empty revised
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeDiff } from '../src/diff.mjs';

describe('computeDiff', () => {
  // ==================== Export check ====================

  it('is an exported function', () => {
    assert.equal(typeof computeDiff, 'function');
  });

  // ==================== Identical inputs ====================

  it('returns empty string when inputs are identical', () => {
    const text = 'line one\nline two\nline three';

    const result = computeDiff(text, text);

    assert.equal(result, '');
  });

  // ==================== Removed lines ====================

  it('shows removed lines in red', () => {
    const original = 'keep this\nremove this\nalso keep';
    const revised = 'keep this\nalso keep';

    const result = computeDiff(original, revised);

    assert.ok(
      result.includes('\x1b[31m'),
      `output should contain red ANSI escape for removed lines, got: ${JSON.stringify(result)}`,
    );
    assert.ok(
      result.includes('remove this'),
      `output should contain the removed line text, got: ${JSON.stringify(result)}`,
    );
  });

  // ==================== Added lines ====================

  it('shows added lines in green', () => {
    const original = 'keep this\nalso keep';
    const revised = 'keep this\nadd this\nalso keep';

    const result = computeDiff(original, revised);

    assert.ok(
      result.includes('\x1b[32m'),
      `output should contain green ANSI escape for added lines, got: ${JSON.stringify(result)}`,
    );
    assert.ok(
      result.includes('add this'),
      `output should contain the added line text, got: ${JSON.stringify(result)}`,
    );
  });

  // ==================== Context lines ====================

  it('shows context lines with space prefix', () => {
    const original = 'context line\nremove me';
    const revised = 'context line\nadd me';

    const result = computeDiff(original, revised);

    // Context (unchanged) lines should have a leading space
    const lines = result.split('\n');
    const contextLines = lines.filter((l) => {
      // Strip ANSI codes to find content, then check raw line for space prefix
      const stripped = l.replace(/\x1b\[[0-9;]*m/g, '');
      return stripped === ' context line';
    });
    assert.ok(
      contextLines.length > 0,
      `output should contain a context line with space prefix for "context line", got lines: ${JSON.stringify(lines)}`,
    );
  });

  // ==================== Complete replacement ====================

  it('handles complete replacement', () => {
    const original = 'old line one\nold line two';
    const revised = 'new line one\nnew line two';

    const result = computeDiff(original, revised);

    // All original lines removed (red)
    assert.ok(
      result.includes('\x1b[31m'),
      `output should contain red ANSI escape for removed lines, got: ${JSON.stringify(result)}`,
    );
    assert.ok(
      result.includes('old line one'),
      `output should contain the removed text "old line one", got: ${JSON.stringify(result)}`,
    );
    assert.ok(
      result.includes('old line two'),
      `output should contain the removed text "old line two", got: ${JSON.stringify(result)}`,
    );

    // All revised lines added (green)
    assert.ok(
      result.includes('\x1b[32m'),
      `output should contain green ANSI escape for added lines, got: ${JSON.stringify(result)}`,
    );
    assert.ok(
      result.includes('new line one'),
      `output should contain the added text "new line one", got: ${JSON.stringify(result)}`,
    );
    assert.ok(
      result.includes('new line two'),
      `output should contain the added text "new line two", got: ${JSON.stringify(result)}`,
    );
  });

  // ==================== Header lines ====================

  it('includes header lines', () => {
    const original = 'old content';
    const revised = 'new content';

    const result = computeDiff(original, revised);

    assert.ok(
      result.includes('--- Original Plan'),
      `output should contain "--- Original Plan" header, got: ${JSON.stringify(result)}`,
    );
    assert.ok(
      result.includes('+++ Final Plan'),
      `output should contain "+++ Final Plan" header, got: ${JSON.stringify(result)}`,
    );
  });

  // ==================== Empty original ====================

  it('handles empty original', () => {
    const original = '';
    const revised = 'first line\nsecond line';

    const result = computeDiff(original, revised);

    // All revised lines should appear as additions (green)
    assert.ok(
      result.includes('\x1b[32m'),
      `output should contain green ANSI escape for added lines, got: ${JSON.stringify(result)}`,
    );
    assert.ok(
      result.includes('first line'),
      `output should contain added text "first line", got: ${JSON.stringify(result)}`,
    );
    assert.ok(
      result.includes('second line'),
      `output should contain added text "second line", got: ${JSON.stringify(result)}`,
    );
  });

  // ==================== Empty revised ====================

  it('handles empty revised', () => {
    const original = 'first line\nsecond line';
    const revised = '';

    const result = computeDiff(original, revised);

    // All original lines should appear as removals (red)
    assert.ok(
      result.includes('\x1b[31m'),
      `output should contain red ANSI escape for removed lines, got: ${JSON.stringify(result)}`,
    );
    assert.ok(
      result.includes('first line'),
      `output should contain removed text "first line", got: ${JSON.stringify(result)}`,
    );
    assert.ok(
      result.includes('second line'),
      `output should contain removed text "second line", got: ${JSON.stringify(result)}`,
    );
  });
});