---
name: ci-transit
description: A transit map for your CI runs. Use when the user wants to visualize a GitHub Actions run as a subway map. Draws jobs as lines, steps as stations, and failed, cancelled or slow steps as service alerts.
---

> Installed as a Claude Code plugin: `CLAUDE_PLUGIN_ROOT` is the repo root, which holds
> `skills/ci-transit/` and `core/`. Generated from `skills/ci-transit/SKILL.md` by `scripts/build-plugin-skill.mjs`; do not edit.


# Transit

A public transit map for a GitHub Actions run.

🔒 Runs entirely on the user's machine; run data never leaves it. No telemetry, tracking or analytics. The built page makes no network requests. The only network use is the optional fetch script against the user's own GitHub account through their local `gh` CLI.

## Where things are

`<skill>` below means the folder containing this SKILL.md. Run every script from it by absolute path, e.g. `node <skill>/../../core/build.mjs ./run.json --format gh-actions --out ./transit-out/ci/transit.html`. Trace paths are relative to the user's working directory. Pass `--out` (build) or `--out-dir` (render) so results land in the user's working directory, not inside the skill folder.

## Steps

1. **Get one run into a file.** Use `node <skill>/scripts/fetch.mjs <run-id> [--repo owner/name] [--out run.json]`. It invokes the local `gh run view` command read-only. Or provide a synthetic or previously saved run JSON file shaped like `gh run view --json ...`.
2. **Build the interactive page:** `node <skill>/../../core/build.mjs <run.json> --format gh-actions --out ./transit-out/ci/transit.html --title "CI: one run" --subtitle "SYNTHETIC sample data"`.
3. **Share it (MP4 + GIF):** `node <skill>/../../core/render.mjs <run.json> --format gh-actions --name ci --out-dir ./transit-out/ci --title "CI: one run" --subtitle "SYNTHETIC sample data"`.
4. **Check it:** `node <skill>/../../core/verify.mjs <run.json> --format gh-actions --name ci`.
5. Report slow steps, failed or cancelled steps, skipped jobs, and the job dependency map shown by the run.

## Rules

- Only render with the bundled scripts. If they fail, stop and report the exact error and command to rerun with more permissions. Never hand-write a substitute renderer or a look-alike GIF.
- Never upload a run or render anywhere unless the user asks.
- GitHub Actions logs and metadata can contain private repository information. Keep the input and output local; use synthetic data for examples and tests.
- `gh` is optional. A saved JSON file can always be passed directly to the core build/render scripts.
