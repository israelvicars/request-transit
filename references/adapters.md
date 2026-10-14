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
| internal | already normalized | validated only |

Full Datadog field mapping is in the comments of `adapters/normalize.mjs`; tests in `scripts/test-normalize.mjs`.

## Backends

| Backend | When | How | Status |
| --- | --- | --- | --- |
| plain file | default, README demo, zero auth | `node scripts/fetch.mjs file trace.json` (or pass the file straight to build) | working |
| Datadog MCP | interactive agent use; access follows the user's own permissions | agent calls the MCP server's trace/span tools, saves the JSON to a file, then uses the file backend. Results pass through model context: costs tokens on big traces | documented, milestone 4 |
| Datadog API keys | headless / CI | `DD_API_KEY`, `DD_APP_KEY` (apm_read), `DD_SITE` in env; `node scripts/fetch.mjs datadog-api <id>` | code from prototype, untested |
| Jaeger / Tempo | later | | not started |

## Privacy

Traces are processed locally; `transit.html` has no network calls (fonts and data are inlined).
`engine/build.mjs` drops attribute keys matching a default PII pattern before rendering
(`DEFAULT_REDACT`), plus any keys passed with `--redact`. Disable the default with `--no-default-redact`.
