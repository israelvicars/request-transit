# Contract extractors (planned, milestone 3)

Not built yet; today every non-infrastructure hop is labeled "unmatched (contracts not indexed)".

Plan, from lessons on an internal predecessor:
- Pluggable extractors: Express + Joi, Zod, TypeScript types, NestJS + class-validator DTOs, protobuf;
  then Pydantic/FastAPI and OpenAPI import. Each entry records source file/line, extractor kind, confidence.
- Request shapes come mostly from validators; response shapes often only from types/DTOs. Show gaps, don't guess.
- Resolve schema imports across shared packages, or coverage looks far worse than reality.
- Match on `service + resource`; normalize path params; `/api/vN` prefixes optional.
- Queue consumers: link schema to topic through the handler's event switch, else fall back to the producer's shape at medium confidence.
- DB/cache/broker spans are infrastructure hops, not misses.
- Output is deterministic (stable key order, no timestamps), cached by commit in `.transit-cache/`, never committed.
- Contract diff (story 3) by route behind `--baseline`; migrations need an explicit old-to-new route map.
