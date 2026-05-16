# Codex Rules

- Use `jj` for version-control operations in this repository.
- When the user asks to push completed work, push the completed change to `master` unless they explicitly name another branch.
- Do not create or push `codex/*` branches unless the user explicitly asks for a feature branch or pull-request branch.
- Do not run `npm publish` for real releases. The user publishes npm packages manually. Codex may run `npm publish --dry-run`, prepare tags/GitHub releases when asked, and verify the published package after the user confirms publishing is complete.
