import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const CONFIG_PATH = path.join(os.homedir(), ".claude-plan-reviewer.json");

export const DEFAULT_CONFIG = {
  adapter: "codex",
  maxReviews: 2,
  prompt: "",
  useProjectContext: false,
  projectPath: "",
  codex: {
    model: "",
    sandbox: "read-only",
    timeout: 120000,
  },
  gemini: {
    model: "",
  },
};

export function loadConfig(configPath = CONFIG_PATH) {
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const fileConfig = JSON.parse(raw);

    // Shallow merge top-level
    const config = { ...DEFAULT_CONFIG, ...fileConfig };

    // Validate adapter: must be string
    if (typeof config.adapter !== "string") {
      config.adapter = DEFAULT_CONFIG.adapter;
    }

    // Validate maxReviews: must be positive integer
    if (
      !Number.isInteger(config.maxReviews) ||
      config.maxReviews <= 0
    ) {
      config.maxReviews = DEFAULT_CONFIG.maxReviews;
    }

    // Validate prompt: must be string
    if (typeof config.prompt !== "string") {
      config.prompt = DEFAULT_CONFIG.prompt;
    }

    // Validate useProjectContext: must be boolean
    if (typeof config.useProjectContext !== "boolean") {
      config.useProjectContext = DEFAULT_CONFIG.useProjectContext;
    }

    // Validate projectPath: must be string
    if (typeof config.projectPath !== "string") {
      config.projectPath = DEFAULT_CONFIG.projectPath;
    }

    // Validate codex: must be non-null object, deep-merge with defaults
    if (
      typeof config.codex !== "object" ||
      config.codex === null ||
      Array.isArray(config.codex)
    ) {
      config.codex = { ...DEFAULT_CONFIG.codex };
    } else {
      config.codex = { ...DEFAULT_CONFIG.codex, ...config.codex };
      if (typeof config.codex.model !== "string") {
        config.codex.model = DEFAULT_CONFIG.codex.model;
      }
      if (typeof config.codex.sandbox !== "string") {
        config.codex.sandbox = DEFAULT_CONFIG.codex.sandbox;
      }
      if (
        !Number.isInteger(config.codex.timeout) ||
        config.codex.timeout <= 0
      ) {
        config.codex.timeout = DEFAULT_CONFIG.codex.timeout;
      }
    }

    // Validate gemini: must be non-null object, deep-merge with defaults
    if (
      typeof config.gemini !== "object" ||
      config.gemini === null ||
      Array.isArray(config.gemini)
    ) {
      config.gemini = { ...DEFAULT_CONFIG.gemini };
    } else {
      config.gemini = { ...DEFAULT_CONFIG.gemini, ...config.gemini };
      if (typeof config.gemini.model !== "string") {
        config.gemini.model = DEFAULT_CONFIG.gemini.model;
      }
    }

    return config;
  } catch (err) {
    if (err.code === "ENOENT") {
      return {
        ...DEFAULT_CONFIG,
        codex: { ...DEFAULT_CONFIG.codex },
        gemini: { ...DEFAULT_CONFIG.gemini },
      };
    }
    throw err;
  }
}

export function saveConfig(config, configPath = CONFIG_PATH) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
}
