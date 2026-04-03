/**
 * Test module for src/adapters/codex.mjs
 *
 * Coverage:
 * - review is an exported async function
 * - Calls codex with correct arguments (exec, prompt, --sandbox, --full-auto)
 * - Uses cmd.exe wrapper on Windows
 * - Returns trimmed stdout from codex
 * - Includes --model flag when model option is provided
 * - Uses "read-only" as default sandbox
 * - Uses custom sandbox when provided
 * - Throws on spawn error (e.g., codex not found)
 * - Throws on non-zero exit code with stderr message
 * - Passes AbortSignal to spawn for timeout support
 * - Rejects with 'timed out' message on AbortError
 * - Returns empty string when stdout is empty
 * - Calls onData for each stdout chunk
 * - Closes stdin so Codex does not wait for extra input
 * - Settle guard prevents double resolution when both error and close fire
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { review } from "../../src/adapters/codex.mjs";

/**
 * Creates a mock spawn function that simulates child_process.spawn.
 * Returns a fake child process with stdin/stdout/stderr streams.
 *
 * @param {object} result - The result configuration.
 * @param {string} [result.stdout="LGTM"] - Data to emit on stdout.
 * @param {string} [result.stderr=""] - Data to emit on stderr.
 * @param {number} [result.code=0] - Exit code for the child process.
 * @param {Error} [result.error] - If set, emit an 'error' event instead of 'close'.
 * @returns {Function & { calls: Array<{ cmd: string, args: string[], options: object, child: EventEmitter }> }}
 */
function createMockSpawn(result = { stdout: "LGTM", code: 0 }) {
  const calls = [];
  const fn = (cmd, args, options) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};
    let stdinData = "";
    child.stdin.on("data", (data) => {
      stdinData += data;
    });

    calls.push({
      cmd,
      args,
      options,
      child,
      get stdinData() {
        return stdinData;
      },
    });

    process.nextTick(() => {
      if (result.error) {
        child.emit("error", result.error);
        return;
      }
      if (result.stdout) child.stdout.push(result.stdout);
      child.stdout.push(null);
      if (result.stderr) child.stderr.push(result.stderr);
      child.stderr.push(null);
      child.emit("close", result.code ?? 0);
    });

    return child;
  };
  fn.calls = calls;
  return fn;
}

describe("codex adapter", () => {
  // ==================== Basic export ====================

  it("review is an exported async function", () => {
    assert.equal(typeof review, "function");
    // AsyncFunction check
    const result = review("test", {}, { spawn: createMockSpawn(), platform: "linux" });
    assert.ok(result instanceof Promise, "review should return a Promise");
  });

  // ==================== Correct arguments ====================

  it("calls codex with correct arguments (exec, prompt, --sandbox, --full-auto)", async () => {
    const mockSpawn = createMockSpawn({ stdout: "looks good", code: 0 });

    await review("Please review this plan", {}, { spawn: mockSpawn, platform: "linux" });

    assert.equal(mockSpawn.calls.length, 1);
    const { cmd, args } = mockSpawn.calls[0];
    assert.equal(cmd, "codex");
    assert.deepEqual(args, [
      "exec",
      "Please review this plan",
      "--sandbox",
      "read-only",
      "--full-auto",
      "--skip-git-repo-check",
    ]);
    assert.equal(mockSpawn.calls[0].stdinData, "");
  });

  it("uses cmd.exe wrapper on Windows", async () => {
    const mockSpawn = createMockSpawn({ stdout: "looks good", code: 0 });

    await review("Please review this plan", {}, { spawn: mockSpawn, platform: "win32" });

    assert.equal(mockSpawn.calls.length, 1);
    const { cmd, options } = mockSpawn.calls[0];
    assert.ok(cmd.toLowerCase().endsWith("cmd.exe"), `expected cmd.exe, got: ${cmd}`);
    assert.deepEqual(mockSpawn.calls[0].args, [
      "/d",
      "/s",
      "/c",
      "codex",
      "exec",
      "--sandbox",
      "read-only",
      "--full-auto",
      "--skip-git-repo-check",
    ]);
    assert.equal(options.shell, undefined);
    assert.equal(mockSpawn.calls[0].stdinData, "Please review this plan");
  });

  // ==================== Returns trimmed stdout ====================

  it("returns trimmed stdout from codex", async () => {
    const mockSpawn = createMockSpawn({
      stdout: "  LGTM with minor nits  \n",
      code: 0,
    });

    const result = await review("review this", {}, { spawn: mockSpawn, platform: "linux" });
    assert.equal(result, "LGTM with minor nits");
  });

  // ==================== --model flag ====================

  it("includes --model flag when model option is provided", async () => {
    const mockSpawn = createMockSpawn({ stdout: "ok", code: 0 });

    await review("review", { model: "o3" }, { spawn: mockSpawn, platform: "linux" });

    const { args } = mockSpawn.calls[0];
    assert.deepEqual(args, [
      "exec",
      "review",
      "--sandbox",
      "read-only",
      "--full-auto",
      "--skip-git-repo-check",
      "--model",
      "o3",
    ]);
    assert.equal(mockSpawn.calls[0].stdinData, "");
  });

  // ==================== Default sandbox ====================

  it('uses "read-only" as default sandbox', async () => {
    const mockSpawn = createMockSpawn({ stdout: "ok", code: 0 });

    await review("review", {}, { spawn: mockSpawn, platform: "linux" });

    const { args } = mockSpawn.calls[0];
    const sandboxIndex = args.indexOf("--sandbox");
    assert.notEqual(sandboxIndex, -1, "args should contain --sandbox");
    assert.equal(args[sandboxIndex + 1], "read-only");
  });

  // ==================== Custom sandbox ====================

  it("uses custom sandbox when provided", async () => {
    const mockSpawn = createMockSpawn({ stdout: "ok", code: 0 });

    await review("review", { sandbox: "network" }, { spawn: mockSpawn, platform: "linux" });

    const { args } = mockSpawn.calls[0];
    const sandboxIndex = args.indexOf("--sandbox");
    assert.notEqual(sandboxIndex, -1, "args should contain --sandbox");
    assert.equal(args[sandboxIndex + 1], "network");
  });

  it("passes projectPath via --cd and spawn cwd when provided", async () => {
    const mockSpawn = createMockSpawn({ stdout: "ok", code: 0 });

    await review(
      "review",
      { projectPath: "/repo/path" },
      { spawn: mockSpawn, platform: "linux" }
    );

    const { args, options } = mockSpawn.calls[0];
    assert.deepEqual(args.slice(0, 3), ["--cd", "/repo/path", "exec"]);
    assert.equal(options.cwd, "/repo/path");
  });

  // ==================== Error handling ====================

  it("throws on spawn error (e.g., codex not found)", async () => {
    const spawnError = new Error("spawn codex ENOENT");
    spawnError.code = "ENOENT";
    const mockSpawn = createMockSpawn({ error: spawnError });

    await assert.rejects(
      () => review("review", {}, { spawn: mockSpawn, platform: "linux" }),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes("Codex CLI not found"),
          `Error message should include 'Codex CLI not found', got: ${err.message}`
        );
        return true;
      }
    );
  });

  // ==================== Non-zero exit code ====================

  it("throws on non-zero exit code with stderr message", async () => {
    const mockSpawn = createMockSpawn({
      stdout: "",
      stderr: "Error: model not found",
      code: 1,
    });

    await assert.rejects(
      () => review("review", {}, { spawn: mockSpawn, platform: "linux" }),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes("Codex review failed"),
          `Error message should include 'Codex review failed', got: ${err.message}`
        );
        assert.ok(
          err.message.includes("Error: model not found"),
          `Error message should include stderr content, got: ${err.message}`
        );
        return true;
      }
    );
  });

  // ==================== Timeout via AbortController ====================

  it("passes an AbortSignal to spawn instead of timeout", async () => {
    const mockSpawn = createMockSpawn({ stdout: "ok", code: 0 });

    await review("review", { timeout: 60000 }, { spawn: mockSpawn, platform: "linux" });

    const { options } = mockSpawn.calls[0];
    assert.ok(
      options.signal instanceof AbortSignal,
      "spawn options should contain an AbortSignal"
    );
    assert.equal(options.timeout, undefined, "timeout should NOT be passed to spawn");
  });

  it("passes an AbortSignal even when timeout is not specified", async () => {
    const mockSpawn = createMockSpawn({ stdout: "ok", code: 0 });

    await review("review", {}, { spawn: mockSpawn, platform: "linux" });

    const { options } = mockSpawn.calls[0];
    assert.ok(
      options.signal instanceof AbortSignal,
      "spawn options should contain an AbortSignal"
    );
  });

  it("rejects with 'timed out' message when AbortError is emitted", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    const mockSpawn = createMockSpawn({ error: abortError });

    await assert.rejects(
      () => review("review", {}, { spawn: mockSpawn, platform: "linux" }),
      (err) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, "Codex review timed out");
        return true;
      }
    );
  });

  // ==================== Empty stdout ====================

  it("returns empty string when stdout is empty", async () => {
    const mockSpawn = createMockSpawn({ stdout: "", code: 0 });

    const result = await review("review", {}, { spawn: mockSpawn, platform: "linux" });
    assert.equal(result, "");
  });

  it("returns empty string when stdout is only whitespace", async () => {
    const mockSpawn = createMockSpawn({ stdout: "   \n\n  ", code: 0 });

    const result = await review("review", {}, { spawn: mockSpawn, platform: "linux" });
    assert.equal(result, "");
  });

  // ==================== onData callback ====================

  it("calls onData for each stdout chunk", async () => {
    const mockSpawn = createMockSpawn({ stdout: "review output", code: 0 });
    const onDataCalls = [];
    const onData = (data) => onDataCalls.push(data);

    await review("review", {}, { spawn: mockSpawn, onData, platform: "linux" });

    assert.ok(
      onDataCalls.length > 0,
      `onData should have been called at least once, got ${onDataCalls.length} calls`
    );
    const combined = onDataCalls.map(String).join("");
    assert.ok(
      combined.includes("review output"),
      `onData calls should contain stdout data, got: ${combined}`
    );
  });

  it("closes stdin so Codex does not wait for extra input", async () => {
    const mockSpawn = createMockSpawn({ stdout: "ok", code: 0 });

    await review("review", {}, { spawn: mockSpawn, platform: "linux" });

    assert.equal(mockSpawn.calls.length, 1);
    assert.equal(mockSpawn.calls[0].child.stdin.writableEnded, true);
  });

  it("writes the full prompt to stdin on Windows", async () => {
    const mockSpawn = createMockSpawn({ stdout: "ok", code: 0 });

    await review("Long prompt with spaces\nand multiple lines", {}, { spawn: mockSpawn, platform: "win32" });

    assert.equal(mockSpawn.calls.length, 1);
    assert.equal(mockSpawn.calls[0].stdinData, "Long prompt with spaces\nand multiple lines");
  });

  // ==================== Settle guard ====================

  it("does not resolve after an error has already been emitted", async () => {
    const calls = [];
    const mockSpawn = (cmd, args, options) => {
      const child = new EventEmitter();
      child.stdin = new PassThrough();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => {};
      calls.push({ cmd, args, options, child });
      process.nextTick(() => {
        child.emit("error", new Error("something broke"));
        child.stdout.push(null);
        child.stderr.push(null);
        child.emit("close", 0);
      });
      return child;
    };

    await assert.rejects(
      () => review("review", {}, { spawn: mockSpawn, platform: "linux" }),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("Codex review failed"));
        return true;
      }
    );
  });
});
