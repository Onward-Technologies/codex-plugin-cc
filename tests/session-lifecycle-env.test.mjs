import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { makeTempDir, run } from "./helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = path.join(ROOT, "plugins", "codex", "scripts", "session-lifecycle-hook.mjs");

function sessionStart(envFile, input, extraEnv = {}) {
  return run(process.execPath, [HOOK, "SessionStart"], {
    input: JSON.stringify({ hook_event_name: "SessionStart", ...input }),
    env: { ...process.env, CLAUDE_ENV_FILE: envFile, CLAUDE_PLUGIN_DATA: "/plugin/data", ...extraEnv }
  });
}

const OWN = [
  "export CODEX_COMPANION_SESSION_ID='session-1'",
  "export CODEX_COMPANION_TRANSCRIPT_PATH='/t/1.jsonl'",
  "export CLAUDE_PLUGIN_DATA='/plugin/data'"
];
const OWN_TEXT = `${OWN.join("\n")}\n`;

function tmpFiles(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith(".tmp"));
}

test("3 runs leave the exact bytes of 1 run", () => {
  const dir = makeTempDir();
  const envFile = path.join(dir, "sessionstart-hook-4.sh");
  for (let i = 0; i < 3; i += 1) {
    const r = sessionStart(envFile, { session_id: "session-1", transcript_path: "/t/1.jsonl" });
    assert.equal(r.status, 0, r.stderr);
  }
  assert.equal(fs.readFileSync(envFile, "utf8"), OWN_TEXT);
  assert.deepEqual(tmpFiles(dir), []);
});

test("an already bloated file is rewritten to 1 copy of each export", () => {
  const dir = makeTempDir();
  const envFile = path.join(dir, "sessionstart-hook-4.sh");
  fs.writeFileSync(envFile, [...OWN, ...OWN, ...OWN, "export CODEX_COMPANION_SESSION_ID='stale'", ""].join("\n"));
  const r = sessionStart(envFile, { session_id: "session-1", transcript_path: "/t/1.jsonl" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(envFile, "utf8"), OWN_TEXT);
});

test("a new value replaces the old one", () => {
  const dir = makeTempDir();
  const envFile = path.join(dir, "env.sh");
  sessionStart(envFile, { session_id: "old", transcript_path: "/t/1.jsonl" });
  sessionStart(envFile, { session_id: "session-1", transcript_path: "/t/1.jsonl" });
  assert.equal(fs.readFileSync(envFile, "utf8"), OWN_TEXT);
});

test("a value with a line break is not written; the others are", () => {
  const dir = makeTempDir();
  const envFile = path.join(dir, "env.sh");
  const r = sessionStart(envFile, { session_id: "a\nb", transcript_path: "/t/1.jsonl" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(envFile, "utf8"), `${OWN.slice(1).join("\n")}\n`);
});

const BASH = spawnSync("bash", ["-c", "exit 0"], { encoding: "utf8" });
test("bash sources the file and reads a hostile value back exactly", { skip: BASH.error || BASH.status !== 0 ? "bash not available here" : false }, () => {
  const dir = makeTempDir();
  const envFile = path.join(dir, "env.sh");
  sessionStart(envFile, { session_id: "a'b $(touch pwned)", transcript_path: "/t/x.jsonl" });
  const r = spawnSync("bash", ["-c", `. "$1" && printf '%s' "$CODEX_COMPANION_SESSION_ID"`, "x", envFile.replace(/\\/g, "/")], {
    cwd: dir,
    encoding: "utf8"
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "a'b $(touch pwned)");
  assert.equal(fs.existsSync(path.join(dir, "pwned")), false);
});

test("a stat error other than a missing file leaves the path alone and exits 0", () => {
  const dir = makeTempDir();
  const envFile = path.join(dir, "file", "below-a-file");
  fs.writeFileSync(path.join(dir, "file"), "x");
  const r = sessionStart(envFile, { session_id: "s", transcript_path: "/t/1.jsonl" });
  assert.equal(r.status, 0, r.stderr);
  // POSIX reports ENOTDIR here, so the stat path must stop it; Windows reports
  // ENOENT, so the write path stops it. Either way nothing changes.
  assert.match(r.stderr, process.platform === "win32" ? /CLAUDE_ENV_FILE not updated \(/ : /CLAUDE_ENV_FILE not updated \(stat: /);
  assert.equal(fs.readFileSync(path.join(dir, "file"), "utf8"), "x");
  assert.deepEqual(tmpFiles(dir), []);
});

test("a failed write exits 0, reports on stderr and leaves no temp file", () => {
  const dir = makeTempDir();
  const envFile = path.join(dir, "no-such-dir", "env.sh");
  const r = sessionStart(envFile, { session_id: "s", transcript_path: "/t/1.jsonl" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /CLAUDE_ENV_FILE not updated \(ENOENT\)/);
  assert.doesNotMatch(r.stderr, /kept/);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("a failed rename onto a directory keeps the directory and removes the run's own temp file", () => {
  const dir = makeTempDir();
  const envFile = path.join(dir, "a-directory");
  fs.mkdirSync(envFile);
  const r = sessionStart(envFile, { session_id: "s", transcript_path: "/t/1.jsonl" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /CLAUDE_ENV_FILE not updated \(/);
  assert.ok(fs.statSync(envFile).isDirectory());
  assert.deepEqual(tmpFiles(dir), []);
});

test("the file mode is kept, and the content is updated (POSIX)", { skip: process.platform === "win32" ? "POSIX modes only" : false }, () => {
  const dir = makeTempDir();
  const envFile = path.join(dir, "env.sh");
  fs.writeFileSync(envFile, "export OLD='x'\n");
  fs.chmodSync(envFile, 0o640);
  const r = run("sh", ["-c", `umask 077 && exec "$0" "$@"`, process.execPath, HOOK, "SessionStart"], {
    input: JSON.stringify({ hook_event_name: "SessionStart", session_id: "session-1", transcript_path: "/t/1.jsonl" }),
    env: { ...process.env, CLAUDE_ENV_FILE: envFile, CLAUDE_PLUGIN_DATA: "/plugin/data" }
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.statSync(envFile).mode & 0o777, 0o640);
  assert.equal(fs.readFileSync(envFile, "utf8"), OWN_TEXT);
});

test("no CLAUDE_ENV_FILE: nothing is written and the hook exits 0", () => {
  const dir = makeTempDir();
  const r = run(process.execPath, [HOOK, "SessionStart"], {
    input: JSON.stringify({ hook_event_name: "SessionStart", session_id: "s" }),
    env: { ...process.env, CLAUDE_ENV_FILE: "" },
    cwd: dir
  });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fs.readdirSync(dir), []);
});
