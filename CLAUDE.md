# Tokku project rules (read every session)

The full spec is `docs/tokku-build-brief-v6.md`. Read it before any work. When the brief and this file disagree, ask me.

## About me
- I have technical knowledge but I cannot write or debug code. Explain each step in plain language before doing it, then tell me exactly what I should see on screen.
- Run and test everything yourself. Do not hand me broken code to fix.

## Rules
1. Work phase by phase in the order of section 11. Commit to git after each phase with a clear message.
2. Ask me before installing anything globally or changing anything outside this project folder.
3. Never put secrets (Notion token, ntfy topic, partner PIN) in code, logs or git. Use a local settings file in `.gitignore` and Electron `safeStorage`.
4. The sandbox and privacy rules in section 2 are non-negotiable.
5. Tokku observes and suggests. He never closes, blocks, minimises or types into anything.
6. Keep the existing engine (`tokku-character.js`) and brain (`tokku-brain.js`) and extend them. Do not rewrite them from scratch. Keep `node src/renderer/character/tests/brain.test.js` passing.
7. Stop at every **STOP** in the brief and wait for my approval.
8. When something will not work, tell me plainly and offer the simplest alternative.
9. In all text you write for the app, README and commits: no em dash characters. Use commas, colons or full stops.
10. At the end of every session, update the status table in section 14 of the brief and tell me what is next.
