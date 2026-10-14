# Config (planned, milestone 3)

Story 2a needs no config. The contract layer will read a small optional `transit.config.json`:

```json
{
  "services": { "checkout": { "repo": "../checkout", "routePrefix": "/api/v1" } },
  "infra": ["valkey-cart", "kafka", "postgres"],
  "redact": ["app.user.id"]
}
```

- `services`: service name (as in spans) to a local repo path, plus optional route prefix.
- `infra`: names always shown as infrastructure hops, never as contract misses.
- `redact`: extra attribute keys removed before rendering.
Nothing system-specific lives in `engine/`.
