# Collaboration rules

- Implement the user's task with the smallest complete change.
- Treat Gemini's proposals as review input. Confirm findings with code or tests; explain disagreements.
- Run meaningful tests and report commands, results, and anything unverified.
- Never claim review approval proves correctness.
- Do not edit automation control files during automated tasks: `.github/`, `approval/`, `scripts/cowork*.mjs`, `.gitignore`, `package.json`, `open-approval.cmd`, and this file.
- All changes require a new OTP approval. Never downgrade this policy or access `.approval-local/`.
- Do not commit, push, merge, publish, or access secrets during automated tasks.
