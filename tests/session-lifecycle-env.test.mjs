import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { makeTempDir, run } from "./helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = path.join(ROOT, "plugins", "codex", "scripts", "session-lifecycle-hook.mjs");

function sessionStart(envFile, input, extraEnv = {}) {
  const result = run(process.execPath, [HOOK, "SessionStart"], {
    input: JSON.stringify({ hook_event_name: "SessionStart", ...input }),
    env: { ...process.env, CLAUDE_ENV_FILE: envFile, CLAUDE_PLUGIN_DATA: "/plugin/data", ...extraEnv }
  });
  assert.equal(result.status, 0, result.stderr);
}

test("SessionStart run 3 times leaves each export once", () => {
  const dir = makeTempDir();
  const envFile = path.join(dir, "sessionstart-hook-4.sh");
  fs.writeFileSync(envFile, "");
  for (let i = 0; i < 3; i += 1) {
    sessionStart(envFile, { session_id: "session-1", transcript_path: "/t/1.jsonl" });
  }
  assert.equal(
    fs.readFileSync(envFile, "utf8"),
    [
      "export CODEX_COMPANION_SESSION_ID='session-1'",
      "export CODEX_COMPANION_TRANSCRIPT_PATH='/t/1.jsonl'",
      "export CLAUDE_PLUGIN_DATA='/plugin/data'",
      ""
    ].join("\n")
  );
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp")), []);
});

test("a new value replaces the old one and other lines stay", () => {
  const dir = makeTempDir();
  const envFile = path.join(dir, "env.sh");
  fs.writeFileSync(envFile, "export OTHER='kept'\n");
  sessionStart(envFile, { session_id: "old", transcript_path: "/t/a.jsonl" });
  sessionStart(envFile, { session_id: "new", transcript_path: "/t/a.jsonl" });
  const lines = fs.readFileSync(envFile, "utf8").trimEnd().split("\n");
  assert.equal(lines.length, 4);
  assert.equal(lines.filter((l) => l.startsWith("export CODEX_COMPANION_SESSION_ID=")).length, 1);
  assert.ok(lines.includes("export CODEX_COMPANION_SESSION_ID='new'"));
  assert.ok(lines.includes("export OTHER='kept'"));
});

test("a value with a single quote stays one safe line", () => {
  const dir = makeTempDir();
  const envFile = path.join(dir, "env.sh");
  sessionStart(envFile, { session_id: "a'b", transcript_path: "/t/x.jsonl" });
  sessionStart(envFile, { session_id: "a'b", transcript_path: "/t/x.jsonl" });
  const lines = fs.readFileSync(envFile, "utf8").trimEnd().split("\n");
  assert.equal(lines.filter((l) => l.startsWith("export CODEX_COMPANION_SESSION_ID=")).length, 1);
  assert.ok(lines.includes(`export CODEX_COMPANION_SESSION_ID='a'"'"'b'`));
});

test("no CLAUDE_ENV_FILE: nothing is written and the hook exits 0", () => {
  const dir = makeTempDir();
  const result = run(process.execPath, [HOOK, "SessionStart"], {
    input: JSON.stringify({ hook_event_name: "SessionStart", session_id: "s" }),
    env: { ...process.env, CLAUDE_ENV_FILE: "" },
    cwd: dir
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readdirSync(dir), []);
});
