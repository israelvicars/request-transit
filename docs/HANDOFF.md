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

## M3+M4 ci-transit adapter + skill: done
Codex used 61,666 tokens. Added skills/ci-transit/ (synthetic gh-run sample plus its generator, adapters/normalize-gh.mjs, read-only gh fetch.mjs, SKILL.md, test-gh.mjs), core/adapters.mjs registry, the ci vocab pack, a generalized plugin builder (2 skills), npm build:ci/render:ci/verify:ci, and a ci build in the network test.
Gate failure on the first run: verify:ci timing "1 off". The cause was the skipped deploy-preview job having zero duration, so it never gets a train. Fixed by hand in core/verify.mjs: zero-duration calls are excluded from the timing check and counted in the message. Request verify is unchanged.
After the fix: npm test, verify (MP4 identical), verify:ci, and test:ui all pass. I reviewed the contact sheet and it looks right: one line per job, the failure alert on test (node 22), deploy-preview drawn.
Follow-ups (not blocking): steps render as internal work rather than stations; `needs` dependencies aren't drawn as transfers (every job branches from the root); a skipped job shows as a line with no train.

## M5+M6 agent-transit adapters + skill: done
Codex used 83,748 tokens. Added skills/agent-transit/: claude-code, codex, and EXPERIMENTAL cursor parsers (adapters/normalize-agent.mjs), synthetic samples with generators and SECRET_CANARY markers, find-session.mjs (prints paths only), SKILL.md, test-agent.mjs with privacy tests. Also the agent vocab pack, the --show-args opt-in, npm build:agent/render:agent/verify:agent/build:agent:codex/build:agent:cursor, and an agent build in the network test. Plugin builder now covers 3 skills.
Gate failure on the first run: verify:agent determinism and timing (every frame differed). The cause was `Math.min(...times, Date.now())` in normalize-agent.mjs, which made the build depend on the clock. Fixed by hand. All three sources now build byte-identically twice.
After the fix: npm test passes; verify (MP4 identical), verify:ci, verify:agent, and test:ui all pass. No SECRET_CANARY string appears anywhere in out/. Contact sheet reviewed (one line per tool family, TOOL ERROR and SLOW CALL alerts).
Not verified: the Cursor transcript format. No Cursor agent transcripts exist on this laptop (~/.cursor/projects has no transcripts, ~/.cursor/chats is absent), so the parser is based on an assumed format. The Claude Code and Codex parsers follow the documented or observed public formats but haven't been run against real local logs. No real logs were read.

## Next: M7 (not started)
Update .claude-plugin manifests and keywords for 3 skills, write a suite README with per-skill GIFs, symlinks for ci-transit and agent-transit (~/.claude/skills, ~/.agents/skills -> skills/<name>), then live tests in Claude Code, Codex, and Cursor (Codex needs sandbox permission for Chromium). Blocked on user input: suite name (leaning `subway`) for the README/manifests, and permission to run agent-transit against one real local session (privacy).
