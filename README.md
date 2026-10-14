# transit (working name)

**A public transit map for your requests.** Transit animates one request's trip through a distributed
system as a subway map, from an OpenTelemetry or Datadog trace. Services are lines, hops are stations,
slow calls get a DELAY marker and failures a SERVICE ALERT. It runs locally and can render a
frame-exact MP4/GIF for docs and chat.

Status: pre-release, private. Name and license not chosen yet.

First run sets itself up: any script checks Node 18+, installs npm deps and Playwright Chromium
if missing, and installs ffmpeg with Homebrew on macOS (on Linux it prints the `apt`/`dnf` command).
The result is cached in `.transit-cache/setup.json`; `node scripts/setup.mjs --force` re-checks.

```
npm test            # adapter tests
npm run build       # out/otel/transit.html, open it in a browser
npm run render      # out/otel/anim.mp4, anim.gif, contact.png
npm run verify      # two renders byte-identical, timing, ffmpeg freeze/black gates
npm run render:dd   # same on the Datadog-shaped sample
npm run render:posthog   # same on the PostHog Distributed Tracing sample
```

Your own trace: `node scripts/render.mjs path/to/trace.json --name mine --title "..."`.

| Path | |
| --- | --- |
| `engine/` | build (trace -> self-contained HTML), subway template, frame renderer, ffmpeg export, fonts |
| `adapters/` | OTLP / PostHog tracing / Datadog / Datadog v2 -> normalized spans; Datadog and PostHog API fetch |
| `scripts/` | `setup` (first-run checks), `fetch`, `build` (engine/build.mjs), `render`, `verify`, `extract` (stub), `still` |
| `SKILL.md`, `references/` | agent skill entry point and details |
| `samples/` | synthetic traces only |
| `examples/` | planned sample app for the contract layer |

## Install as a skill
- **Claude Code**: copy or symlink this folder to `~/.claude/skills/transit/` (or `.claude/skills/transit/` in a repo).
- **Codex**: put it under `~/.codex/skills/transit/` (or reference `SKILL.md` from `AGENTS.md`).
- **Cursor**: add it under `.cursor/skills/transit/` or reference `SKILL.md` from a project rule.

All sample data is synthetic. Span attributes can contain PII: see `references/adapters.md#privacy`.
