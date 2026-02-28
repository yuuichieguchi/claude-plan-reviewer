/**
 * Test module for setup.mjs
 *
 * Coverage:
 * - getHookCommand returns correct command string
 * - registerHook creates, updates, and preserves settings.json (PreToolUse with matcher)
 * - registerHook cleans up legacy Stop hook entries
 * - unregisterHook removes claude-plan-reviewer entries from PreToolUse and Stop
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getHookCommand, registerHook, unregisterHook } from "../src/setup.mjs";

// ==================== getHookCommand ====================

describe("getHookCommand", () => {
  it("should return a string", () => {
    const cmd = getHookCommand();
    assert.equal(typeof cmd, "string");
  });

  it("should start with 'node '", () => {
    const cmd = getHookCommand();
    assert.ok(cmd.startsWith("node "), `Expected to start with 'node ', got: ${cmd}`);
  });

  it("should contain 'cli.mjs'", () => {
    const cmd = getHookCommand();
    assert.ok(cmd.includes("cli.mjs"), `Expected to contain 'cli.mjs', got: ${cmd}`);
  });

  it("should end with ' hook'", () => {
    const cmd = getHookCommand();
    assert.ok(cmd.endsWith(" hook"), `Expected to end with ' hook', got: ${cmd}`);
  });

  it("should wrap the path in double quotes", () => {
    const cmd = getHookCommand();
    assert.match(cmd, /^node ".*" hook$/, `Expected path wrapped in double quotes, got: ${cmd}`);
  });

  it("should contain an absolute path", () => {
    const cmd = getHookCommand();
    const match = cmd.match(/^node "(.*)" hook$/);
    assert.ok(match, `Expected 'node "..." hook' pattern, got: ${cmd}`);
    assert.ok(path.isAbsolute(match[1]), `Expected absolute path, got: ${match[1]}`);
  });

  it("should contain a path ending with bin/cli.mjs", () => {
    const cmd = getHookCommand();
    const match = cmd.match(/^node "(.*)" hook$/);
    assert.ok(match, `Expected 'node "..." hook' pattern, got: ${cmd}`);
    assert.ok(
      match[1].endsWith(path.join("bin", "cli.mjs")),
      `Expected path ending with bin/cli.mjs, got: ${match[1]}`
    );
  });
});

// ==================== registerHook ====================

describe("registerHook", () => {
  let tmpDir;
  let settingsPath;
  const hookCommand = 'node "/path/to/claude-plan-reviewer/bin/cli.mjs" hook';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cpr-setup-test-"));
    settingsPath = path.join(tmpDir, "settings.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should create settings.json if it does not exist", () => {
    assert.ok(!fs.existsSync(settingsPath), "settings.json should not exist before test");

    registerHook(settingsPath, hookCommand);

    assert.ok(fs.existsSync(settingsPath), "settings.json should be created");
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    assert.ok(settings.hooks, "settings should have hooks");
    assert.ok(Array.isArray(settings.hooks.PreToolUse), "settings.hooks.PreToolUse should be an array");
  });

  it("should preserve existing settings when adding hook", () => {
    const existingSettings = {
      theme: "dark",
      language: "en",
    };
    fs.writeFileSync(settingsPath, JSON.stringify(existingSettings, null, 2));

    registerHook(settingsPath, hookCommand);

    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    assert.equal(settings.theme, "dark");
    assert.equal(settings.language, "en");
    assert.ok(settings.hooks.PreToolUse, "PreToolUse hook should be added");
  });

  it("should preserve other hooks when setting PreToolUse", () => {
    const existingSettings = {
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: "osascript -e 'say done'" }] }],
        Notification: [{ hooks: [{ type: "command", command: "some-notifier" }] }],
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(existingSettings, null, 2));

    registerHook(settingsPath, hookCommand);

    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    assert.deepEqual(settings.hooks.Stop, existingSettings.hooks.Stop);
    assert.deepEqual(settings.hooks.Notification, existingSettings.hooks.Notification);
    assert.ok(Array.isArray(settings.hooks.PreToolUse), "PreToolUse should be added alongside existing hooks");
  });

  it("should set PreToolUse to correct hook structure with matcher", () => {
    registerHook(settingsPath, hookCommand);

    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    const entries = settings.hooks.PreToolUse;
    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0], {
      matcher: "ExitPlanMode",
      hooks: [{ type: "command", command: hookCommand }],
    });
  });

  it("should update existing claude-plan-reviewer hook in place", () => {
    const oldCommand = 'node "/old/path/claude-plan-reviewer/bin/cli.mjs" hook';
    const existingSettings = {
      hooks: {
        PreToolUse: [{ matcher: "ExitPlanMode", hooks: [{ type: "command", command: oldCommand }] }],
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(existingSettings, null, 2));

    registerHook(settingsPath, hookCommand);

    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    const entries = settings.hooks.PreToolUse;
    assert.equal(entries.length, 1, "Should update in place, not append");
    assert.deepEqual(entries[0], {
      matcher: "ExitPlanMode",
      hooks: [{ type: "command", command: hookCommand }],
    });
  });

  it("should preserve existing non-claude-plan-reviewer PreToolUse hooks", () => {
    const bashHook = { matcher: "Bash", hooks: [{ type: "command", command: "lint-check" }] };
    const existingSettings = {
      hooks: {
        PreToolUse: [bashHook],
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(existingSettings, null, 2));

    registerHook(settingsPath, hookCommand);

    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    const entries = settings.hooks.PreToolUse;
    assert.equal(entries.length, 2, "Should have both hooks");
    assert.deepEqual(entries[0], bashHook, "Bash hook should be preserved");
    assert.deepEqual(entries[1], {
      matcher: "ExitPlanMode",
      hooks: [{ type: "command", command: hookCommand }],
    });
  });

  it("should clean up legacy Stop hook entries during install", () => {
    const osascriptHook = { hooks: [{ type: "command", command: "osascript -e 'say done'" }] };
    const legacyCprHook = { hooks: [{ type: "command", command: 'node "/old/claude-plan-reviewer/bin/cli.mjs" hook' }] };
    const existingSettings = {
      hooks: {
        Stop: [osascriptHook, legacyCprHook],
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(existingSettings, null, 2));

    registerHook(settingsPath, hookCommand);

    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    // Stop should only have the osascript hook
    assert.deepEqual(settings.hooks.Stop, [osascriptHook], "Legacy cpr entry should be removed from Stop");
    // PreToolUse should have the new hook
    assert.equal(settings.hooks.PreToolUse.length, 1);
    assert.equal(settings.hooks.PreToolUse[0].matcher, "ExitPlanMode");
  });

  it("should delete Stop key when legacy cleanup leaves it empty", () => {
    const legacyCprHook = { hooks: [{ type: "command", command: 'node "/old/claude-plan-reviewer/bin/cli.mjs" hook' }] };
    const existingSettings = {
      hooks: {
        Stop: [legacyCprHook],
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(existingSettings, null, 2));

    registerHook(settingsPath, hookCommand);

    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    assert.ok(!("Stop" in settings.hooks), "Stop key should be deleted when empty");
    assert.ok(Array.isArray(settings.hooks.PreToolUse), "PreToolUse should be added");
  });
});

// ==================== unregisterHook ====================

describe("unregisterHook", () => {
  let tmpDir;
  let settingsPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cpr-setup-test-"));
    settingsPath = path.join(tmpDir, "settings.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should do nothing when settings file does not exist", () => {
    assert.doesNotThrow(() => unregisterHook(settingsPath));
    assert.ok(!fs.existsSync(settingsPath), "settings.json should not be created");
  });

  it("should do nothing when settings has no hooks", () => {
    const settings = { theme: "dark" };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    unregisterHook(settingsPath);

    const result = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    assert.deepEqual(result, settings, "Settings should remain unchanged");
  });

  it("should do nothing when settings has no PreToolUse or Stop", () => {
    const settings = {
      hooks: {
        Notification: [{ hooks: [{ type: "command", command: "some-tool" }] }],
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    unregisterHook(settingsPath);

    const result = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    assert.deepEqual(result, settings, "Settings should remain unchanged");
  });

  it("should remove only claude-plan-reviewer entries from PreToolUse", () => {
    const bashHook = { matcher: "Bash", hooks: [{ type: "command", command: "lint-check" }] };
    const cprHook = { matcher: "ExitPlanMode", hooks: [{ type: "command", command: 'node "/path/to/claude-plan-reviewer/bin/cli.mjs" hook' }] };
    const settings = {
      hooks: {
        PreToolUse: [bashHook, cprHook],
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    unregisterHook(settingsPath);

    const result = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    assert.deepEqual(result.hooks.PreToolUse, [bashHook], "Only Bash hook should remain");
  });

  it("should also remove legacy Stop hook entries", () => {
    const osascriptHook = { hooks: [{ type: "command", command: "osascript -e 'say done'" }] };
    const legacyCprHook = { hooks: [{ type: "command", command: 'node "/path/to/claude-plan-reviewer/bin/cli.mjs" hook' }] };
    const cprPreToolUse = { matcher: "ExitPlanMode", hooks: [{ type: "command", command: 'node "/path/to/claude-plan-reviewer/bin/cli.mjs" hook' }] };
    const settings = {
      hooks: {
        PreToolUse: [cprPreToolUse],
        Stop: [osascriptHook, legacyCprHook],
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    unregisterHook(settingsPath);

    const result = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    assert.ok(!("PreToolUse" in result.hooks), "PreToolUse should be deleted when empty");
    assert.deepEqual(result.hooks.Stop, [osascriptHook], "Only osascript hook should remain in Stop");
  });

  it("should delete PreToolUse key when array becomes empty", () => {
    const cprHook = { matcher: "ExitPlanMode", hooks: [{ type: "command", command: 'node "/path/to/claude-plan-reviewer/bin/cli.mjs" hook' }] };
    const settings = {
      hooks: {
        Notification: [{ hooks: [{ type: "command", command: "notifier" }] }],
        PreToolUse: [cprHook],
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    unregisterHook(settingsPath);

    const result = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    assert.ok(!("PreToolUse" in result.hooks), "PreToolUse key should be deleted");
    assert.ok("Notification" in result.hooks, "Notification should still exist");
  });

  it("should delete hooks key when it becomes empty", () => {
    const cprHook = { matcher: "ExitPlanMode", hooks: [{ type: "command", command: 'node "/path/to/claude-plan-reviewer/bin/cli.mjs" hook' }] };
    const settings = {
      theme: "dark",
      hooks: {
        PreToolUse: [cprHook],
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    unregisterHook(settingsPath);

    const result = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    assert.ok(!("hooks" in result), "hooks key should be deleted when empty");
    assert.equal(result.theme, "dark", "Other settings should be preserved");
  });

  it("should handle legacy flat format entries in Stop", () => {
    const legacyEntry = { command: 'node "/path/to/claude-plan-reviewer/bin/cli.mjs" hook' };
    const osascriptHook = { hooks: [{ type: "command", command: "osascript -e 'say done'" }] };
    const settings = {
      hooks: {
        Stop: [legacyEntry, osascriptHook],
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    unregisterHook(settingsPath);

    const result = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    assert.deepEqual(result.hooks.Stop, [osascriptHook], "Only osascript hook should remain after removing legacy entry");
  });
});
