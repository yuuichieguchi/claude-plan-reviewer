# claude-plan-reviewer

Automatically review Claude Code plans using external AI CLIs (Codex, Gemini CLI). Uses Claude Code's `Stop` hook mechanism to intercept plan completion, send the plan for external review, and inject feedback back into Claude's context.

## How It Works

```
Claude writes a plan and attempts to stop
  → Stop hook fires → hook runs
  → Checks permission_mode === "plan"
  → Finds the latest plan file from ~/.claude/plans/
  → Runs review via Codex / Gemini CLI
  → Outputs review to stderr + exit 2
  → Claude is blocked from stopping and receives the review
  → Claude revises the plan → attempts to stop again
  → After maxReviews reached → exit 0 → Claude stops
```

## Install

```bash
npm install -g claude-plan-reviewer
```

## Setup

```bash
claude-plan-reviewer setup
```

> **Note:** The hook takes effect in Claude Code sessions started after setup. Already-running sessions are not affected.

## Teardown

```bash
claude-plan-reviewer teardown
```

## Uninstall

```bash
npm uninstall -g claude-plan-reviewer
```

## Configuration

```bash
# Show current config
claude-plan-reviewer config show

# Change adapter (codex | gemini)
claude-plan-reviewer config set adapter gemini

# Change max reviews per session
claude-plan-reviewer config set maxReviews 3

# Set Codex model
claude-plan-reviewer config set codex.model o3

# Set Gemini model
claude-plan-reviewer config set gemini.model gemini-2.5-pro
```

### Config File

`~/.claude-plan-reviewer.json`

```json
{
  "adapter": "codex",
  "maxReviews": 2,
  "prompt": "",
  "codex": {
    "model": "",
    "sandbox": "read-only"
  },
  "gemini": {
    "model": ""
  }
}
```

| Key | Description | Default |
|-----|-------------|---------|
| `adapter` | Reviewer to use (`codex` or `gemini`) | `codex` |
| `maxReviews` | Max reviews per session | `2` |
| `prompt` | Additional review instructions | `""` |
| `codex.model` | Codex CLI model | `""` (default) |
| `codex.sandbox` | Codex sandbox mode | `read-only` |
| `gemini.model` | Gemini CLI model | `""` (default) |

## CLI Commands

| Command | Description |
|---------|-------------|
| `setup` | Add PreToolUse hook to Claude Code settings |
| `teardown` | Remove PreToolUse hook |
| `config show` | Show current configuration |
| `config set <key> <value>` | Update a config value |
| `review <file>` | Manually review a plan file (for testing) |
| `hook` | Internal command called by Claude Code |

## Manual Review (Testing)

```bash
claude-plan-reviewer review ~/.claude/plans/my-plan.md
```

## Prerequisites

- Node.js >= 18.0.0
- A reviewer CLI installed:
  - Codex: `npm install -g @openai/codex`
  - Gemini: [Gemini CLI](https://github.com/google-gemini/gemini-cli)

## Test

```bash
npm test
```

## License

MIT
