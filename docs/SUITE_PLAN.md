# Transit suite: build plan

Goal: one repo, three skills that share one engine. Each draws a developer workflow as an animated subway map.

| Skill | Input | Lines | Stations | Service alerts |
|---|---|---|---|---|
| request-transit (exists) | OTLP, Datadog, PostHog, X-Ray, Tempo | services | hops (spans) | slow or failed spans |
| ci-transit | GitHub Actions run (`gh run view --json`, `gh api .../jobs`) | jobs | steps | failed, cancelled or slow steps; retries |
| agent-transit | Local Claude Code (`~/.claude/projects/**/*.jsonl`) and Codex (`~/.codex/sessions/**/*.jsonl`) logs | tool families (Read, Edit, Bash, Web, MCP, subagent) | tool calls | errors, denials, long calls |
| query-transit (later) | `EXPLAIN (ANALYZE, FORMAT JSON)` | plan branches | plan nodes | slow nodes, row misestimates |

## Key idea: adapters emit the existing trace model

`adapters/normalize.mjs` already outputs `{ spans, meta }`, and the template draws any parent/child timed spans. So CI runs and agent sessions get mapped **into that same span model**: `service` is the line, `name` is the station, `start` and `dur` give timing, `status` and `error` drive alerts, and `attrs` fill the panel. This keeps the engine almost unchanged. The only engine work is vocabulary and theming per skill: words like "service" and "hop", legend text, and the alert wording.

## Shared vs per-skill

Shared, in `core/` (moved from today's `engine/` and parts of `scripts/`):
- `build` (template injection, fonts, redaction), `transit.template.html` (layout plus pure `renderAt(t)`), panel, design tokens, Arimo fonts
- `render-frames`, `export` (MP4, GIF, contact sheet), `verify` (double render byte-identical, freeze and black gates), `still`
- `setup.mjs` (reuse Chrome and ffmpeg, `--check`, `--no-download`) and `tools.mjs`
- `test-network.mjs` (zero network requests from the built page), run against every skill's sample
- A new `core/vocab.mjs`: a per-skill label pack (line, station, alert names, legend, panel group order) passed in as `window.VIZ_OPTS.vocab`

Per skill, in `skills/<name>/`:
- `SKILL.md`, `adapters/` (to the span model), `samples/` (synthetic), `references/`, and a thin `scripts/` CLI that calls core
- request-transit also keeps `contracts/` and `examples/`

## Repo layout

```
core/            engine, template, fonts, setup, render, verify, export, network test
skills/request-transit/  SKILL.md adapters/ contracts/ samples/ references/ scripts/
skills/ci-transit/       SKILL.md adapters/ samples/ scripts/
skills/agent-transit/    SKILL.md adapters/ samples/ scripts/
plugin/skills/<name>/    GENERATED, self-contained copies (core plus skill), not hand-edited
.claude-plugin/          one plugin listing three skills (`"skills": "./plugin/skills"`)
scripts/                 build-plugin-skills.mjs, test runner
```

Exposure:
- `scripts/build-plugin-skills.mjs` (generalized from today's script) assembles `plugin/skills/<name>/`: SKILL.md, the skill's files, and a vendored copy of `core/`. Each folder is then self-contained, which matters because `npx skills add` and Composio copy only the skill folder. `--check` fails in `npm test` when a copy is stale.
- `npx skills add <repo>` discovers all three under `plugin/skills/`. Verify this works, and also check `--skill <name>` for picking one.
- Local symlinks: `~/.claude/skills/<name>` and `~/.agents/skills/<name>` point to `plugin/skills/<name>`. Repoint the existing request-transit links.
- Cost: core is about 1.2k lines plus about 120 KB of fonts, duplicated three times in the generated folders. That's acceptable. The alternative, a shared npm package, is on hold.

## Repo name options (do not rename yet)
1. `transit-lines`: the suite "lines" metaphor, with each skill as a line
2. `devtransit`: short and clear
3. `transit-map` (or `transit-skills`): plain and searchable

GitHub redirects the old URL after a rename. Keep `request-transit` as the skill name either way.

## Milestones (one `codex exec` each, on branch `suite`)

Run each as `codex exec "<milestone text + this doc>" </dev/null` from the repo. Review the diff and renders between milestones. No push.

**M0 Baseline.** Run `npm test`, `npm run verify`, `npm run test:ui` on main and record the outputs and the hash of `out/otel/anim.mp4` in `docs/suite-baseline.md`.
Accept: every command passes, and the hash is recorded.

**M1 Extract core (no behaviour change).** Move `engine/*` and the shared scripts to `core/`. Move request-transit's files to `skills/request-transit/`. Update imports and npm scripts. Generalize the plugin-skill builder to output a self-contained `plugin/skills/request-transit/`.
Accept: `npm test`, `npm run verify`, `npm run test:ui` pass. The MP4 is **byte-identical** to M0. Running the render from inside `plugin/skills/request-transit/`, copied to /tmp, still works. `test:network` passes.

**M2 Vocab packs.** Add `core/vocab.mjs` and replace hardcoded copy in the template (service, hop, legend, alert labels) with the vocab. request-transit's vocab reproduces today's strings exactly.
Accept: the request-transit MP4 is still byte-identical to M0. A unit test renders with a dummy vocab and finds its labels in the built HTML.

**M3 ci-transit adapter.** Add a synthetic sample (a hand-built run with 3 jobs, `needs:` dependencies, one failed step, one retry) shaped like `gh run view --json jobs` output. The adapter maps run → root, job → line, step → station, and `needs` → transfers. Add tests next to `test-normalize`.
Accept: normalize tests pass, the built page has 3 lines and 1 alert, and the zero-network test passes.

**M4 ci-transit skill.** Add SKILL.md, `scripts/fetch.mjs` (wraps `gh run view <id> --json ...` and `gh api repos/{o}/{r}/actions/runs/{id}/jobs`, using the user's own gh auth, read-only), and npm `render:ci` / `verify:ci`. Add it to the plugin build.
Accept: `verify:ci` gives two byte-identical renders and passes the gates, `contact.png` looks right, and the plugin `--check` passes. Optional manual run against a public repo's run.

**M5 agent-transit adapter.** Add parsers for the Claude Code JSONL format (tool_use/tool_result pairs by id, timestamps) and the Codex session JSONL format, with synthetic samples (no real logs committed). Map tool family → line, call → station, error results and denials → alerts, and subagent calls → branch lines. Redaction is aggressive by default: file contents, command output, and prompt text are dropped. Only tool name, target path basename, duration, and status are kept unless the user opts in with `--show-args`.
Accept: tests for both formats pass, a redaction test confirms no prompt or output text appears in the HTML, and the zero-network test passes.

**M6 agent-transit skill.** Add SKILL.md (how to find the latest session file for a project), scripts, npm `render:agent` / `verify:agent`, and add it to the plugin build.
Accept: verify passes and `contact.png` has been reviewed.

**M7 Suite packaging and docs.** Update `.claude-plugin` manifests (three skills, keywords), add a suite README section per skill with GIFs, and add a single `npm test` that covers all skills. Repoint the symlinks.
Accept: `claude` and `codex` each list and run all three skills locally (repeat the agent-testing doc checks). Confirm the local `npx skills add ./` sees 3 skills.

**M8 (later) query-transit.**

## Risks
- **Codex sandbox blocks headless Chromium.** Run render and verify steps outside Codex (I'll run them), or grant Codex the needed sandbox permission for those steps. Codex's job is code and unit tests.
- **Byte-identical regressions during extraction.** M0 hash plus M1 and M2 gates.
- **Metaphor fit.** CI steps are serial within a job, so lines may look like long straight lines. Agent sessions are mostly serial too. Consider compressing idle gaps (a waiting time scale) and a cap on station count, with long runs grouped.
- **Privacy in agent logs.** These logs hold prompts, code and secrets. Use default-deny redaction, never commit real logs, and add an explicit test. Log formats are undocumented and change between versions, so keep the parsers tolerant and versioned with warnings.
- **Self-contained copies drift.** Generated folders plus the `--check` gate in `npm test`.
- **Install weight.** Still only `playwright-core`, with no new deps. `gh` is optional (users can pass a JSON file instead).
- **Scope.** No employer code, synthetic or public data only, no telemetry, nothing pushed or published without approval.

## Open decisions
1. Suite name / repo rename (options above), and whether to rename before launch.
2. Launch request-transit next week as planned, or hold for the suite?
3. Vendored core per skill (recommended) vs one shared folder that only works with whole-repo installs.
4. agent-transit scope for v1: Claude Code plus Codex, or start with one?
