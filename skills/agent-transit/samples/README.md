# Synthetic agent sessions

These JSONL files are hand-built fixtures, not copied from any real `~/.claude`, `~/.codex`, or `~/.cursor` directory. The first marker object identifies the source and says `SYNTHETIC`; it also documents canary strings used by the privacy tests. The payloads intentionally contain prompt, output, file-content, and command-argument canaries so tests prove they never reach HTML by default.
