---
name: transit
description: Use when the user wants to visualize or share how a request moved through services, from an OpenTelemetry or Datadog trace. Draws the trace as an animated subway map (services are lines, hops are stations, slow and failed calls are service alerts) and can render a frame-exact MP4/GIF.
---

# Transit

A public transit map for your requests. Everything runs locally; no span data leaves the machine.

## First run

Every script checks its own prerequisites the first time it runs (`scripts/setup.mjs`) and caches
the result in `.transit-cache/setup.json`, so later runs skip the check:
Node 18+ (required; can't be auto-installed), npm deps and Playwright Chromium (installed
automatically, no prompt), and ffmpeg for MP4/GIF only (installed with `brew` on macOS when
Homebrew is present, otherwise the script stops with the install command for the OS). Run
`node scripts/setup.mjs --force` to re-check; `TRANSIT_SKIP_SETUP=1` skips it.

## Steps

1. **Get the trace into a file.** A plain OTLP JSON or Datadog span JSON file needs no setup.
   For Datadog interactively, use the Datadog MCP server to fetch the trace's spans and save the raw
   JSON to a file; headless, use `node scripts/fetch.mjs datadog-api <trace_id>`.
   For PostHog Distributed Tracing, call the PostHog MCP tool `apm-trace-get` (find ids with
   `query-apm-spans`), follow pages until `hasMore` is false, and save the JSON; headless,
   `node scripts/fetch.mjs posthog-api <trace_id>` (untested live). See `references/adapters.md`.
2. **Build the interactive page:** `node engine/build.mjs <trace.json> --out out/<name>/transit.html --title "..."`.
   Open it in a browser. `?t=4.5` freezes one frame.
3. **Share it (MP4 + GIF):** `node scripts/render.mjs <trace.json> --name <name> --title "..."` writes
   `out/<name>/anim.mp4`, `anim.gif`, `contact.png`. Needs `ffmpeg` and Playwright Chromium.
4. **Check it:** `node scripts/verify.mjs <trace.json> --name <name>` (two renders byte-identical,
   train timing, ffmpeg freeze/black gates). Then look at `contact.png` and two stills yourself
   before handing it over.
5. Report what the map shows: slow hops (amber DELAY), error origins (red SERVICE ALERT with reason),
   and the hop table (every hop is listed as infrastructure or unmatched; none are hidden).

## Rules

- Never upload the trace or the render anywhere unless the user asks.
- Span attributes can contain PII. Default redaction drops user/email/token/auth/card-like keys;
  add more with `--redact key1,key2`. Payloads are never shown (tracers don't store them).
- Useful flags: `--slow-ms N`, `--ms-per-sec N`, `--target-seconds 9`, `--trace-id ID`, `--format otlp|datadog|datadog-v2|internal`.

Details: `references/adapters.md`, `references/design-system.md`, `references/config.md`, `references/extractors.md`.


## Interactive page

Open `out/<name>/transit.html` in a browser. Video renders hide all of this, and `renderAt(t)` stays a pure function of t. Selection is drawn as an overlay after it, so frames are byte-identical.

- **Hops:** `N` / `↓` / `Shift+→` next hop, `P` / `↑` / `Shift+←` previous hop. The hop is highlighted and the panel opens.
- **Time:** `←` / `→` seek 0.5 s, `,` / `.` one frame, `Home` / `End`, `Space` play/pause. Pausing selects the hop in progress, and playing clears the selection.
- **Speed:** `1` / `2` / `3` = 0.5x / 1x / 2x, or the speed buttons.
- **Click:** a station, train, line or strip tick to select that hop. Clicking empty map toggles play.
- **Side panel:** service, name/resource, kind, start, duration, self time, status/error, attributes (already redacted), plus parent and child links you can click. Also a placeholder for the expected request/response (contracts not indexed yet).
- **Links:** `#span=<id>` (or `?span=` / `?pin=`) selects a span. `?` shows the shortcut help, and `Esc` closes it or deselects.
- **Tests:** `npm run test:ui` runs the Playwright keyboard and click tests.

## AWS X-Ray traces

- File: pass a BatchGetTraces response or the segment documents straight to build/render (auto-detected as `xray`).
- CLI (headless, **untested live**): `node scripts/fetch.mjs xray <1-xxxxxxxx-… or 32-hex id>` writes `traces/<id>.xray.json`, and `node scripts/fetch.mjs xray --find --filter 'fault = true'` lists candidate ids. Uses the user's AWS CLI credentials; never store keys.
- MCP (interactive): if the AWS Labs CloudWatch Application Signals MCP server is connected, call `get_xray_trace`, save the result to a file, then use the file. Check the saved shape first; it has not been verified live.
- X-Ray samples about 5% of requests by default, so a specific request may have no trace.
