#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const VALID_TOP_LEVEL_KEYS = new Set(["adapter", "maxReviews", "prompt", "useProjectContext", "projectPath"]);
const VALID_NESTED_KEYS = Object.create(null);
VALID_NESTED_KEYS.codex = new Set(["model", "sandbox", "timeout"]);
VALID_NESTED_KEYS.gemini = new Set(["model"]);

export async function main(args, deps) {
  if (args.includes("--help") || args.includes("-h")) {
    deps.stdout.write(
      "Usage: claude-plan-reviewer <command>\n\nCommands:\n  setup             Add PreToolUse hook to Claude Code settings\n  teardown          Remove PreToolUse hook\n  config show       Show current configuration\n  config set <k> <v> Update a config value\n  review <file>     Manually review a plan file\n  hook              Internal: called by Claude Code PreToolUse hook\n"
    );
    return;
  }

  if (args.includes("--version") || args.includes("-v")) {
    deps.stdout.write(`${deps.version}\n`);
    return;
  }

  const command = args[0];

  switch (command) {
    case "setup": {
      try {
        deps.registerHook(deps.settingsPath, deps.getHookCommand(), { stderr: deps.stderr });
        deps.stdout.write("PreToolUse hook set up successfully.\n");
        deps.stdout.write(`Settings: ${deps.settingsPath}\n`);
      } catch (err) {
        deps.stderr.write(`Error: Failed to set up hook: ${err.message}\n`);
        deps.exit(1);
      }
      break;
    }

    case "teardown": {
      try {
        deps.unregisterHook(deps.settingsPath);
        deps.stdout.write("PreToolUse hook removed.\n");
      } catch (err) {
        deps.stderr.write(`Error: Failed to tear down hook: ${err.message}\n`);
        deps.exit(1);
      }
      break;
    }

    case "config": {
      const subCommand = args[1];
      if (subCommand === "show") {
        const config = deps.loadConfig();
        deps.stdout.write(JSON.stringify(config, null, 2) + "\n");
      } else if (subCommand === "set") {
        const key = args[2];
        const value = args[3];
        if (!key || value === undefined) {
          deps.stderr.write(
            "Usage: claude-plan-reviewer config set <key> <value>\n"
          );
          deps.exit(1);
          break;
        }
        const config = deps.loadConfig();
        // Handle nested keys like "codex.model"
        const parts = key.split(".");
        if (parts.length === 2) {
          const nested = VALID_NESTED_KEYS[parts[0]];
          if (!nested || !nested.has(parts[1])) {
            deps.stderr.write(`Error: Unknown config key "${key}"\n`);
            deps.exit(1);
            break;
          }
          if (
            typeof config[parts[0]] !== "object" ||
            config[parts[0]] === null
          ) {
            config[parts[0]] = {};
          }
          config[parts[0]][parts[1]] = parseValue(value);
        } else if (parts.length === 1) {
          if (!VALID_TOP_LEVEL_KEYS.has(key)) {
            deps.stderr.write(`Error: Unknown config key "${key}"\n`);
            deps.exit(1);
            break;
          }
          config[key] = parseValue(value);
        } else {
          deps.stderr.write(`Error: Unknown config key "${key}"\n`);
          deps.exit(1);
          break;
        }
        deps.saveConfig(config);
        deps.stdout.write(`Set ${key} = ${value}\n`);
      } else {
        deps.stderr.write("Usage: claude-plan-reviewer config <show|set>\n");
        deps.exit(1);
      }
      break;
    }

    case "review": {
      const filePath = args[1];
      if (!filePath) {
        deps.stderr.write("Usage: claude-plan-reviewer review <file>\n");
        deps.exit(1);
        break;
      }
      let content;
      try {
        content = fs.readFileSync(path.resolve(filePath), "utf-8");
      } catch (err) {
        deps.stderr.write(`Error: Cannot read file: ${err.message}\n`);
        deps.exit(1);
        break;
      }
      const config = deps.loadConfig();
      const useProjectContext = config.useProjectContext === true;
      const projectPath = useProjectContext ? (config.projectPath || deps.cwd || process.cwd()) : "";
      const prompt = useProjectContext
        ? deps.buildPrompt(content, config.prompt, { projectPath, useProjectContext: true })
        : deps.buildPrompt(content, config.prompt);
      const adapter = deps.getAdapter(config.adapter);
      try {
        deps.stdout.write(`Reviewing with ${config.adapter}...\n`);
        if (useProjectContext && projectPath) {
          deps.stdout.write(`Project: ${projectPath}\n`);
        }
        const result = await adapter.review(
          prompt,
          useProjectContext ? { ...config[config.adapter], projectPath } : config[config.adapter]
        );
        deps.stdout.write("\n" + result + "\n");
      } catch (err) {
        deps.stderr.write(`Error: Review failed: ${err.message}\n`);
        deps.exit(1);
      }
      break;
    }

    case "hook": {
      let input;
      try {
        input = JSON.parse(deps.stdin);
      } catch {
        // Invalid input — let Claude stop normally
        deps.exit(0);
        break;
      }
      try {
        await deps.processHook(input, deps.hookDeps);
      } catch {
        // On any error, let Claude stop normally
        deps.exit(0);
      }
      break;
    }

    default: {
      deps.stderr.write(
        "Usage: claude-plan-reviewer <command>\n\nCommands:\n  setup             Add PreToolUse hook to Claude Code settings\n  teardown          Remove PreToolUse hook\n  config show       Show current configuration\n  config set <k> <v> Update a config value\n  review <file>     Manually review a plan file\n  hook              Internal: called by Claude Code PreToolUse hook\n"
      );
      deps.exit(1);
      break;
    }
  }
}

/**
 * Parse a CLI value string to the appropriate JS type.
 * "true" -> true, "false" -> false, numeric strings -> number, else string.
 */
function parseValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  const num = Number(value);
  if (Number.isFinite(num) && value !== "") return num;
  return value;
}

// ---------------------------------------------------------------------------
// Auto-execute when run directly
// ---------------------------------------------------------------------------

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (() => {
    try {
      return (
        fs.realpathSync(fileURLToPath(import.meta.url)) ===
        fs.realpathSync(process.argv[1])
      );
    } catch {
      return false;
    }
  })();

if (isMain) {
  const pkg = JSON.parse(
    fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8")
  );

  const { loadConfig, saveConfig } = await import("../src/config.mjs");
  const { processHook } = await import("../src/hook.mjs");
  const { registerHook, getHookCommand, unregisterHook } = await import(
    "../src/setup.mjs"
  );
  const { buildPrompt } = await import("../src/prompt.mjs");
  const { getAdapter } = await import("../src/adapters/registry.mjs");
  const {
    getReviewCount,
    incrementReviewCount,
    cleanStaleSessions,
    saveOriginalPlan,
    getOriginalPlan,
    resetReviewCount,
  } = await import("../src/session.mjs");
  const { computeDiff } = await import("../src/diff.mjs");
  const { findLatestPlan } = await import("../src/plan.mjs");

  const args = process.argv.slice(2);

  let stdinData = "";
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    stdinData = Buffer.concat(chunks).toString("utf-8");
  }

  const deps = {
    loadConfig,
    saveConfig,
    processHook,
    registerHook,
    getHookCommand,
    unregisterHook,
    buildPrompt,
    getAdapter,
    version: pkg.version,
    settingsPath: path.join(os.homedir(), ".claude", "settings.json"),
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: stdinData,
    exit: process.exit,
    cwd: process.cwd(),
    hookDeps: {
      loadConfig,
      getReviewCount,
      incrementReviewCount,
      resetReviewCount,
      cleanStaleSessions,
      saveOriginalPlan,
      getOriginalPlan,
      computeDiff,
      findLatestPlan,
      buildPrompt,
      getAdapter,
      stdout: process.stdout,
      stderr: process.stderr,
      cwd: process.cwd(),
    },
  };

  await main(args, deps);
}
