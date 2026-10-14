---
name: transit
description: Use when the user wants to visualize or share how a request moved through services, from an OpenTelemetry or Datadog trace. Draws the trace as an animated subway map (services are lines, hops are stations, slow and failed calls are service alerts) and can render a frame-exact MP4/GIF.
---

# Transit

A public transit map for your requests. Everything runs locally; no span data leaves the machine.

## Steps

1. **Get the trace into a file.** A plain OTLP JSON or Datadog span JSON file needs no setup.
   For Datadog interactively, use the Datadog MCP server to fetch the trace's spans and save the raw
   JSON to a file; headless, use `node scripts/fetch.mjs datadog-api <trace_id>`. See `references/adapters.md`.
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
