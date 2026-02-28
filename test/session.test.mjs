import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  SESSION_PATH,
  getReviewCount,
  incrementReviewCount,
  cleanStaleSessions,
  saveOriginalPlan,
  getOriginalPlan,
} from '../src/session.mjs';

describe('session', () => {
  let tempDir;
  let tempSessionPath;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'session-test-'));
    tempSessionPath = join(tempDir, 'sessions.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('SESSION_PATH is in the OS temp directory', () => {
    assert.equal(SESSION_PATH, join(tmpdir(), 'claude-plan-reviewer-sessions.json'));
  });

  it('getReviewCount returns 0 for unknown session', () => {
    const count = getReviewCount('nonexistent-session', tempSessionPath);
    assert.equal(count, 0);
  });

  it('getReviewCount returns 0 when file does not exist', () => {
    const noFile = join(tempDir, 'no-such-file.json');
    const count = getReviewCount('any-session', noFile);
    assert.equal(count, 0);
  });

  it('incrementReviewCount creates file and returns 1 on first call', () => {
    const count = incrementReviewCount('session-1', tempSessionPath);
    assert.equal(count, 1);
    assert.ok(existsSync(tempSessionPath), 'session file should exist');
  });

  it('incrementReviewCount increments and returns correct count', () => {
    incrementReviewCount('session-1', tempSessionPath);
    const count2 = incrementReviewCount('session-1', tempSessionPath);
    assert.equal(count2, 2);

    const count3 = incrementReviewCount('session-1', tempSessionPath);
    assert.equal(count3, 3);
  });

  it('incrementReviewCount preserves other sessions', () => {
    incrementReviewCount('session-a', tempSessionPath);
    incrementReviewCount('session-b', tempSessionPath);
    incrementReviewCount('session-a', tempSessionPath);

    assert.equal(getReviewCount('session-a', tempSessionPath), 2);
    assert.equal(getReviewCount('session-b', tempSessionPath), 1);
  });

  it('cleanStaleSessions removes entries older than 24 hours', () => {
    const now = Date.now();
    const staleTime = now - 25 * 60 * 60 * 1000; // 25 hours ago

    // Manually write a session file with a stale entry
    const data = {
      'stale-session': { count: 3, lastReview: staleTime },
      'fresh-session': { count: 1, lastReview: now },
    };
    writeFileSync(tempSessionPath, JSON.stringify(data));

    cleanStaleSessions(tempSessionPath);

    const result = JSON.parse(readFileSync(tempSessionPath, 'utf-8'));
    assert.equal(result['stale-session'], undefined);
    assert.equal(result['fresh-session'].count, 1);
  });

  it('cleanStaleSessions keeps recent entries', () => {
    const now = Date.now();
    const recentTime = now - 12 * 60 * 60 * 1000; // 12 hours ago

    const data = {
      'recent-1': { count: 2, lastReview: recentTime },
      'recent-2': { count: 1, lastReview: now },
    };
    writeFileSync(tempSessionPath, JSON.stringify(data));

    cleanStaleSessions(tempSessionPath);

    const result = JSON.parse(readFileSync(tempSessionPath, 'utf-8'));
    assert.equal(result['recent-1'].count, 2);
    assert.equal(result['recent-2'].count, 1);
  });

  it('atomic write: file is written correctly after increment', () => {
    incrementReviewCount('atomic-test', tempSessionPath);

    const raw = readFileSync(tempSessionPath, 'utf-8');
    const data = JSON.parse(raw);

    assert.equal(data['atomic-test'].count, 1);
    assert.equal(typeof data['atomic-test'].lastReview, 'number');
    assert.ok(
      data['atomic-test'].lastReview <= Date.now(),
      'lastReview should be a timestamp not in the future',
    );
    assert.ok(
      data['atomic-test'].lastReview > Date.now() - 5000,
      'lastReview should be recent (within 5 seconds)',
    );
  });
});

// ============================================================
// incrementReviewCount spread fix
// ============================================================

describe('incrementReviewCount preserves extra fields', () => {
  let tempDir;
  let tempSessionPath;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'session-spread-test-'));
    tempSessionPath = join(tempDir, 'sessions.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should preserve originalPlan field after increment', () => {
    // Arrange: manually write a session file with an extra field
    const data = {
      'sess-1': { count: 1, lastReview: 12345, originalPlan: 'my plan' },
    };
    writeFileSync(tempSessionPath, JSON.stringify(data));

    // Act: increment the review count
    const newCount = incrementReviewCount('sess-1', tempSessionPath);

    // Assert: count is incremented
    assert.equal(newCount, 2);

    // Assert: originalPlan field is still present (not lost by overwrite)
    const result = JSON.parse(readFileSync(tempSessionPath, 'utf-8'));
    assert.equal(result['sess-1'].count, 2);
    assert.equal(
      result['sess-1'].originalPlan,
      'my plan',
      'originalPlan must be preserved after incrementReviewCount',
    );
  });
});

// ============================================================
// saveOriginalPlan
// ============================================================

describe('saveOriginalPlan', () => {
  let tempDir;
  let tempSessionPath;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'session-save-plan-test-'));
    tempSessionPath = join(tempDir, 'sessions.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should save plan content for a session', () => {
    // Arrange
    const sessionId = 'plan-sess-1';
    const planContent = '## My Plan\n- Step 1\n- Step 2';

    // Act
    saveOriginalPlan(sessionId, planContent, tempSessionPath);

    // Assert
    const result = JSON.parse(readFileSync(tempSessionPath, 'utf-8'));
    assert.equal(result[sessionId].originalPlan, planContent);
  });

  it('should NOT overwrite an existing originalPlan', () => {
    // Arrange
    const sessionId = 'plan-sess-2';
    const firstPlan = 'First version of the plan';
    const secondPlan = 'Second version of the plan';

    // Act: save twice with different content
    saveOriginalPlan(sessionId, firstPlan, tempSessionPath);
    saveOriginalPlan(sessionId, secondPlan, tempSessionPath);

    // Assert: the first plan content is kept
    const result = JSON.parse(readFileSync(tempSessionPath, 'utf-8'));
    assert.equal(
      result[sessionId].originalPlan,
      firstPlan,
      'originalPlan must not be overwritten on second call',
    );
  });

  it('should create session file when it does not exist yet', () => {
    // Arrange: ensure file does not exist
    const noFile = join(tempDir, 'nonexistent-sessions.json');
    assert.equal(existsSync(noFile), false, 'file must not exist before test');

    // Act
    saveOriginalPlan('new-sess', 'brand new plan', noFile);

    // Assert
    assert.ok(existsSync(noFile), 'session file should be created');
    const result = JSON.parse(readFileSync(noFile, 'utf-8'));
    assert.equal(result['new-sess'].originalPlan, 'brand new plan');
  });
});

// ============================================================
// getOriginalPlan
// ============================================================

describe('getOriginalPlan', () => {
  let tempDir;
  let tempSessionPath;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'session-get-plan-test-'));
    tempSessionPath = join(tempDir, 'sessions.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return null when session does not exist', () => {
    // Act: query a session that was never created (file doesn't exist)
    const result = getOriginalPlan('nonexistent-session', tempSessionPath);

    // Assert
    assert.equal(result, null);
  });

  it('should return null when session exists but has no originalPlan', () => {
    // Arrange: session exists with count/lastReview but no originalPlan
    const data = {
      'sess-no-plan': { count: 3, lastReview: Date.now() },
    };
    writeFileSync(tempSessionPath, JSON.stringify(data));

    // Act
    const result = getOriginalPlan('sess-no-plan', tempSessionPath);

    // Assert
    assert.equal(result, null);
  });

  it('should return the saved plan content', () => {
    // Arrange: session has originalPlan
    const planContent = '## Detailed Plan\n1. Do this\n2. Do that';
    const data = {
      'sess-with-plan': {
        count: 1,
        lastReview: Date.now(),
        originalPlan: planContent,
      },
    };
    writeFileSync(tempSessionPath, JSON.stringify(data));

    // Act
    const result = getOriginalPlan('sess-with-plan', tempSessionPath);

    // Assert
    assert.equal(result, planContent);
  });
});
