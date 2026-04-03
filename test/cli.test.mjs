/**
 * Test module for bin/cli.mjs — main() function
 *
 * Coverage:
 * - --help / -h writes usage text to stdout
 * - --version / -v writes version string to stdout
 * - setup calls registerHook and writes success message
 * - setup writes error and exits 1 on registerHook failure
 * - teardown calls unregisterHook and writes success message
 * - teardown writes error and exits 1 on failure
 * - config show writes JSON config to stdout
 * - config set updates config values (top-level, nested, numeric)
 * - config set rejects invalid/unknown keys
 * - config set with missing key/value prints error and exits 1
 * - config without subcommand prints error and exits 1
 * - review without file argument prints error and exits 1
 * - review with nonexistent file prints error and exits 1
 * - hook with invalid stdin JSON exits 0
 * - hook with valid stdin calls processHook
 * - unknown/missing command writes usage to stderr and exits 1
 * - parseValue (tested indirectly): numeric, Infinity
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { main } from "../bin/cli.mjs";

/**
 * Creates a deps object with sensible defaults and optional overrides.
 * Exposes stdoutChunks, stderrChunks, and exitCalls arrays for assertions.
 */
function createDeps(overrides = {}) {
  const stdoutChunks = [];
  const stderrChunks = [];
  const exitCalls = [];
  return {
    loadConfig: () => ({
      adapter: "codex",
      maxReviews: 2,
      prompt: "",
      codex: { model: "", sandbox: "read-only", timeout: 120000 },
      gemini: { model: "" },
    }),
    saveConfig: () => {},
    processHook: async () => {},
    registerHook: () => {},
    getHookCommand: () => 'node "/path/to/cli.mjs" hook',
    unregisterHook: () => {},
    buildPrompt: (content, custom) => `Review: ${content}`,
    getAdapter: () => ({ review: async () => "LGTM" }),
    version: "0.1.0",
    settingsPath: "/tmp/test-settings.json",
    stdout: { write: (data) => stdoutChunks.push(data) },
    stderr: { write: (data) => stderrChunks.push(data) },
    stdin: "",
    exit: (code) => exitCalls.push(code),
    hookDeps: {},
    stdoutChunks,
    stderrChunks,
    exitCalls,
    ...overrides,
  };
}

// ==================== --help / --version ====================

describe("--help / --version", () => {
  it("--help writes usage text to stdout", async () => {
    const deps = createDeps();
    await main(["--help"], deps);

    const output = deps.stdoutChunks.join("");
    assert.ok(
      output.includes("Usage: claude-plan-reviewer"),
      `stdout should contain usage text, got: ${output}`,
    );
    assert.deepEqual(deps.exitCalls, [], "should not exit");
  });

  it("-h writes usage text to stdout", async () => {
    const deps = createDeps();
    await main(["-h"], deps);

    const output = deps.stdoutChunks.join("");
    assert.ok(
      output.includes("Usage: claude-plan-reviewer"),
      `stdout should contain usage text, got: ${output}`,
    );
  });

  it("--version writes version to stdout", async () => {
    const deps = createDeps();
    await main(["--version"], deps);

    const output = deps.stdoutChunks.join("");
    assert.equal(output, "0.1.0\n");
    assert.deepEqual(deps.exitCalls, [], "should not exit");
  });

  it("-v writes version to stdout", async () => {
    const deps = createDeps();
    await main(["-v"], deps);

    const output = deps.stdoutChunks.join("");
    assert.equal(output, "0.1.0\n");
  });
});

// ==================== setup ====================

describe("setup", () => {
  it("calls registerHook with settingsPath and hookCommand", async () => {
    let registerArgs = null;
    const deps = createDeps({
      registerHook: (settingsPath, hookCommand) => {
        registerArgs = { settingsPath, hookCommand };
      },
    });

    await main(["setup"], deps);

    assert.notEqual(registerArgs, null, "registerHook should have been called");
    assert.equal(registerArgs.settingsPath, "/tmp/test-settings.json");
    assert.equal(registerArgs.hookCommand, 'node "/path/to/cli.mjs" hook');
  });

  it("writes success message to stdout", async () => {
    const deps = createDeps();
    await main(["setup"], deps);

    const output = deps.stdoutChunks.join("");
    assert.ok(
      output.includes("PreToolUse hook set up successfully"),
      `stdout should contain success message, got: ${output}`,
    );
    assert.ok(
      output.includes("/tmp/test-settings.json"),
      `stdout should contain settings path, got: ${output}`,
    );
    assert.deepEqual(deps.exitCalls, [], "should not exit on success");
  });

  it("writes error and exits 1 on registerHook failure", async () => {
    const deps = createDeps({
      registerHook: () => {
        throw new Error("Permission denied");
      },
    });

    await main(["setup"], deps);

    const errOutput = deps.stderrChunks.join("");
    assert.ok(
      errOutput.includes("Permission denied"),
      `stderr should contain error message, got: ${errOutput}`,
    );
    assert.deepEqual(deps.exitCalls, [1]);
  });
});

// ==================== teardown ====================

describe("teardown", () => {
  it("calls unregisterHook with settingsPath", async () => {
    let unregisterArg = null;
    const deps = createDeps({
      unregisterHook: (settingsPath) => {
        unregisterArg = settingsPath;
      },
    });

    await main(["teardown"], deps);

    assert.equal(unregisterArg, "/tmp/test-settings.json");
  });

  it("writes success message", async () => {
    const deps = createDeps();
    await main(["teardown"], deps);

    const output = deps.stdoutChunks.join("");
    assert.ok(
      output.includes("PreToolUse hook removed"),
      `stdout should contain success message, got: ${output}`,
    );
    assert.deepEqual(deps.exitCalls, [], "should not exit on success");
  });

  it("writes error and exits 1 on failure", async () => {
    const deps = createDeps({
      unregisterHook: () => {
        throw new Error("File not found");
      },
    });

    await main(["teardown"], deps);

    const errOutput = deps.stderrChunks.join("");
    assert.ok(
      errOutput.includes("File not found"),
      `stderr should contain error message, got: ${errOutput}`,
    );
    assert.deepEqual(deps.exitCalls, [1]);
  });
});

// ==================== config show ====================

describe("config show", () => {
  it("writes JSON config to stdout", async () => {
    const deps = createDeps();
    await main(["config", "show"], deps);

    const output = deps.stdoutChunks.join("");
    assert.ok(
      output.includes('"adapter"'),
      `stdout should contain config keys, got: ${output}`,
    );
    assert.ok(
      output.includes('"codex"'),
      `stdout should contain adapter name, got: ${output}`,
    );
  });

  it("output is valid JSON", async () => {
    const deps = createDeps();
    await main(["config", "show"], deps);

    const output = deps.stdoutChunks.join("");
    const parsed = JSON.parse(output);
    assert.equal(parsed.adapter, "codex");
    assert.equal(parsed.maxReviews, 2);
    assert.equal(parsed.prompt, "");
    assert.deepEqual(parsed.codex, { model: "", sandbox: "read-only", timeout: 120000 });
    assert.deepEqual(parsed.gemini, { model: "" });
  });
});

// ==================== config set ====================

describe("config set", () => {
  it("config set adapter gemini calls saveConfig with updated adapter", async () => {
    let savedConfig = null;
    const deps = createDeps({
      saveConfig: (config) => {
        savedConfig = config;
      },
    });

    await main(["config", "set", "adapter", "gemini"], deps);

    assert.notEqual(savedConfig, null, "saveConfig should have been called");
    assert.equal(savedConfig.adapter, "gemini");
    assert.deepEqual(deps.exitCalls, [], "should not exit on success");
  });

  it("config set maxReviews 5 saves number value (not string)", async () => {
    let savedConfig = null;
    const deps = createDeps({
      saveConfig: (config) => {
        savedConfig = config;
      },
    });

    await main(["config", "set", "maxReviews", "5"], deps);

    assert.notEqual(savedConfig, null, "saveConfig should have been called");
    assert.equal(savedConfig.maxReviews, 5);
    assert.equal(typeof savedConfig.maxReviews, "number");
  });

  it("config set codex.model o3 sets nested key", async () => {
    let savedConfig = null;
    const deps = createDeps({
      saveConfig: (config) => {
        savedConfig = config;
      },
    });

    await main(["config", "set", "codex.model", "o3"], deps);

    assert.notEqual(savedConfig, null, "saveConfig should have been called");
    assert.equal(savedConfig.codex.model, "o3");
  });

  it("config set codex.timeout 300000 sets nested numeric key", async () => {
    let savedConfig = null;
    const deps = createDeps({
      saveConfig: (config) => {
        savedConfig = config;
      },
    });

    await main(["config", "set", "codex.timeout", "300000"], deps);

    assert.notEqual(savedConfig, null, "saveConfig should have been called");
    assert.equal(savedConfig.codex.timeout, 300000);
    assert.equal(typeof savedConfig.codex.timeout, "number");
  });

  it("config set with missing key/value prints error and exits 1", async () => {
    // Missing both key and value
    const deps1 = createDeps();
    await main(["config", "set"], deps1);

    const errOutput1 = deps1.stderrChunks.join("");
    assert.ok(
      errOutput1.includes("Usage:"),
      `stderr should contain usage message, got: ${errOutput1}`,
    );
    assert.deepEqual(deps1.exitCalls, [1]);

    // Missing value only
    const deps2 = createDeps();
    await main(["config", "set", "adapter"], deps2);

    const errOutput2 = deps2.stderrChunks.join("");
    assert.ok(
      errOutput2.includes("Usage:"),
      `stderr should contain usage message, got: ${errOutput2}`,
    );
    assert.deepEqual(deps2.exitCalls, [1]);
  });

  it("config set __proto__.polluted true rejects invalid key", async () => {
    const deps = createDeps();
    await main(["config", "set", "__proto__.polluted", "true"], deps);

    const errOutput = deps.stderrChunks.join("");
    assert.ok(
      errOutput.includes("Unknown config key"),
      `stderr should contain unknown key error, got: ${errOutput}`,
    );
    assert.deepEqual(deps.exitCalls, [1]);
  });

  it("config set unknown.key value rejects unknown nested key", async () => {
    const deps = createDeps();
    await main(["config", "set", "unknown.key", "value"], deps);

    const errOutput = deps.stderrChunks.join("");
    assert.ok(
      errOutput.includes("Unknown config key"),
      `stderr should contain unknown key error, got: ${errOutput}`,
    );
    assert.deepEqual(deps.exitCalls, [1]);
  });

  it("config set nonexistent value rejects unknown top-level key", async () => {
    const deps = createDeps();
    await main(["config", "set", "nonexistent", "value"], deps);

    const errOutput = deps.stderrChunks.join("");
    assert.ok(
      errOutput.includes("Unknown config key"),
      `stderr should contain unknown key error, got: ${errOutput}`,
    );
    assert.deepEqual(deps.exitCalls, [1]);
  });
});

// ==================== config (unknown subcommand) ====================

describe("config (unknown subcommand)", () => {
  it("config without subcommand prints error and exits 1", async () => {
    const deps = createDeps();
    await main(["config"], deps);

    const errOutput = deps.stderrChunks.join("");
    assert.ok(
      errOutput.includes("Usage:"),
      `stderr should contain usage message, got: ${errOutput}`,
    );
    assert.deepEqual(deps.exitCalls, [1]);
  });
});

// ==================== review ====================

describe("review", () => {
  it("review without file argument prints error and exits 1", async () => {
    const deps = createDeps();
    await main(["review"], deps);

    const errOutput = deps.stderrChunks.join("");
    assert.ok(
      errOutput.includes("Usage:"),
      `stderr should contain usage message, got: ${errOutput}`,
    );
    assert.deepEqual(deps.exitCalls, [1]);
  });

  it("review /nonexistent/file prints error and exits 1", async () => {
    const deps = createDeps();
    await main(["review", "/nonexistent/path/to/file.md"], deps);

    const errOutput = deps.stderrChunks.join("");
    assert.ok(
      errOutput.includes("Cannot read file"),
      `stderr should contain file error, got: ${errOutput}`,
    );
    assert.deepEqual(deps.exitCalls, [1]);
  });
});

// ==================== hook ====================

describe("hook", () => {
  it("hook with invalid stdin JSON exits 0", async () => {
    const deps = createDeps({
      stdin: "not valid json {{{",
    });

    await main(["hook"], deps);

    assert.deepEqual(deps.exitCalls, [0]);
  });

  it("hook with valid stdin calls processHook", async () => {
    let processHookArgs = null;
    const hookInput = { session_id: "test-123", tool_name: "ExitPlanMode", hook_event_name: "PreToolUse" };
    const hookDeps = { some: "dep" };
    const deps = createDeps({
      stdin: JSON.stringify(hookInput),
      processHook: async (input, deps) => {
        processHookArgs = { input, deps };
      },
      hookDeps,
    });

    await main(["hook"], deps);

    assert.notEqual(processHookArgs, null, "processHook should have been called");
    assert.deepEqual(processHookArgs.input, hookInput);
    assert.equal(processHookArgs.deps, hookDeps);
    assert.deepEqual(deps.exitCalls, [], "should not exit when processHook succeeds");
  });
});

// ==================== unknown command ====================

describe("unknown command", () => {
  it("unknown command writes usage to stderr and exits 1", async () => {
    const deps = createDeps();
    await main(["bogus"], deps);

    const errOutput = deps.stderrChunks.join("");
    assert.ok(
      errOutput.includes("Usage: claude-plan-reviewer"),
      `stderr should contain usage text, got: ${errOutput}`,
    );
    assert.deepEqual(deps.exitCalls, [1]);
  });

  it("no command writes usage to stderr and exits 1", async () => {
    const deps = createDeps();
    await main([], deps);

    const errOutput = deps.stderrChunks.join("");
    assert.ok(
      errOutput.includes("Usage: claude-plan-reviewer"),
      `stderr should contain usage text, got: ${errOutput}`,
    );
    assert.deepEqual(deps.exitCalls, [1]);
  });
});

// ==================== parseValue (indirect via config set) ====================

describe("parseValue (tested indirectly via config set)", () => {
  it("config set maxReviews 3 saves number 3", async () => {
    let savedConfig = null;
    const deps = createDeps({
      saveConfig: (config) => {
        savedConfig = config;
      },
    });

    await main(["config", "set", "maxReviews", "3"], deps);

    assert.equal(savedConfig.maxReviews, 3);
    assert.equal(typeof savedConfig.maxReviews, "number");
  });

  it('config set maxReviews Infinity saves string "Infinity" (not number)', async () => {
    let savedConfig = null;
    const deps = createDeps({
      saveConfig: (config) => {
        savedConfig = config;
      },
    });

    await main(["config", "set", "maxReviews", "Infinity"], deps);

    assert.equal(savedConfig.maxReviews, "Infinity");
    assert.equal(typeof savedConfig.maxReviews, "string");
  });
});
