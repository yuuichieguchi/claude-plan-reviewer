import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

export const SESSION_PATH = join(tmpdir(), 'claude-plan-reviewer-sessions.json');

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Read and parse the session file. Returns an empty object if the file
 * does not exist or cannot be parsed.
 * @param {string} sessionPath
 * @returns {Record<string, { count: number; lastReview: number; originalPlan?: string }>}
 */
function readSessions(sessionPath) {
  try {
    const raw = readFileSync(sessionPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Atomically write sessions data to disk.
 * Writes to a temp file in the same directory, then renames.
 * @param {string} sessionPath
 * @param {Record<string, { count: number; lastReview: number; originalPlan?: string }>} data
 */
function atomicWrite(sessionPath, data) {
  const dir = dirname(sessionPath);
  const tmpPath = join(dir, `.sessions-${randomBytes(8).toString('hex')}.tmp`);
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(tmpPath, sessionPath);
}

/**
 * Returns the current review count for a session (0 if not found).
 * @param {string} sessionId
 * @param {string} [sessionPath]
 * @returns {number}
 */
export function getReviewCount(sessionId, sessionPath = SESSION_PATH) {
  const sessions = readSessions(sessionPath);
  const entry = sessions[sessionId];
  return entry ? entry.count : 0;
}

/**
 * Increments the review count for a session, updates lastReview timestamp,
 * writes atomically, and returns the new count.
 * @param {string} sessionId
 * @param {string} [sessionPath]
 * @returns {number}
 */
export function incrementReviewCount(sessionId, sessionPath = SESSION_PATH) {
  const sessions = readSessions(sessionPath);
  const existing = sessions[sessionId];
  const newCount = existing ? existing.count + 1 : 1;

  sessions[sessionId] = {
    ...existing,
    count: newCount,
    lastReview: Date.now(),
  };

  atomicWrite(sessionPath, sessions);
  return newCount;
}

/**
 * Saves the original plan content for a session.
 * If the session already has an originalPlan, this is a no-op (no overwrite).
 * Creates the session entry if it does not exist yet.
 * @param {string} sessionId
 * @param {string} planContent
 * @param {string} [sessionPath]
 */
export function saveOriginalPlan(sessionId, planContent, sessionPath = SESSION_PATH) {
  const sessions = readSessions(sessionPath);
  const existing = sessions[sessionId];

  if (existing && existing.originalPlan !== undefined) {
    return;
  }

  sessions[sessionId] = {
    ...existing,
    lastReview: existing?.lastReview ?? Date.now(),
    originalPlan: planContent,
  };

  atomicWrite(sessionPath, sessions);
}

/**
 * Returns the original plan content for a session, or null if not found.
 * @param {string} sessionId
 * @param {string} [sessionPath]
 * @returns {string | null}
 */
export function getOriginalPlan(sessionId, sessionPath = SESSION_PATH) {
  const sessions = readSessions(sessionPath);
  const entry = sessions[sessionId];

  if (entry && entry.originalPlan !== undefined) {
    return entry.originalPlan;
  }

  return null;
}

/**
 * Removes session entries older than 24 hours.
 * @param {string} [sessionPath]
 */
export function cleanStaleSessions(sessionPath = SESSION_PATH) {
  const sessions = readSessions(sessionPath);
  const now = Date.now();

  const cleaned = {};
  for (const [id, entry] of Object.entries(sessions)) {
    if (now - entry.lastReview < TWENTY_FOUR_HOURS_MS) {
      cleaned[id] = entry;
    }
  }

  atomicWrite(sessionPath, cleaned);
}
