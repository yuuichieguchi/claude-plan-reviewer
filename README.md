# claude-plan-reviewer

Automatically review Claude Code plans using external AI CLIs (Codex, Gemini CLI). Uses Claude Code's `PreToolUse` hook to intercept `ExitPlanMode`, send the plan for external review, and inject feedback back into Claude's context.

## How It Works

```
Claude writes a plan and calls ExitPlanMode
  → PreToolUse hook fires → hook runs
  → Finds the latest plan file from ~/.claude/plans/
  → Runs review via Codex / Gemini CLI
  → If LGTM → permissionDecision:"allow" → Claude exits plan mode
  → If not  → permissionDecision:"deny" + review feedback
            → Claude revises the plan → calls ExitPlanMode again
  → After maxReviews reached → allow without review
```

> **Note:** Due to a Claude Code limitation, the review result is only displayed in the chat when the reviewer returns feedback (deny). When the reviewer returns LGTM (allow), the review result is streamed to stderr but not shown in the chat UI.

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

## Disclaimer

**Use at your own risk.** This tool automatically sends your Claude Code plans to external AI services (Codex CLI, Gemini CLI) for review. The authors are not responsible for any damages or losses arising from the use of this tool, including but not limited to:

- Unintended plan content being sent to third-party AI services
- Inaccurate or misleading review feedback leading to flawed implementations
- Workflow disruption caused by misconfiguration or incompatible Claude Code versions

**Not a substitute for human review.** External AI reviews may miss critical issues or provide incorrect suggestions. Always review plans yourself before proceeding to implementation.

This software is provided "AS IS" without warranty of any kind, as stated in the [MIT License](LICENSE).

## License

MIT
