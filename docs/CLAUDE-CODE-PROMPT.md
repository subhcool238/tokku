# First prompt for Claude Code (paste everything below the line)

---

Hi. We are building Tokku, a small mongoose desktop companion for Windows, for the DJXHack "Everyday Magic" challenge. The demo video is recorded on Tue 13 Oct and I submit on Wed 14 Oct, so we have about two days.

Please do this in order:

1. Read `CLAUDE.md`, then read `docs/tokku-build-brief-v6.md` completely. Also look at `art/sheet-map.json`, open two or three sheets in `art/sheets/`, and look at the code in `src/renderer/character/` (engine, brain, tests).

2. Before writing any code, reply with:
   - a short summary of what you understood, in 6 to 10 bullet points,
   - a check of my machine: versions of Node.js, npm, Git and Python (tell me what is missing and how to install it, but do not install anything globally yourself),
   - the run of the existing tests: `node src/renderer/character/tests/brain.test.js` (all 44 should pass),
   - any question where the brief is unclear or conflicts with itself. Keep questions to the minimum.

3. Then start with Phase 0 and Phase 1A from section 11. Phase 1A is the sprite pipeline: cut the 21 sheets into clean single frames using `art/sheet-map.json`, remove the white background, the shadows and the drawn marks, mirror and derive the frames listed, match colour and head size, set the baseline, export to `src/renderer/character/assets/v3/`, update `character.json`, and build `art/review/contact-sheet.png`.

4. STOP after Phase 1A. Tell me to open the contact sheet, and list every frame you are not sure about (halo, cut tail, leftover mark, wrong size). Wait for my approval before Phase 1B.

Working style for the whole project:
- Explain each step in plain language before you do it. I cannot debug code.
- Test everything yourself and tell me exactly what I should see.
- Commit to git after each phase.
- Never put my Notion token, ntfy topic or PIN in code or git.
- If something will not work on Windows, tell me plainly and give me the simplest alternative.
- Follow the [DEMO] and [LATER] priorities. If we are behind schedule, use the cut order in section 15.
