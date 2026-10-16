---
name: agent-transit
description: Use when the user wants to visualize one Claude Code, Codex CLI, or Cursor coding-agent session as a subway map of tool calls.
---

> Installed as a Claude Code plugin: `CLAUDE_PLUGIN_ROOT` is the repo root, which holds
> `skills/agent-transit/` and `core/`. Generated from `skills/agent-transit/SKILL.md` by `scripts/build-plugin-skill.mjs`; do not edit.


# Agent Transit

A local subway map for one AI coding-agent session: tool families are lines and tool calls are stations.

🔒 Session logs can contain prompts, source code, command output, credentials, and other secrets. This skill is default-deny: it keeps only tool name, family, target basename, timing, status, and `agent.source`. Prompt text, assistant text, tool output, file contents, full commands, and arguments are dropped. `--show-args` is an explicit opt-in and includes only a truncated, redacted argument preview.

## Where things are

`<skill>` means the folder containing this file. Run scripts from it by absolute path, e.g. `node <skill>/scripts/find-session.mjs --source codex`. The shared engine is at `<skill>/../../core/`.

## Steps

1. Find the newest local session path without reading its contents: `node <skill>/scripts/find-session.mjs --source claude-code|codex|cursor`.
2. Build one map: `node <skill>/../../core/build.mjs <session.jsonl> --format claude-code --out ./transit-out/agent/transit.html --title "Agent: one coding session, tool by tool"`.
3. Share it with the bundled renderer: `node <skill>/../../core/render.mjs <session.jsonl> --format claude-code --name agent`.
4. Check it with the bundled verifier: `node <skill>/../../core/verify.mjs <session.jsonl> --format claude-code --name agent`.

Use `--format codex` or `--format cursor` for those sources. Cursor transcripts provide order only, with uniform synthetic durations because they have no timestamps or results. Keep session files local and never upload them. Synthetic fixtures are provided in `samples/`; no real home-directory logs belong in this repository.

## Rules

- Never expose or copy prompts, code, command lines, outputs, or arguments by default.
- Only use the bundled build/render/verify scripts; never hand-write a substitute renderer.
- Do not upload a session or render unless the user explicitly asks.
- Review errors, denials, slow calls, and subagent branches in the map without revealing their payloads.
