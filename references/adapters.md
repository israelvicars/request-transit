# Adapters and fetch backends

Every input becomes one normalized shape (`adapters/normalize.mjs`):

```
{ traceId, meta: { format, source, synthetic, startUnixNs, warnings[] },
  spans: [{ spanId, parentId, service, name, resource?, start, duration, status, kind,
            statusMessage?, peer?, operation?, attrs? }] }
```

`start`/`duration` are ms (start relative to the earliest span); `status` is `ok|error|unset`;
`kind` is `server|client|producer|consumer|internal`; `peer` names an uninstrumented dependency
(db, cache, broker) that becomes a dotted *infrastructure* line.

| Format | Detected from | Notes |
| --- | --- | --- |
| OTLP JSON | `resourceSpans` | `service.name` resource attr; status code 2 = error |
| Datadog tracer/agent span JSON | `[[span]]`, `[span]`, `{traces}`, `{spans}` with `trace_id` | 64-bit ids and ns timestamps kept exact (numbers quoted before parse); `_dd.p.tid` gives the 128-bit id |
| Datadog Spans API v2 | `{data:[{type:"spans"}]}` | `resource_name`, ISO start/end, `custom.duration` |
| PostHog Distributed Tracing | `results`/`spans`/array of objects with `span_id` + `service_name`/`duration_nano` | REST trace endpoint or MCP `apm-trace-get`; hex or base64 (HogQL) ids; all-zero parent = root; `kind` 0-5 and `status_code` 0-2 are OTel enums; ISO timestamps parsed to ns; `hasMore: true` adds a warning |
| internal | already normalized | validated only |

Full Datadog field mapping is in the comments of `adapters/normalize.mjs`; tests in `scripts/test-normalize.mjs`.

## Backends

| Backend | When | How | Status |
| --- | --- | --- | --- |
| plain file | default, README demo, zero auth | `node scripts/fetch.mjs file trace.json` (or pass the file straight to build) | working |
| Datadog MCP | interactive agent use; access follows the user's own permissions | agent calls the MCP server's trace/span tools, saves the JSON to a file, then uses the file backend. Results pass through model context: costs tokens on big traces | documented, milestone 4 |
| Datadog API keys | headless / CI | `DD_API_KEY`, `DD_APP_KEY` (apm_read), `DD_SITE` in env; `node scripts/fetch.mjs datadog-api <id>` | code from prototype, untested |
| PostHog MCP | interactive; OAuth via `https://mcp.posthog.com/mcp` | agent calls `apm-trace-get` (find ids with `query-apm-spans`), follows pages until `hasMore` is false, saves JSON, then the file backend | documented; shape from docs, synthetic sample only |
| PostHog API | headless | `POSTHOG_API_KEY` (personal `phx_` key), `POSTHOG_HOST`, `POSTHOG_PROJECT_ID`; `node scripts/fetch.mjs posthog-api <trace_id>` | written, **untested live** |
| Jaeger / Tempo | later | see `references/more-sources.md` | not started |

## Privacy

Traces are processed locally; `transit.html` has no network calls (fonts and data are inlined).
`engine/build.mjs` drops attribute keys matching a default PII pattern before rendering
(`DEFAULT_REDACT`), plus any keys passed with `--redact`. Disable the default with `--no-default-redact`.
