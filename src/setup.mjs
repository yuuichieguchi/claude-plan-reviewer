import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Returns true if the entry belongs to claude-plan-reviewer.
 */
function isCprEntry(entry) {
  if (entry.hooks?.some((h) => h.command?.includes("claude-plan-reviewer"))) return true;
  if (entry.command?.includes("claude-plan-reviewer")) return true;
  return false;
}

/**
 * Returns the hook command string: `node "<absolute_path_to_bin/cli.mjs>" hook`
 */
export function getHookCommand() {
  const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "cli.mjs");
  if (!fs.existsSync(cliPath)) {
    throw new Error(`CLI entry point not found: ${cliPath}`);
  }
  return `node "${cliPath}" hook`;
}

/**
 * Registers the PreToolUse hook (matcher: ExitPlanMode) in Claude's settings.json.
 * Creates the file if it does not exist. Preserves all existing settings and hooks.
 * Also removes any leftover Stop hook entries from previous versions.
 */
export function registerHook(settingsPath, hookCommand) {
  let settings = {};

  try {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    settings = JSON.parse(raw);
  } catch (err) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  // --- Register under PreToolUse ---
  if (!Array.isArray(settings.hooks.PreToolUse)) {
    settings.hooks.PreToolUse = [];
  }

  const existingIndex = settings.hooks.PreToolUse.findIndex(isCprEntry);

  const hookEntry = {
    matcher: "ExitPlanMode",
    hooks: [{ type: "command", command: hookCommand }],
  };

  if (existingIndex >= 0) {
    settings.hooks.PreToolUse[existingIndex] = hookEntry;
  } else {
    settings.hooks.PreToolUse.push(hookEntry);
  }

  // --- Clean up legacy Stop hook entries ---
  if (Array.isArray(settings.hooks.Stop)) {
    const filtered = settings.hooks.Stop.filter((entry) => !isCprEntry(entry));
    if (filtered.length === 0) {
      delete settings.hooks.Stop;
    } else {
      settings.hooks.Stop = filtered;
    }
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

/**
 * Removes the claude-plan-reviewer hook entry from Claude's settings.json.
 * Checks both PreToolUse and Stop (for legacy cleanup).
 * If the file does not exist, does nothing.
 */
export function unregisterHook(settingsPath) {
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }

  if (!settings.hooks) return;

  let changed = false;

  // Remove from PreToolUse
  if (Array.isArray(settings.hooks.PreToolUse)) {
    const original = settings.hooks.PreToolUse;
    const filtered = original.filter((entry) => !isCprEntry(entry));
    if (filtered.length !== original.length) {
      changed = true;
      if (filtered.length === 0) {
        delete settings.hooks.PreToolUse;
      } else {
        settings.hooks.PreToolUse = filtered;
      }
    }
  }

  // Remove from Stop (legacy cleanup)
  if (Array.isArray(settings.hooks.Stop)) {
    const original = settings.hooks.Stop;
    const filtered = original.filter((entry) => !isCprEntry(entry));
    if (filtered.length !== original.length) {
      changed = true;
      if (filtered.length === 0) {
        delete settings.hooks.Stop;
      } else {
        settings.hooks.Stop = filtered;
      }
    }
  }

  if (!changed) return;

  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}
