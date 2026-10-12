# Tokku: Build Brief for Claude Code (v6)

Owner: Shubhanshu Sahu
Platform: Windows PC (RTX 5060 12 GB, 32 GB RAM)
Purpose: DJXHack "Everyday Magic" entry (demo video recorded Tue 13 Oct 2026, submission Wed 14 Oct 2026), then a portfolio AX project.
Version note: v6 replaces v5. Changes: new character art (art v3, 21 sprite sheets in `art/sheets/`, mapped in `art/sheet-map.json`), a sprite pipeline phase (1A) with a review stop, frame sequences for every action (section 9.4), new character methods for dragging, welcome back, surprise and pointing at a task, a Demo mode, and [DEMO] / [LATER] priority marks on every phase. Sections 1 to 8 and 10 are unchanged.

## 0. Project folder layout (already in place when you start)
```
tokku/
  CLAUDE.md                       short rules, read every session
  docs/tokku-build-brief-v6.md    this file
  art/tokku-reference.png         character reference
  art/sheets/S01..S20 + S08B      the 21 sprite sheets
  art/sheet-map.json              what every frame is and how to fix it
  src/renderer/character/         working engine, brain, old assets, tests
  reference/                      prototype test page and clip (how it should feel)
  tools/                          empty, for the sprite pipeline
```

---

## 1. What we are building (read this first, Claude Code)

Tokku is a small, original 2.5D mongoose character (sprite views plus code animation), male, who lives in the **top right corner of my Windows desktop**. He helps me stay focused.

- **He is not always on top.** He sits at normal desktop level in the top right corner. When I work, my windows can cover him. I use my full screen for work and nothing should float over it.
- **He comes to the front only when needed:**
  1. I open YouTube, Netflix, Hotstar, Prime Video or a game. He comes forward, sits on top of that window, and shows my most urgent real task from Notion.
  2. I have worked for 25 minutes without a break. He comes forward and asks me to take a 5 minute break (Pomodoro).
- **He never comes forward in Quiet mode:** during a call or interview, while my mic or camera is in use, in full screen work apps, or when I switch Interview mode on (section 5.6).
- I can bargain for a short break ("5 more minutes"). He starts a timer and comes back when it ends.
- If I drag him away, he walks back to his corner, a little more annoyed each time.
- I can tell him I am going for breakfast, lunch or dinner. He pauses for 1 hour.
- If my computer is idle or locked for more than 30 minutes (and I am not on a meal break), my phone gets one notification.
- When I finish a task in Notion, he celebrates and shows the next one.
- All lines are scripted English lines from a local file, including the phone notification. No AI model, no paid API.

**Core design principle: Tokku observes and suggests. He never acts.**
He cannot close, block, minimise or type into anything. I always stay in control.

**About me as the user of this brief:** I have technical knowledge, but I cannot write or debug code. Please:
1. Explain each step in plain language before you do it.
2. Run and test everything yourself, then tell me what I should see on screen.
3. Ask me before installing anything globally or changing anything outside this project folder.
4. Commit to git after each phase with a clear message.
5. Never put secrets (Notion token, ntfy topic, PIN) in code or git. Use a local settings file that is in .gitignore.

---

## 2. The sandbox and privacy model (non-negotiable)

Tokku is split into two parts. This is the main thing the jury will ask about.

### Part A: "Tokku" (the character, the renderer process)
- Runs in an Electron window with `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`.
- Strict Content Security Policy: `default-src 'self'`. Loads nothing from the internet.
- All network requests from this window are cancelled (`session.webRequest.onBeforeRequest` blocks every non-local URL).
- Camera, microphone, screen capture and all other permission requests are denied (`session.setPermissionRequestHandler` returns false).
- Receives only simple events through a narrow preload bridge, for example:
  `{ type: "distraction", category: "video", app: "YouTube", minutes: 3 }`
  `{ type: "breakDue", workedMinutes: 25 }`
  `{ type: "quiet", on: true }`
  `{ type: "away", minutes: 31 }`
  `{ type: "topTask", title: "...", due: "2026-10-14" }`
- Can only send back: `bargain(minutes)`, `backToWork()`, `startBreak()`, `mealBreak(meal)`, `dragged()`, `requestQuit()`.

### Part B: "Guard" (the main process, the only part with system access)
- Polls the active window title every 3 seconds.
- Classifies the title locally into a category (video, game, meeting, work, other) using simple rules, then **immediately discards the raw title**. Video, game and meeting names are never stored or sent.
- Reads system idle time and lock, unlock, sleep and resume events.
- Checks **whether** the mic or camera is in use by any app (Windows privacy registry, read-only, section 5.6). It never accesses the mic or camera itself and never hears or sees anything.
- Is the only part allowed to use the network, through an allowlist:
  - `https://api.notion.com` (read-only, query tasks)
  - `https://ntfy.sh` (short fixed-template phone messages)
  - Everything else is refused.
- Never sends activity details off the PC. Phone messages contain only fixed text.

### What Tokku can never do
| Never | How it is enforced |
|---|---|
| Close, block or minimise apps | No code path exists for it |
| Read screen, files, browser content or history | Only window titles, discarded after classification |
| Use camera or microphone | Permission handler denies all; Guard only reads an "in use: yes or no" flag |
| Send data anywhere else | Network allowlist in Guard; renderer has no network |
| Keep data forever | Local daily log of minutes per category only, auto-deleted after 7 days, deletable any time |

### Secrets
- Notion token and ntfy topics are stored with Electron `safeStorage` (Windows DPAPI encryption).
- ntfy topics must be long random strings (anyone who knows a topic name can read it).
- The partner PIN is stored only as a salted hash using Node's built-in `crypto.scrypt`.

### Honest limitation (say this in the README too)
The sandbox limits what Tokku's code can do. It is not a lock against me. I own the PC, so Task Manager can always end it. Tokku is a commitment device, not security software.

---

## 3. Window placement (important)

- Tokku's window: transparent, frameless, about 240 x 300 px (taller, for the bigger tail), `skipTaskbar: true`, `focusable: false`.
- **Home position:** top right corner of the primary screen, with a small margin.
- **Default level: NOT always on top.** Other windows cover him normally.
- Click-through everywhere except the character (`setIgnoreMouseEvents(true, { forward: true })`, switched off while the mouse is over him).
- **Coming forward** (distraction or break reminder, only when Quiet mode is off):
  1. `setAlwaysOnTop(true, "screen-saver")`.
  2. Show with `showInactive()` so he never steals keyboard focus while I type.
  3. Move to sit on the top edge of the active window (from the window-title library's bounds). If bounds fail, appear near the top right of the screen.
- **Going back** (after I respond or the situation ends): walk back to the top right corner, then `setAlwaysOnTop(false)`.
- Known limit: some games running in exclusive full screen may hide him. Borderless and browser full screen should work. Test with Netflix in browser full screen (F11).

---

## 4. The off switch: partner PIN

1. First run: a friend or family member types a 4 to 6 digit PIN. I never see it. Stored as a hash.
2. Tray menu > "Turn Tokku off" asks for the PIN.
3. "Ask for unlock" sends my partner a phone ping via ntfy (partner subscribes to a second topic): "Sanky wants to turn Tokku off."
4. **Emergency exit, always available:** hold a button for 30 seconds, then type a reason. Tokku closes and the reason is saved to the local log.
5. "Pause 15 min" in the tray needs no PIN, max 2 times per hour.
6. The partner can only unlock. They never see what I was doing.

---

## 5. Behaviour rules

### 5.1 Distraction
| State | Trigger | Tokku does |
|---|---|---|
| Rest | Working normally | Sits in the top right corner (usually behind my windows), slow breathing, blinks, slow tail sway |
| Notice | Video or game active for 20 seconds | (No visible change yet, he is behind windows) |
| Nudge 1 | Still active at 45 seconds | Comes forward onto that window, shows top Notion task and a gentle line. Buttons: "5 more minutes" and "Back to work" |
| Bargain | "5 more minutes" | Line from `bargain_granted`, timer on his sign, goes back to his corner |
| Nudge 2 | Timer ends, still on video or game | Comes forward with a firmer line from `bargain_over` |
| Nudge 3 | Third nudge in 30 minutes | Strongest line from `nudge_firm`, `annoyed(3)` pose |
| Dragged | I drag him away | Walks back to his corner after 5 seconds, `dragged_away` line, annoyance level +1 (resets each hour) |
| Late night | After 11:30 pm on video or game | Uses `late_night` lines |

Video and game list (window title match, case-insensitive, editable in settings): youtube, netflix, hotstar, jiohotstar, prime video, primevideo, steam, epic games. I can add game names myself.

### 5.2 Pomodoro break reminder
- "Active" means my idle time is under 60 seconds.
- After **25 minutes** of continuous active time (configurable 25 to 30), he comes forward with a `break_due` line. Buttons: "Start 5 min break" and "Remind me in 5 min".
- A break counts if: I press "Start 5 min break", or idle for 5+ minutes, or lock the screen for 5+ minutes. Then the 25 minute counter resets.
- "Remind me in 5 min" can be used at most twice in a row.
- No break reminder while I am already on a video or game (the distraction flow handles that), during a meal break, in Do not disturb, or in Quiet mode.

### 5.3 Meal breaks
- Click Tokku or use the tray: "Breakfast", "Lunch", "Dinner".
- Each gives **1 hour**: no nudges, no break reminders, no phone pings. Watching something while eating is fine.
- Each meal can be used once per day. A `meal_start` line when it starts and a `meal_over` line when it ends.

### 5.4 Away and phone ping
- Away = idle for 30+ minutes, or screen locked for 30+ minutes.
- Send **one** phone ping per away session, from `phone_away` (English).
- No ping during a meal break, Do not disturb, Pause or Quiet mode.
- When I return: `welcome_back` line.

### 5.5 Task done
- A Notion task moves to Done: `celebrate()` (jump, check mark, proud), `task_done` line, shows next task.

### 5.6 Quiet mode (calls, interviews, full screen)
Tokku must never pop up during an interview, a call or a presentation. Quiet mode turns on automatically when **any** of these is true:

| Signal | How Guard detects it |
|---|---|
| Meeting app in front | Window title matches: "zoom meeting", "meet -" (Google Meet), "microsoft teams", "webex", "skype", "discord" call windows. List editable in settings. |
| Mic or camera in use by any app | Read-only check of the Windows privacy registry (`HKCU\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone` and `\webcam`, sub-keys where `LastUsedTimeStop` is 0 means "in use now"). This is the same data that shows the mic icon in the taskbar. Tokku reads only yes or no. |
| Full screen work app | The foreground window covers the whole screen and is NOT in the video or game list (for example PowerPoint slideshow, full screen Figma, full screen browser on a work site). |
| Interview mode (manual) | Tray toggle "Interview mode" or the shortcut `Ctrl + Alt + Q`. Lasts 1 hour or until I switch it off. |

**In Quiet mode:** no coming forward, no break reminders, no phone pings, no sounds. Tokku stays behind windows, turns his back (`faceAway()`), dims, and shows a small "shh" icon on himself. Anything he wanted to say waits, and he gives one short summary line after Quiet mode ends (`quiet_over`).

**Full screen video:** by default, full screen Netflix or YouTube still gets a nudge, because that is the main distraction case. A setting "Never interrupt any full screen" (off by default) makes all full screen quiet.

**Honest limit:** Windows does not reliably tell apps when the screen is being shared. The mic or camera check plus Interview mode cover this. Before an interview, I switch Interview mode on to be safe.

---

## 6. Sleep, lock, shutdown and offline behaviour

| Situation | What Tokku does |
|---|---|
| Screen locked (Win + L) | Keeps running. Treats it as away. After 30 min locked, sends the phone ping. |
| Sleep | Windows pauses all apps, so Tokku pauses too. No ping can be sent while asleep. On wake, he reads how long I was gone (`powerMonitor` resume event) and shows `welcome_back`. |
| Shut down | Tokku is not running, so nothing is tracked or sent. Start Tokku automatically at Windows login (setting, on by default). |
| No internet | Everything local still works: window detection, Quiet mode, nudges, Pomodoro, meal breaks. Notion uses the last saved task list. Phone pings cannot be sent; a missed ping is dropped (a late ping is useless). A small offline dot shows on his sign. |

Note for me: if Windows is set to sleep after less than 30 minutes, the away ping will never fire. Set sleep to 45 minutes or more.

---

## 7. Notion (read-only)

- Use `@notionhq/client`.
- Internal integration with **read content only** capability, shared only with my "All Tasks" database.
- Query open tasks: "Kanban Status" is not "Done", sorted by "Due" ascending, then "Priority".
- Property names: `Task` (title), `Due` (date), `Kanban Status` (select), `Priority` (select).
- Poll every 5 minutes and cache the result locally for offline use.
- If Notion fails: use the line "You know what is pending today." instead of a task.

## 8. Phone pings (ntfy, free)

- HTTPS POST to `https://ntfy.sh/<my-random-topic>`.
- Fixed English templates only. Max one away ping per away session.
- I install the free ntfy app on my phone and subscribe to my topic.

---

## 9. Character: Tokku the mongoose (2.5D sprites, art v3)

**Reference:** `art/tokku-reference.png`. The design is final.

- Male, original design. Not a copy of any film character.
- Slim upright mongoose (meerkat-style, part of the mongoose family), warm orange-brown fur, cream face, dark eye patches, big amber eyes, small round ears, friendly smile.
- **Personality:** a small, loyal guardian who protects me from "snakes" (distractions). Teases, never insults. Never shouts.
- **Prop (later):** a small chalk slate (patti) drawn by code in the speech bubble area, not part of the sprites.

### 9.1 What is already built (use it, do not redo it)
`src/renderer/character/` already contains working code from the prototype:

| File | What it is |
|---|---|
| `assets/character.json` | Describes every sprite: turn ring, idle rig, poses, anchors, pivots, per-pose `scale` |
| `assets/rig/` | The front idle split into layers: `body`, `tail`, `ear_l`, `ear_r`, plus overlays `blink_half`, `blink_closed`, `mouth_open`. **Keep this as the main idle.** |
| `assets/ring/`, `assets/poses/` | Old art (12 turn views, 23 poses). Will be replaced by art v3 in Phase 1A. Do not delete until art v3 is approved: move to `assets/_old/` |
| `tokku-character.js` | Engine v2 (class `TokkuCharacter`). No dependencies |
| `tokku-brain.js` | State machine (class `TokkuBrain`): Pomodoro, meals, Quiet mode, dialogue, voice. No dependencies |
| `tests/brain.test.js` | 44 automated checks. Run `node src/renderer/character/tests/brain.test.js` |
| `reference/tokku-motion-test-v2.html` | Open in a browser to see how the prototype feels (buttons for every action) |
| `reference/tokku-motion-test-v3.mp4` | Recorded clip of the prototype |

### 9.2 How the character moves (engine v2, keep these rules)
- **Idle rig:** the body stays still. Only the eyes blink (every 2 to 6 seconds, sometimes a double blink), the ears twitch, the tail sways by mood, and the mouth flaps while a line is typing. Breathing is a very small vertical scale from the feet.
- **Every change of picture is a short crossfade plus a small squash**, so nothing pops.
- **Size consistency:** every frame has a `scale` in `character.json` so his head never changes size. Do not remove it.
- **Walking:** speed eases in and out. The walk frame changes by distance travelled, not by time, so the feet do not slide.
- **Tail limit:** the tail layer may only rotate between -2 and +24 degrees. The engine clamps it.
- All actions can be cancelled. Starting a new action stops the old one cleanly.

### 9.3 Art v3: the new sprite sheets
21 sheets are in `art/sheets/` (4 frames each, in one row, white background, captions and a title baked in). The exact use of every frame is in **`art/sheet-map.json`**. Summary:

| Sheet | Frames used | Fixes needed |
|---|---|---|
| S01 Walk A | walk_1 to walk_4 | none |
| S02 Walk B | walk_5 to walk_8 | drawn facing left: mirror all 4 |
| S03 Walk start and stop | walk_start_lean, walk_start_step, walk_stop_slow, side_idle | none |
| S04 Turn A | turn_000, 030, 060, 090 | mirror turn_000 only (tail on the wrong side) |
| S05 Turn B | turn_120, 150, 180 | frame 4 is wrong: drop it. Make turn_210 to turn_330 by mirroring 150, 120, 090, 060, 030 |
| S06 Sit to sleep | sleepy_stand, yawn_sit, drowsy_sit, sleep_curl | none |
| S07 Sleep loop | breathe in, breathe out, ear twitch, tail curl | remove drawn arcs in frame 3 |
| S08 Wake up | wake_lying, stretch_up, awake_front | frame 1 duplicates sleep_curl: skip |
| S08B Wake in-betweens | wake_ear_lift, wake_peek, wake_yawn_lying, wake_sit_rub | more saturated colour: colour-match; remove drawn lines |
| S09 Attention | notice, lean_wave, wave_hello, paw_stop | remove the drawn "!" |
| S10 Bargain | plead, hopeful, accept_thumbs, sulk | none |
| S11 Surprise | surprise_neutral, start, strong, recover | remove drawn marks |
| S12 Joy | joy_excited, joy_cheer_leg, joy_jump, joy_wink_thumbs | joy_jump is airborne: keep its height |
| S13 Investigate | inspect_low, think_chin, found_point | skip the magnifying glass frame |
| S14 Task done | done_thumbs, done_cheer, done_checkmark, done_proud | keep the green check mark prop |
| S15 Annoyed | annoyed_mild, annoyed_question, annoyed_angry | skip frame 4 (shouting is off-character) |
| S16 Dragged | drag_grab, drag_hang, drag_land, drag_sit | frames 1 and 2 are airborne |
| S17 Quiet | quiet_back_sit, quiet_rest_curl | skip frames 3 and 4 (a wall is baked in) |
| S18 Break | break_stretch, break_yawn, break_sit_relaxed, break_lie_rest | remove drawn lines |
| S19 Away | away_look_away, away_check_time, away_pace, away_sigh | remove drawn puff cloud and arcs |
| S20 Mouth shapes | none | skip the whole sheet (heads tilted, do not fit the idle) |

**Known art differences (be honest about them in the review):**
1. S01 to S08 draw a slimmer body with a longer neck. S09 to S19 draw a bigger head and a chunkier body. Head size can be matched; body shape cannot. Crossfades between the two groups will show a small change.
2. S08B and S16 to S19 are more saturated orange. Colour-match them to S01.
3. Figures are about 450 px tall. That is fine for the 230 px on-screen size.

### 9.4 Sequences (how the frames are played)
Add a `sequences` block to `character.json` and a `play(name)` method to the engine. Each sequence is a list of frames with a duration in ms. Keep the existing public method names so `tokku-brain.js` keeps working; only their insides change.

| Engine method (existing name) | Frames in order | Notes |
|---|---|---|
| `walkTo(x)` | walk_start_lean, walk_start_step, then walk_1 to walk_8 looped by distance, then walk_stop_slow, side_idle, then turn back to the front | Walking left = mirror. Before walking, turn with turn_000 to turn_090 (about 70 ms per frame) |
| `turnTo(yaw)` | the turn frames between the current and the target angle | 12 views, 30 degrees apart |
| `attention()` | notice, lean_wave, wave_hello, then hold paw_stop while the bubble with buttons is open | |
| `plead()` | plead (hold), then hopeful | used when a reminder is ignored |
| new `accept()` | accept_thumbs (1 s), then idle | when I press "Five more minutes" |
| new `sulk()` | sulk (1.5 s), then idle | when I press "Back to work" after he scolded me |
| `rest()` (Pomodoro break) | break_stretch, break_yawn, break_sit_relaxed (hold); after 60 s break_lie_rest (hold) | |
| `stretchUp()` (break over) | break_stretch, awake_front, idle rig | |
| `sleep()` (meal break) | sleepy_stand, yawn_sit, drowsy_sit, sleep_curl, then loop: breathe_in, breathe_out (about 1.6 s each), sometimes ear_twitch or tail_curl | |
| `wake()` | wake_ear_lift, wake_peek, wake_yawn_lying, wake_lying, wake_sit_rub, stretch_up, awake_front, idle rig | about 4 s in total |
| `celebrate()` (task done) | joy_excited, joy_jump (with a small hop), done_checkmark (hold 1.2 s), done_proud, idle rig | |
| `annoyed(level)` | level 1: annoyed_mild. Level 2: annoyed_question. Level 3: annoyed_angry | use the drag count or nudge count as the level |
| new `dragStart()` / `dragMove(vx)` / `dragEnd()` | drag_grab, then drag_hang while dragging (sway a few degrees with mouse speed), then on release drag_land, drag_sit | then the brain makes him walk home |
| `faceAway()` (Quiet mode) | turn to turn_180, then quiet_back_sit, dimmed to 55% | |
| `faceBack()` | quiet_back_sit, turn_180, turn back to the front, idle rig | |
| new `welcomeBack()` | away_check_time, away_sigh, joy_excited, idle rig | when I return after being away |
| new `surprise()` | surprise_start, surprise_strong, surprise_recover | when a task due today appears in Notion for the first time |
| new `pointAtTask()` | found_point (hold while the task bubble shows) | when he shows my top task |
| idle variety (not while focusing) | every 40 to 90 s, one of: think_chin, inspect_low, a glance via turn_030 and back | never during focus or Quiet mode |

Frame durations are a starting point. Tune them by eye in the review page.

### 9.5 Lip sync
Keep the existing 2-frame mouth flap on the front idle. S20 is not used. Real lip sync (Rhubarb) is a later portfolio upgrade.

---
## 10. Scripted lines (save as `lines.json`, pick randomly, never the same line twice in a row)

Placeholders: `{app}`, `{task}`, `{due}`, `{time}`, `{minutes}`, `{meal}`, `{count}`.

```json
{
  "first_open_today": [
    "Morning. Three things on the list today. Shall we?",
    "I'm here. Coffee done? Good. Let's go."
  ],
  "nudge_gentle": [
    "{app}? Really? {task} is still waiting.",
    "Last time 'one episode' turned into three. I was there.",
    "I'll just sit here until {task} is done. No pressure."
  ],
  "bargain_granted": [
    "Fine. Five minutes. I'm counting.",
    "Five minutes, then we're back. Deal?"
  ],
  "bargain_over": [
    "Time's up. {task}, please.",
    "I kept my promise. Your turn."
  ],
  "nudge_firm": [
    "Third time. Even my tail is annoyed now.",
    "{task} is due {due}. {app} will still be here tomorrow."
  ],
  "dragged_away": [
    "Moving me won't finish the work.",
    "I'm back. Mongooses are very stubborn."
  ],
  "break_due": [
    "25 minutes straight. Stand up, stretch, drink water. 5 minutes.",
    "You haven't taken a break. Please take a 5 minute break.",
    "Your eyes need a break. Look outside for a bit."
  ],
  "break_over": [
    "Break's over. Fresh start.",
    "Back at it. You've got this."
  ],
  "meal_start": [
    "Enjoy your {meal}. See you in an hour.",
    "Go eat. I'll guard the desk."
  ],
  "meal_over": [
    "Hope that was good. Back to it?",
    "{meal} done. Let's finish strong."
  ],
  "welcome_back": [
    "Welcome back. Let's pick up where we left off.",
    "There you are. {task} missed you."
  ],
  "task_done": [
    "Yes! {task} is done. Next one?",
    "One down. Celebrate later, next task now."
  ],
  "late_night": [
    "{app} at {time}? Tomorrow-you will not be happy.",
    "Sleep or work. There's no third option."
  ],
  "quiet_over": [
    "That looked important. I stayed quiet. Ready when you are.",
    "All done? I saved my lectures for later."
  ],
  "quit_request": [
    "You want me gone? Ask your partner for the PIN.",
    "Okay. But {task} is still pending."
  ],
  "phone_away": [
    "Your computer has been off for {minutes} minutes.",
    "Your computer has been off for {minutes} minutes. {count} tasks are waiting."
  ],
  "phone_unlock_request": [
    "Sanky wants to turn Tokku off. Share the PIN only if you agree."
  ]
}
```

---
## 11. Build phases (in order, test each, commit after each)

Priority marks: **[DEMO]** must work for the video on Tue 13 Oct. **[LATER]** do only if time is left, otherwise show it as concept.

### Phase 0: Setup [DEMO]
- Electron (with Vite if simpler), plain HTML canvas (no three.js), `get-windows`, `@notionhq/client`, `electron-builder`.
- `git init`, `.gitignore`: node_modules, settings file, logs, dist, `tools/.venv`, `art/out/`.
- **Test:** `npm start` opens a window. Tell me what I should see.

### Phase 1A: Sprite pipeline (art v3) [DEMO]
Goal: turn the 21 sheets in `art/sheets/` into clean single-frame PNGs the engine can use. Write it as one Python script `tools/cut_sprites.py` that reads `art/sheet-map.json`, so it can be re-run when I replace a sheet.

1. Python environment: create `tools/.venv` (ask me first if Python is missing). Packages: `rembg` (with `onnxruntime`, or `onnxruntime-gpu` if it installs cleanly for my RTX 5060), `pillow`, `numpy`, `scipy`, `opencv-python`.
2. **Split:** each sheet has 4 equal columns. Find the title band at the top and the caption band at the bottom (rows with grey text, circled numbers and thin divider lines) and crop them away. Keep the full tail and feet.
3. **Remove background:** rembg on each cell. Try the models `isnet-general-use` and `u2net`, pick the one with cleaner fur edges on S01 and S06, and use it for all. Then remove the soft floor shadow (low-alpha pixels below the feet).
4. **Remove drawn marks:** keep the largest connected shape plus anything touching it (tail, props held in the paws). Delete small separate shapes ("!" marks, motion lines, puff clouds). Frames with `remove_marks: true` in the map must be checked visually after this step.
5. **Mirror** frames marked `mirror`, and create the `derived` turn frames.
6. **Colour-match** every frame to the colour reference (walk_1): adjust only hue and saturation of the orange fur pixels, gently (no more than needed). Leave cream, dark brown and eyes alone.
7. **Head size:** measure the head in each frame (for front and three-quarter views: the distance between the two dark eye patches; for side views: the head height from the top of the head to the chin). Compute `scale` so every frame's head matches the old idle rig head. Write the values into `character.json`. Allow manual corrections in `art/scale-overrides.json`.
8. **Baseline:** find the feet line of each frame (lowest solid pixels) and store `anchorX` and `feetY`. Airborne frames (`joy_jump`, `drag_grab`, `drag_hang`) keep their real height above the ground: store their offset instead of snapping them down.
9. **Export:** `src/renderer/character/assets/v3/<name>.png`, trimmed with a small margin, plus updated `character.json` (new `poses`, new 12-view `ring`, `walk` with 8 frames, and the `sequences` from section 9.4). Move the old ring and poses to `assets/_old/`.
10. **Review sheet:** make `art/review/contact-sheet.png` with every exported frame at display size, all standing on one baseline line, with a horizontal guide line at head height, the frame name under each, on a mid-grey background (so white halos are visible).

**STOP after Phase 1A** and tell me to open `art/review/contact-sheet.png`. List any frame you are unsure about (halo, cut tail, leftover mark, wrong size). I approve or ask for fixes before Phase 1B.

### Phase 1B: Engine sequences and review page [DEMO]
- Add `sequences` support and `play(name)` to `tokku-character.js`, and implement the methods in section 9.4. Keep the idle rig as the main idle.
- Crossfade 80 ms between frames inside a sequence, 150 ms between unrelated poses. Keep the squash.
- Make `art/review/sequences.html`: a page with one button per sequence and per brain action (focus, attention, five more minutes, break, break over, meal, wake, task done, drag, Quiet on and off, welcome back), a speed selector (0.5x, 1x), and a "Play full story" button that runs them in a realistic order.
- Add tests: every frame named in `sequences` exists in `character.json` and on disk; every exported PNG has transparency; standing frames have their feet within 3 px of `feetY`. Keep the 44 brain tests passing.
- **Test:** run all tests. Record a 60 second MP4 of "Play full story" with Playwright and ffmpeg if they install easily (ask me first), otherwise tell me to screen-record it with Win + Alt + R.
- **STOP** and ask me to watch it. I approve or list fixes.

### Phase 1: Tokku in the top right corner [DEMO]
- Window rules from section 3. Not always on top by default.
- Load `TokkuCharacter` with the v3 `character.json`.
- Tray menu: Pause 15 min, Interview mode, Do not disturb, Breakfast, Lunch, Dinner, Settings, What Tokku saw today, Turn Tokku off.
- Auto start at Windows login (setting).
- Apply every sandbox rule from section 2 now.
- **Test:** Tokku sits top right, a maximised window covers him, the tray menu works.

### Phase 2: Guard (sensing) [DEMO]
- Window title polling, classification, discard raw title.
- Idle time, lock, unlock, sleep and resume events.
- Mic and camera "in use" check, full screen check (section 5.6).
- Local daily log (7 day auto-delete).
- **Test:** opening YouTube triggers a "distraction" event, and joining a Google Meet test call triggers "quiet: on", both visible in a debug overlay toggled in Settings.

### Phase 3: Distraction behaviour [DEMO]
- State machine from 5.1, coming forward and going back from section 3, speech bubble with buttons, lines from `lines.json`.
- Drag: on mouse down call `dragStart()`, while moving `dragMove(vx)`, on release `dragEnd()`, then the brain walks him home. Second drag in an hour: `annoyed(2)` first.
- **Test:** open YouTube, wait 45 s, Tokku comes forward on top of it without stealing focus, plays `attention()` then `pointAtTask()`, "5 more minutes" plays `accept()`, he walks back to his corner and stops being on top.

### Phase 4: Quiet mode, Pomodoro and meal breaks [DEMO]
- Rules from 5.2, 5.3 and 5.6, using `TokkuBrain` (it already implements them; Phase 9 finishes the wiring).
- **Test:** set the timer to 2 minutes for testing. Keep typing: Tokku asks for a break. Join a test call: no pop-up, he turns away, and gives a `quiet_over` line after. Press `Ctrl + Alt + Q`: Interview mode turns on. "Lunch" makes him fall asleep and silences everything (use 2 minutes for testing), then he wakes up.

### Phase 5: Notion [DEMO]
- Settings screen for the token (`safeStorage`), top task, Done detection, offline cache.
- **Test:** Tokku shows my real top task; marking it Done triggers `celebrate()` within 5 minutes (use 30 s polling while testing).

### Phase 6: Phone pings and offline [DEMO]
- ntfy topic setting with a "generate random topic" button.
- Away ping after 30 min idle or locked (use 2 minutes for testing). Section 6 behaviour. Ask `awayPingAllowed()` first. On return play `welcomeBack()`.
- **Test:** lock the screen for the test time, phone gets "Your computer has been off for 2 minutes." Turn Wi-Fi off: nudges still work, offline dot shows.

### Phase 7: Partner PIN and emergency exit [DEMO, simple version]
- First-run PIN screen ("Hand this screen to your partner"), quit with PIN, 30 second hold emergency exit with reason.
- [LATER] Unlock request ping to the partner.
- **Test:** wrong PIN refuses, correct PIN quits, hold to quit works without PIN.

### Phase 8: Privacy panel [LATER, simple version if time]
- "What Tokku saw today": minutes per category, nudges, breaks, meals, Quiet mode time, and "Delete everything".
- Plain-language page of what Tokku can and cannot see.

### Phase 9: Wire the brain to the real app [DEMO]
- `TokkuBrain` lives in the renderer. Guard sends events; the brain decides; the character animates.
- Map events: Quiet mode on/off -> `setQuiet`; tray Breakfast/Lunch/Dinner -> `startMeal`; Notion task Done -> `taskDone`; drag -> `dragged(x)` (update it to use the new drag methods); away ping in Guard asks `awayPingAllowed()`.
- Voice toggle in Settings, off by default, local Windows voices only.
- **Test:** all automated tests pass, then repeat the Phase 3 to 6 checks with 2 minute timers.

### Phase 10: Package [LATER]
- Windows installer with `electron-builder`.
- README: what it is, install steps, requirements, privacy model, Quiet mode, honest limitations, AI tools used (Claude Code for code, image generator for the character art).

### Demo mode (add in Phase 9) [DEMO]
A hidden tray item "Demo mode" that sets all timers to short values (focus 1 min, break 30 s, meal 1 min, away 1 min, Notion poll 15 s) so I can record the whole story in one take for the video. It must be clearly off by default.

---

## 12. Lip sync
See section 9.5. Text bubble plus the 2-frame mouth flap for the demo. Rhubarb lip sync later.

---

## 13. For the DJXHack submission
- Label in the video what actually works and what is concept only (voice and lip sync, smart glasses or phone app versions).
- Credit AI tools used: Claude Code for code, and the image generator for all character sprite sheets. (3D generators were tried and not used.)
- Never show the real Notion token, ntfy topic or partner PIN on screen.

---
## 14. Status table

| Item | Status | Where |
|---|---|---|
| Phase 0: Electron shell, git, sandboxed window, local-only `app://` loading, network and permission blocks | Done and tested Sun 11 Oct (`npm start` shows the old idle Tokku) | `src/main/main.js`, `src/renderer/app.js` |
| Phase 1A: sprite pipeline | Done Mon 12 Oct, re-cut the same day from the transparent re-drawn sheets (now in `art/sheets/`; S05 gives one back view used for 120 and 150 degrees). Waiting for my approval of `art/review/contact-sheet.png`. 79 frames in `assets/v3/`, `character.json` is version 3 (poses, 12-view ring, 8-frame walk, sequences). Old art moved to `assets/_old/` and still used by the engine until Phase 1B | `tools/cut_sprites.py`, `art/scale-overrides.json`, `art/review/report.json` |
| Phase 1B: engine sequences and review page | Next, after approval | section 11 |
| Pomodoro 25/5, attention, Start break or Five more minutes, return after break | Done and tested in the prototype | `tokku-brain.js`, tests 1 and 2 |
| One timer at a time, timer shown on hover or in the last minute | Done | test 1g, prototype page |
| Meal breaks 1 hour: sleep and wake, no phone ping | Done and tested (logic); new art in Phase 1B | test 3 |
| Quiet mode overrides visuals and speech, timers keep running, missed reminders delivered once | Done and tested | test 7 |
| Optional local voice, off by default, never in Quiet mode | Done in code; needs a real Windows check | `_speak()` |
| Art v3: 21 sheets, 74 usable frames plus 5 mirrored turn views | Received; needs Phase 1A cutting and review | `art/sheets/`, `art/sheet-map.json` |
| 8-frame walk, 12-view turn, sleep loop, wake in-betweens | Art received; engine work in Phase 1B | section 9.4 |
| Drag, welcome back, surprise, point at task | New in v6; Phase 1B and 3 | section 9.4 |
| Notion completion, phone ping, Quiet detection on real Windows | Not testable in the prototype; Phases 2, 5, 6 | |
| Lip sync with mouth shapes (S20) | Skipped for the demo | section 9.5 |

## 15. Schedule (honest)

| Day | Work | Result |
|---|---|---|
| Sun 11 Oct, night | Install Node.js LTS, Git, Python 3.12. Unzip the kit. Start Claude Code with the prompt | Phase 0 running |
| Mon 12 Oct | Phase 0, 1A (review), 1B (review), 1, 2, 3 | Tokku lives on the desktop, walks, reacts to YouTube |
| Tue 13 Oct, day | Phase 4, 5, 6, 7 (simple), 9, Demo mode | Full story works with short timers |
| Tue 13 Oct, evening | Record the demo in Demo mode | Raw footage |
| Wed 14 Oct | Concept PDF (3 pages), 60 to 90 s video, submit | Submitted |

If Monday slips, cut in this order: Phase 8, Phase 10, the partner unlock ping, idle variety, `surprise()`. Never cut Quiet mode or the sandbox rules: they are the core of the concept.
