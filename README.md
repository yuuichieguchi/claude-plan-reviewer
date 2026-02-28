# claude-plan-reviewer

Claude Code の plan mode で作成したプランを、別の AI CLI（Codex, Gemini CLI）に自動レビューさせる npm パッケージ。

## 仕組み

```
Claude がプランを書いて停止しようとする
  → Stop hook 発火 → hook 実行
  → permission_mode === "plan" を確認
  → ~/.claude/plans/ から最新プランファイルを取得
  → Codex / Gemini でレビュー実行
  → stderr にレビュー結果を出力 + exit 2
  → Claude が停止をブロックされ、レビュー結果を受け取る
  → Claude がプランを修正 → 再度停止を試みる
  → maxReviews に達したら exit 0 → Claude 停止
```

## インストール

```bash
npm install -g claude-plan-reviewer
claude-plan-reviewer install
```

## アンインストール

```bash
claude-plan-reviewer uninstall
npm uninstall -g claude-plan-reviewer
```

## 設定

```bash
# 現在の設定を表示
claude-plan-reviewer config show

# アダプタを変更 (codex | gemini)
claude-plan-reviewer config set adapter gemini

# 最大レビュー回数を変更
claude-plan-reviewer config set maxReviews 3

# Codex のモデルを指定
claude-plan-reviewer config set codex.model o3

# Gemini のモデルを指定
claude-plan-reviewer config set gemini.model gemini-2.5-pro
```

### 設定ファイル

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

| キー | 説明 | デフォルト |
|------|------|-----------|
| `adapter` | 使用するレビューア (`codex` or `gemini`) | `codex` |
| `maxReviews` | セッションあたりの最大レビュー回数 | `2` |
| `prompt` | レビュー時の追加指示 | `""` |
| `codex.model` | Codex CLI のモデル | `""` (デフォルト) |
| `codex.sandbox` | Codex のサンドボックスモード | `read-only` |
| `gemini.model` | Gemini CLI のモデル | `""` (デフォルト) |

## CLI コマンド

| コマンド | 説明 |
|----------|------|
| `install` | Stop hook を `~/.claude/settings.json` に登録 |
| `uninstall` | Stop hook を削除 |
| `config show` | 現在の設定を表示 |
| `config set <key> <value>` | 設定を変更 |
| `review <file>` | 手動でプランをレビュー（テスト用） |
| `hook` | Claude Code から呼ばれる内部コマンド |

## 手動レビュー（テスト用）

```bash
claude-plan-reviewer review ~/.claude/plans/my-plan.md
```

## 前提条件

- Node.js >= 18.0.0
- レビューアの CLI がインストール済みであること:
  - Codex: `npm install -g @openai/codex`
  - Gemini: [Gemini CLI](https://github.com/google-gemini/gemini-cli)

## テスト

```bash
npm test
```

## ライセンス

MIT
