# Changelog

## 1.0.7-onward.1 (Onward fork of openai/codex-plugin-cc at db52e28)

- The SessionStart hook no longer appends duplicate exports to CLAUDE_ENV_FILE. Each export replaces any earlier export of the same name, and the file is written whole (a temp file in the same folder, then a rename). Before, the file grew by 3 lines on every start, resume and compaction, and on Windows the Bash tool failed near the 8,191-character command-line limit (upstream issues 528, 661, 664, 778, 783, 788, 810, 819, 824, 827, 830).
- New test tests/session-lifecycle-env.test.mjs (4 cases). The rest of the suite is unchanged: on Windows, 12 upstream tests fail on db52e28 as well (for example the Unix-socket broker test).
- This fork is dropped when upstream ships a fix.

## 1.0.0

- Initial version of the Codex plugin for Claude Code
