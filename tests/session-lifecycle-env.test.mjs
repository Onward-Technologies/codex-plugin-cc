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

test("3 runs leave the exact bytes of 1 run", () => {
  const dir = makeTempDir();
  const envFile = path.join(dir, "sessionstart-hook-4.sh");
  for (let i = 0; i < 3; i += 1) {
    const r = sessionStart(envFile, { session_id: "session-1", transcript_path: "/t/1.jsonl" });
    assert.equal(r.status, 0, r.stderr);
  }
  assert.equal(fs.readFileSync(envFile, "utf8"), `${OWN.join("\n")}\n`);
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp")), []);
});

test("a bloated file shrinks to 1 copy each; other content stays verbatim", () => {
  const dir = makeTempDir();
  const envFile = path.join(dir, "env.sh");
  const foreign = ["export OTHER='kept'", "", "cat <<'EOF' > /dev/null", "line one", "", "EOF"];
  const bloated = [...foreign, ...OWN, ...OWN, ...OWN, "export CODEX_COMPANION_SESSION_ID='stale'"];
  fs.writeFileSync(envFile, `${bloated.join("\n")}\n`);
  const r = sessionStart(envFile, { session_id: "session-1", transcript_path: "/t/1.jsonl" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(envFile, "utf8"), `${[...foreign, ...OWN].join("\n")}\n`);
});

test("a value with a line break is not written; the others are", () => {
  const dir = makeTempDir();
  const envFile = path.join(dir, "env.sh");
  const r = sessionStart(envFile, { session_id: "a\nb", transcript_path: "/t/1.jsonl" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(envFile, "utf8"), `${OWN.slice(1).join("\n")}\n`);
});

test("a single quote stays one line that bash reads back exactly", (t) => {
  const dir = makeTempDir();
  const envFile = path.join(dir, "env.sh");
  sessionStart(envFile, { session_id: "a'b $(touch pwned)", transcript_path: "/t/x.jsonl" });
  sessionStart(envFile, { session_id: "a'b $(touch pwned)", transcript_path: "/t/x.jsonl" });
  const lines = fs.readFileSync(envFile, "utf8").trimEnd().split("\n");
  assert.equal(lines.filter((l) => l.startsWith("export CODEX_COMPANION_SESSION_ID=")).length, 1);
  const bash = spawnSync("bash", ["-c", `. "$1"; printf '%s' "$CODEX_COMPANION_SESSION_ID"`, "x", envFile.replace(/\\/g, "/")], {
    cwd: dir,
    encoding: "utf8"
  });
  if (bash.error || bash.status !== 0) {
    t.skip("bash not available here");
    return;
  }
  assert.equal(bash.stdout, "a'b $(touch pwned)");
  assert.equal(fs.existsSync(path.join(dir, "pwned")), false);
});

test("a read error other than a missing file leaves it alone and exits 0", () => {
  const dir = makeTempDir();
  const envFile = path.join(dir, "is-a-directory");
  fs.mkdirSync(envFile);
  const r = sessionStart(envFile, { session_id: "s", transcript_path: "/t/1.jsonl" });
  assert.equal(r.status, 0, r.stderr);
  // The read path must stop it, before any write: the message names the read.
  assert.match(r.stderr, /CLAUDE_ENV_FILE not updated \(read: /);
  assert.ok(fs.statSync(envFile).isDirectory());
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp")), []);
});

test("a failed write exits 0, reports on stderr and leaves no temp file", () => {
  const dir = makeTempDir();
  const envFile = path.join(dir, "no-such-dir", "env.sh");
  const r = sessionStart(envFile, { session_id: "s", transcript_path: "/t/1.jsonl" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /CLAUDE_ENV_FILE not updated/);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("the file mode is kept (POSIX)", (t) => {
  if (process.platform === "win32") {
    t.skip("POSIX modes only");
    return;
  }
  const dir = makeTempDir();
  const envFile = path.join(dir, "env.sh");
  fs.writeFileSync(envFile, "");
  fs.chmodSync(envFile, 0o600);
  sessionStart(envFile, { session_id: "s", transcript_path: "/t/1.jsonl" });
  assert.equal(fs.statSync(envFile).mode & 0o777, 0o600);
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
