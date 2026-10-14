# Tokku

Tokku is a small mongoose who lives in the bottom right corner of your Windows desktop and helps you stay focused. He notices when you drift to YouTube, Netflix or a game, reminds you to take breaks, names your most urgent Notion task, and tells your phone when you have been away too long.

He observes and suggests. He never closes, blocks, minimises or types into anything. You always stay in control.

Built for the DJXHack "Everyday Magic" challenge by Shubhanshu Sahu.

## What he does

| Situation | What Tokku does |
|---|---|
| You work for 25 minutes | Comes forward, waves, and asks you to take a 5 minute break |
| You open a video site or a game for 45 seconds | Comes on top of it and names the app and your task. One button: "5 more minutes" |
| The 5 minutes are over | Checks his watch and asks you to turn it off |
| You ignore him | Stays with an angry face and asks again. After two ignored nudges he walks to the middle of the screen |
| You close the video or switch to your work | Thumbs up, then he goes back behind your windows |
| You are on a call, your mic or camera is in use, or a work app is full screen | Quiet mode: he turns his back and says nothing |
| You tell him you are eating | He sleeps for an hour and does not nudge, whatever you watch |
| You finish the top task in Notion | He jumps, shows a check mark, and names the next task |
| You are away from the PC for 30 minutes | One message to your phone, with a picture of him peeking in |
| You drag him away | He hangs from the mouse, drops, complains, and walks back. Angrier each time |

Hover over him for two small buttons (take a break, or a meal). Click him to wake him or end a break. Everything else is in the tray icon near the clock.

## How it works

Tokku is two parts that are kept apart on purpose.

**Tokku (the character window).** Draws the character, the speech bubble and the buttons, and decides how to react. It runs in an Electron sandbox with no internet access, no camera, no microphone and no access to files. It only receives simple events such as `{ type: "activity", category: "video", app: "YouTube" }`.

**Guard (the background part).** The only part with system access. Once a second it looks at the window in front, turns its title into a category (video, game, meeting, work, other) and throws the title away. It also reads idle time, screen lock, and whether the mic or camera is in use (a yes or no flag from Windows; it never opens them). It is the only part allowed to use the network, and only for two addresses: `api.notion.com` (read only) and `ntfy.sh` (fixed phone messages).

A fuller description of what triggers what is in [docs/user-flow.md](docs/user-flow.md).

## Privacy

- Window titles are classified and discarded. They are never stored or sent.
- Phone messages contain fixed text only: no app names, no task names.
- The Notion token, the phone topics and the cached task names are stored encrypted with Windows data protection (Electron `safeStorage`) in your Windows user folder. They are never in this repository.
- The partner PIN is stored only as a salted scrypt hash.

**Honest limit:** the sandbox limits what Tokku's code can do. It is not a lock against you. You own the PC, so Task Manager can always end it. Tokku is a commitment device, not security software.

## Try it

**In the browser:** https://subhcool238.github.io/tokku/demo/ (the real character and behaviour, with the desktop sensing replaced by buttons).

**On Windows without installing anything:** download `Tokku-Windows.zip` from the latest release or build it with `npm run package`, unzip it, and double click `Tokku.exe`. Windows may say "Windows protected your PC" because the app is not signed: click More info, then Run anyway.

## Run it from source

Requirements: Windows 10 or 11, and [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
```

```bash
npm start
```

Or double click `Start Tokku.bat` after `npm install`. To close him, use the tray icon and choose "Turn Tokku off".

To start him with Windows, tick "Start with Windows" in the tray menu.

## Set up the optional parts

**Notion.** Tray, "Notion: connect my tasks". Create an integration at notion.so/my-integrations with read access, share your tasks database with it, then paste the token and the database link. Tokku expects a title column, a date column called Due and a status column called Kanban Status with a value Done, and adapts to other names where he can.

**Phone.** Tray, "Phone link", "Set up". Install the free ntfy app on your phone and subscribe to the private topic Tokku shows you.

**Partner PIN.** Tray, "Partner PIN: set up". A friend or family member chooses a PIN. After that, turning Tokku off needs the PIN. An emergency exit is always available: hold a button for 30 seconds and give a reason.

**Demo mode.** Tray, "More", "Demo mode". Short timers for recording or trying things out. It is off every time Tokku starts.

## Technology

| Part | Technology |
|---|---|
| Desktop app | [Electron](https://www.electronjs.org) 44 (Chromium and Node.js) |
| Languages | JavaScript, HTML and CSS for the app. Python for the art tools |
| Character | Plain HTML canvas, no game engine and no animation library. Own engine in `tokku-character.js` |
| Behaviour | Own state machine in `tokku-brain.js`, no dependencies, covered by automated tests |
| Front window detection | [`get-windows`](https://github.com/sindresorhus/get-windows) |
| Mic and camera in use | Read only query of the Windows privacy registry |
| Notion and phone | Node.js `https`, limited to `api.notion.com` and `ntfy.sh`. Phone delivery by [ntfy](https://ntfy.sh) |
| Secrets | Electron `safeStorage` (Windows DPAPI), Node.js `crypto.scrypt` for the PIN |
| Art tools | Python 3.12 with Pillow, NumPy, OpenCV and rembg. They cut the sprite sheets into frames and build `character.json` |

No AI model runs inside the app. All of his lines are scripted.

## Project layout

```
src/main/            Guard: window, tray, sensing, Notion, phone, PIN
src/renderer/        Tokku: character window, bubble, hover buttons, settings pages
src/renderer/character/   engine, brain, tests, and the cut sprite frames
art/sheets/          the original sprite sheets
art/sheet-map.json   what every frame on every sheet is
tools/               Python scripts that turn the sheets into frames
art/review/          review page with a button for every animation
docs/                build brief and user flow
```

## Tests

```bash
npm test
```

Runs the behaviour tests (focus, breaks, meals, Quiet mode, distraction flow) and the asset tests (every frame exists, is transparent, and stands on its feet line).

To see every animation, open `art/review/sequences.html` in a browser.

## What is real and what is concept

Working: everything in the table above, on Windows.

Not built: a privacy panel showing what Tokku saw today, an installer, voice and lip sync, and a phone app. Detecting distracting apps on the phone, and Tokku peeking into the phone screen, are concept only.

Known limits: some games in exclusive full screen can hide him. If Windows sleeps before 30 minutes of idle time, the away message cannot be sent.

## Credits

- Code written with Claude Code (Anthropic).
- All character sprite sheets made with an AI image generator, directed and selected by Shubhanshu Sahu.
- Phone notifications are delivered by the open source service ntfy.
