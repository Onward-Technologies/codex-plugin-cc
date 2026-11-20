# Changelog

## 1.0.7-onward.1 (Onward fork of openai/codex-plugin-cc at db52e28)

- The SessionStart hook no longer appends duplicate exports to CLAUDE_ENV_FILE. Claude Code gives each hook its own env file (`session-env/<session>/sessionstart-hook-<index>.sh`), so the hook now owns that file: it writes the whole file with only its own exports, in one update, and reads none of the file's content. The file is replaced by a rename from a temp file that the same run created; its permission bits are kept (0600 for a new file); a stat error other than a missing file leaves the path alone; a value with a line break is not written; any failure goes to stderr and SessionStart still exits 0. Before, the file grew by up to 3 lines on every start, resume and compaction; on Windows, users report that the Bash tool then fails near the 8,191-character command-line limit (upstream issues 528, 661, 664, 778, 783, 788, 810, 819, 824, 827, 830).
- Known limit: if a host ever shared one CLAUDE_ENV_FILE between this hook and other writers, their lines in it would be replaced. Claude Code 2.1.329 does not share it.
- New test tests/session-lifecycle-env.test.mjs (10 cases; the bash case runs where bash exists, the mode case on POSIX only). The rest of the suite is unchanged: on Windows, 12 upstream tests fail on db52e28 as well (for example the Unix-socket broker test).
- This fork is dropped when upstream ships a fix.

## 1.0.0

- Initial version of the Codex plugin for Claude Code
