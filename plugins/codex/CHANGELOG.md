# Changelog

## 1.0.7-onward.1 (Onward fork of openai/codex-plugin-cc at db52e28)

- The SessionStart hook no longer appends duplicate exports to CLAUDE_ENV_FILE. All its exports are written in one update: a missing file counts as empty and any other read error leaves the file alone; every line that is not one of the hook's own exports stays exactly as it was; its own exports are recognized only in the exact one-line form it writes, and a value with a line break is not written; the file is replaced by a rename from a temp file with the old mode kept (0600 for a new file); any failure goes to stderr and SessionStart still exits 0. Before, the file grew by up to 3 lines on every start, resume and compaction; on Windows, users report that the Bash tool then fails near the 8,191-character command-line limit (upstream issues 528, 661, 664, 778, 783, 788, 810, 819, 824, 827, 830).
- Known limit: the hook takes no lock. Claude Code gives each hook its own env file, so another writer on the same file between the read and the rename is not expected.
- New test tests/session-lifecycle-env.test.mjs (8 cases; the mode case runs on POSIX only). The rest of the suite is unchanged: on Windows, 12 upstream tests fail on db52e28 as well (for example the Unix-socket broker test).
- This fork is dropped when upstream ships a fix.

## 1.0.0

- Initial version of the Codex plugin for Claude Code
