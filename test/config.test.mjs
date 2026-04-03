/**
 * Test module for config.mjs
 *
 * Coverage:
 * - CONFIG_PATH uses home directory
 * - DEFAULT_CONFIG has correct shape and values
 * - loadConfig returns defaults when no file exists
 * - loadConfig merges partial config with defaults
 * - loadConfig validates types and falls back to defaults for invalid values
 * - saveConfig writes valid JSON with 2-space indent
 * - saveConfig writes file with mode 0o600
 * - Round-trip: saveConfig -> loadConfig
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CONFIG_PATH,
  DEFAULT_CONFIG,
  loadConfig,
  saveConfig,
} from "../src/config.mjs";

// ==================== CONFIG_PATH ====================

describe("CONFIG_PATH", () => {
  it("should be a string ending with .claude-plan-reviewer.json", () => {
    assert.equal(typeof CONFIG_PATH, "string");
    assert.ok(
      CONFIG_PATH.endsWith(".claude-plan-reviewer.json"),
      `CONFIG_PATH should end with .claude-plan-reviewer.json, got: ${CONFIG_PATH}`
    );
  });

  it("should be located in the user home directory", () => {
    const home = os.homedir();
    assert.equal(
      CONFIG_PATH,
      path.join(home, ".claude-plan-reviewer.json"),
      `CONFIG_PATH should be ${path.join(home, ".claude-plan-reviewer.json")}, got: ${CONFIG_PATH}`
    );
  });
});

// ==================== DEFAULT_CONFIG ====================

describe("DEFAULT_CONFIG", () => {
  it("should be a plain object", () => {
    assert.equal(typeof DEFAULT_CONFIG, "object");
    assert.ok(DEFAULT_CONFIG !== null, "DEFAULT_CONFIG should not be null");
    assert.ok(!Array.isArray(DEFAULT_CONFIG), "DEFAULT_CONFIG should not be an array");
  });

  it("should have adapter as 'codex'", () => {
    assert.equal(DEFAULT_CONFIG.adapter, "codex");
  });

  it("should have maxReviews as 2", () => {
    assert.equal(DEFAULT_CONFIG.maxReviews, 2);
  });

  it("should have prompt as empty string", () => {
    assert.equal(DEFAULT_CONFIG.prompt, "");
  });

  it("should have codex as object with model and sandbox", () => {
    assert.equal(typeof DEFAULT_CONFIG.codex, "object");
    assert.ok(DEFAULT_CONFIG.codex !== null, "codex should not be null");
    assert.equal(DEFAULT_CONFIG.codex.model, "");
    assert.equal(DEFAULT_CONFIG.codex.sandbox, "read-only");
    assert.equal(DEFAULT_CONFIG.codex.timeout, 120000);
  });

  it("should have gemini as object with model", () => {
    assert.equal(typeof DEFAULT_CONFIG.gemini, "object");
    assert.ok(DEFAULT_CONFIG.gemini !== null, "gemini should not be null");
    assert.equal(DEFAULT_CONFIG.gemini.model, "");
  });
});

// ==================== loadConfig ====================

describe("loadConfig", () => {
  let tmpDir;
  let tmpConfigPath;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cpr-test-"));
    tmpConfigPath = path.join(tmpDir, ".claude-plan-reviewer.json");
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should be a function", () => {
    assert.equal(typeof loadConfig, "function");
  });

  it("should return defaults when config file does not exist", () => {
    const nonExistentPath = path.join(tmpDir, "no-such-file.json");
    const config = loadConfig(nonExistentPath);

    assert.deepEqual(config, {
      adapter: "codex",
      maxReviews: 2,
      prompt: "",
      codex: {
        model: "",
        sandbox: "read-only",
        timeout: 120000,
      },
      gemini: {
        model: "",
      },
    });
  });

  it("should merge partial config with defaults", () => {
    const partialConfig = { adapter: "gemini", prompt: "Be strict." };
    fs.writeFileSync(tmpConfigPath, JSON.stringify(partialConfig, null, 2));

    const config = loadConfig(tmpConfigPath);

    // Overridden values
    assert.equal(config.adapter, "gemini");
    assert.equal(config.prompt, "Be strict.");

    // Default values preserved
    assert.equal(config.maxReviews, 2);
    assert.deepEqual(config.codex, { model: "", sandbox: "read-only", timeout: 120000 });
    assert.deepEqual(config.gemini, { model: "" });
  });

  it("should deep-merge codex sub-object with defaults", () => {
    const partialConfig = { codex: { model: "o3" } };
    fs.writeFileSync(tmpConfigPath, JSON.stringify(partialConfig, null, 2));

    const config = loadConfig(tmpConfigPath);

    // Overridden sub-field
    assert.equal(config.codex.model, "o3");
    // Default sub-field preserved
    assert.equal(config.codex.sandbox, "read-only");
    assert.equal(config.codex.timeout, 120000);
  });

  it("should deep-merge gemini sub-object with defaults", () => {
    const partialConfig = { gemini: { model: "gemini-2.5-pro" } };
    fs.writeFileSync(tmpConfigPath, JSON.stringify(partialConfig, null, 2));

    const config = loadConfig(tmpConfigPath);

    assert.equal(config.gemini.model, "gemini-2.5-pro");
  });

  it("should return a full config when file contains all fields", () => {
    const fullConfig = {
      adapter: "gemini",
      maxReviews: 5,
      prompt: "Review carefully.",
      codex: {
        model: "o3",
        sandbox: "network",
        timeout: 300000,
      },
      gemini: {
        model: "gemini-2.5-pro",
      },
    };
    fs.writeFileSync(tmpConfigPath, JSON.stringify(fullConfig, null, 2));

    const config = loadConfig(tmpConfigPath);
    assert.deepEqual(config, fullConfig);
  });

  // --- Type validation fallback tests ---

  it("should fall back to default adapter when adapter is not a string", () => {
    fs.writeFileSync(tmpConfigPath, JSON.stringify({ adapter: 123 }));
    const config = loadConfig(tmpConfigPath);
    assert.equal(config.adapter, DEFAULT_CONFIG.adapter);
  });

  it("should fall back to default maxReviews when maxReviews is not a positive integer", () => {
    fs.writeFileSync(tmpConfigPath, JSON.stringify({ maxReviews: "many" }));
    let config = loadConfig(tmpConfigPath);
    assert.equal(config.maxReviews, DEFAULT_CONFIG.maxReviews);

    fs.writeFileSync(tmpConfigPath, JSON.stringify({ maxReviews: 0 }));
    config = loadConfig(tmpConfigPath);
    assert.equal(config.maxReviews, DEFAULT_CONFIG.maxReviews);

    fs.writeFileSync(tmpConfigPath, JSON.stringify({ maxReviews: -3 }));
    config = loadConfig(tmpConfigPath);
    assert.equal(config.maxReviews, DEFAULT_CONFIG.maxReviews);

    fs.writeFileSync(tmpConfigPath, JSON.stringify({ maxReviews: 2.5 }));
    config = loadConfig(tmpConfigPath);
    assert.equal(config.maxReviews, DEFAULT_CONFIG.maxReviews);
  });

  it("should fall back to default prompt when prompt is not a string", () => {
    fs.writeFileSync(tmpConfigPath, JSON.stringify({ prompt: 42 }));
    const config = loadConfig(tmpConfigPath);
    assert.equal(config.prompt, DEFAULT_CONFIG.prompt);
  });

  it("should fall back to default codex when codex is not an object", () => {
    fs.writeFileSync(tmpConfigPath, JSON.stringify({ codex: "invalid" }));
    const config = loadConfig(tmpConfigPath);
    assert.deepEqual(config.codex, DEFAULT_CONFIG.codex);
  });

  it("should fall back to default codex.model when codex.model is not a string", () => {
    fs.writeFileSync(tmpConfigPath, JSON.stringify({ codex: { model: 123, sandbox: "network", timeout: 300000 } }));
    const config = loadConfig(tmpConfigPath);
    assert.equal(config.codex.model, DEFAULT_CONFIG.codex.model);
    assert.equal(config.codex.sandbox, "network");
    assert.equal(config.codex.timeout, 300000);
  });

  it("should fall back to default codex.sandbox when codex.sandbox is not a string", () => {
    fs.writeFileSync(tmpConfigPath, JSON.stringify({ codex: { model: "o3", sandbox: false, timeout: 300000 } }));
    const config = loadConfig(tmpConfigPath);
    assert.equal(config.codex.model, "o3");
    assert.equal(config.codex.sandbox, DEFAULT_CONFIG.codex.sandbox);
    assert.equal(config.codex.timeout, 300000);
  });

  it("should fall back to default codex.timeout when codex.timeout is not a positive integer", () => {
    fs.writeFileSync(tmpConfigPath, JSON.stringify({ codex: { model: "o3", sandbox: "network", timeout: "slow" } }));
    let config = loadConfig(tmpConfigPath);
    assert.equal(config.codex.model, "o3");
    assert.equal(config.codex.sandbox, "network");
    assert.equal(config.codex.timeout, DEFAULT_CONFIG.codex.timeout);

    fs.writeFileSync(tmpConfigPath, JSON.stringify({ codex: { timeout: 0 } }));
    config = loadConfig(tmpConfigPath);
    assert.equal(config.codex.timeout, DEFAULT_CONFIG.codex.timeout);
  });

  it("should fall back to default gemini when gemini is not an object", () => {
    fs.writeFileSync(tmpConfigPath, JSON.stringify({ gemini: null }));
    const config = loadConfig(tmpConfigPath);
    assert.deepEqual(config.gemini, DEFAULT_CONFIG.gemini);
  });

  it("should fall back to default gemini.model when gemini.model is not a string", () => {
    fs.writeFileSync(tmpConfigPath, JSON.stringify({ gemini: { model: true } }));
    const config = loadConfig(tmpConfigPath);
    assert.equal(config.gemini.model, DEFAULT_CONFIG.gemini.model);
  });
});

// ==================== saveConfig ====================

describe("saveConfig", () => {
  let tmpDir;
  let tmpConfigPath;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cpr-test-"));
    tmpConfigPath = path.join(tmpDir, ".claude-plan-reviewer.json");
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should be a function", () => {
    assert.equal(typeof saveConfig, "function");
  });

  it("should write valid JSON to the specified path", () => {
    const config = {
      adapter: "codex",
      maxReviews: 3,
      prompt: "save-test",
      codex: { model: "", sandbox: "read-only", timeout: 120000 },
      gemini: { model: "" },
    };

    saveConfig(config, tmpConfigPath);

    const raw = fs.readFileSync(tmpConfigPath, "utf-8");
    const parsed = JSON.parse(raw);
    assert.deepEqual(parsed, config);
  });

  it("should write JSON with 2-space indentation", () => {
    const config = { adapter: "codex", maxReviews: 2 };

    saveConfig(config, tmpConfigPath);

    const raw = fs.readFileSync(tmpConfigPath, "utf-8");
    const expected = JSON.stringify(config, null, 2);
    assert.equal(raw, expected);
  });

  it("should write file with mode 0o600 (owner read/write only)", () => {
    const config = { adapter: "codex" };
    saveConfig(config, tmpConfigPath);

    const stat = fs.statSync(tmpConfigPath);
    const mode = stat.mode & 0o777;

    if (process.platform === "win32") {
      assert.equal(
        mode,
        0o666,
        `Windows does not enforce POSIX 0o600 modes, got 0o${mode.toString(8)}`
      );
      return;
    }

    assert.equal(
      mode,
      0o600,
      `File mode should be 0o600, got 0o${mode.toString(8)}`
    );
  });

  it("should round-trip with loadConfig", () => {
    const original = {
      adapter: "gemini",
      maxReviews: 4,
      prompt: "Be thorough.",
      codex: {
        model: "o3",
        sandbox: "network",
        timeout: 300000,
      },
      gemini: {
        model: "gemini-2.5-pro",
      },
    };

    saveConfig(original, tmpConfigPath);
    const loaded = loadConfig(tmpConfigPath);

    assert.deepEqual(loaded, original);
  });
});
