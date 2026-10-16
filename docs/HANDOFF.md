# Suite handoff log

Branch `suite` (local only, never pushed). Plan: docs/SUITE_PLAN.md. Baseline: docs/suite-baseline.md.
Pattern: Codex writes code with `codex exec --full-auto "<prompt>" </dev/null` (no git, `npm test` only; its sandbox blocks Chromium). The reviewer then runs `npm test`, `npm run verify`, `npm run test:ui` and the MP4 sha256 check outside Codex, and commits.
Gates: the OTel MP4 sha256 must stay `223590ce6b1a30497d4ae0f3dae860fbaca1c45cd291f450a8fa091c4c2f45ff`. The out/ui/*.png screenshots must match the pre-change commit (compare with git stash).
Laptop: PATH=/opt/homebrew/bin:$PATH, no rg.

## M0 baseline: done (3cae93f)
All tests pass; hashes recorded.

## M1 extract core/: done (d1e7c47)
Codex used 113,788 tokens. Moved files to core/ and skills/request-transit/. MP4 identical, all tests pass. Fixes after Codex: repointed ~/.claude/skills and ~/.agents/skills symlinks to skills/request-transit, and fixed stale engine/ paths in design-system.md. Codex can't `git mv` (sandbox), so it moved files on disk and git still detected the renames.

## M2 vocab packs: done
Codex used 95,449 tokens. Added core/vocab.mjs (request, plus ci and agent stubs), the `--vocab` flag, the template reading copy from VIZ_OPTS.vocab, and core/test-vocab.mjs in npm test. Gate failure on the first run: test:ui "valkey hop: infrastructure" failed because Codex had lowercased the "Infrastructure hop" card title. Fixed by hand with an `infrastructureHopTitle` key. After the fix: MP4 identical, all tests pass, 6 UI screenshots identical to the pre-change commit.
