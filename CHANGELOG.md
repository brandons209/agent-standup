# Changelog

## 2.0.0
- **A lead that waits on its background agents is shown waiting.** Claude Code now launches most sub-agents in the background without saying so in the call; only the answer does. Those agents count as background ones, so a quiet agent no longer reads as a stalled call. A lead that closed its turn, or scheduled a wake-up (ScheduleWakeup, TaskOutput), while its agents work shows "waiting on …" until they are done, never "stalled", and an agent's answer wakes it instead of ending on "your turn". The Sessions view and the VS Code status bar read "waiting on sub-agents" until the last agent has reported.
- **A sub-agent's report is heard again.** Since Claude Code 2.1.293 a sub-agent hands its report back through a call of its own; that is now its report, said once.
- **The call starts as soon as you open it.** No more Join screen: the live call plays at once, silent, and your first click or key turns the sound on (a 🔊 chip at the top says so).
- **What needs you, in one line.** A red line under the header says who needs you, what it asks and for how long: an agent of this call, or another session of the folder you follow. Click it, or press **A**, to go there. G is still the gallery.
- **"Needs you" from Claude Code itself.** Claude Code keeps a status for each open session and says there when a menu waits for your answer. A Bash command waiting for your go-ahead, which looks like a running command in the transcript, now shows "needs you" the moment it opens, with the command beside its timer. Your own dialogs (/model, /config…) do not count. ⚙ → Display → "A card with what the session asks you" shows the question and its numbered options, the command, the file or the plan, word for word (off by default).
- **VS Code tells you when a session starts waiting for you**, naming it and what it asks, with Go to session and Open call; once more 5 minutes later if nobody answered. Not while a call is in view, nor while you are on that session's Claude Code tab. Off with `agentStandup.notifyNeedsYou`.
- **The call follows the session you last typed in**, not the one written to last: what the agents write no longer moves it. A session you go to from the Sessions view keeps the call until you type somewhere else, and next to the session's name the call says why it is there. Pinned windows stay on their session.
- **A window on a folder follows that folder**, read from where its sessions were started: `app-old` beside `app` no longer takes its call. Sessions started in a temporary folder leave a call that looks everywhere alone, and every folder keeps its newest sessions in the list however many are written elsewhere.
- **Sessions view in sections**, what waits for you first; idle sessions fold into one line. ✓ puts a session whose turn is over into a Done section until it moves again, in every window. Cards show the question a session stopped on, how long it worked and how long it has waited on you since, and a PR #n button when Claude Code noted a pull request.
- **Which model spent the tokens**, when a session mixes models ("⚡ 391 · Haiku"), on the tiles, in the header and in the recap. **Repeated work, counted:** a ♻ on a tile counts files read again with no change, files another agent already read, searches run twice and failing commands run again. Hover ✗, ♻, 🔁, ⏳ or 💤 to see the calls behind them.
- **Display:** statuses take two lines before they are cut; ⚙ → Display → Focus layout gives the cameras' room to the shared screen.
- **VS Code stays responsive while the call reads a large session:** the server runs in a process of its own, started when a call is opened, and in the extension host as before if it cannot start.
- **Fixes from the original project (1.32 to 1.38).** Two VS Code windows no longer both speak. In a replay, agents that spoke back to back take turns. Only the page itself may write to the server, not another local page. Natural voices install from an app opened from the Dock; a voice worker that hangs is started again. At most 5,000 translated lines are kept, and speech files on Linux live in the user's cache. Windows: an npm-installed Claude Code gets each argument whole. A hidden call nobody can hear asks the server less often. A softer babble.
- **Desktop app on Electron 44** (macOS 13 or later); its page may only show notifications and copy, and links leave the app only for the sites the extension opens.
- **No usage counter.** The opt-in daily request to a file on the original project's releases is gone with its setting.
- For contributors: CI runs on Node 22 and on release branches; the publish workflow only runs in the original repository, and the package points at this fork.

## 1.26.0
- **One window per session.** Open a session in its own tab (VS Code) or window (desktop app, browser) with ⧉ on its card in Sessions, or with the command “Agent Standup: Open a session in its own tab”; picking another session from the board or Ctrl+K opens it the same way. A pinned window stays on its session and says when it has ended. Tabs are ordinary editor tabs: maximise them, or move them to a window of their own. A reloaded or moved tab carries on where it was without reading anything twice. In VS Code, a button in the side bar’s title opens the call in an editor tab.
- **Screens stay shared while an agent thinks.** A shared screen stays up between two commands instead of closing and opening again, and changes hands with a fade. ⚙ sets how long it stays while its agent thinks (90 s by default). Option: up to four screens at once.
- **Gallery view** (▦ or G): every camera the same size, fitted to the window.
- **Transcript.** Dock it at the bottom or on the right and drag it to any size; change its text size (A− A+); show spoken lines only; show full messages, rendered as markdown; include the chatter (on by default). Each name is in its agent’s colour, and a live transcript follows its newest line unless you scroll up to read.
- **Who is talking:** a glowing ring in the speaker’s colour, on their tile and on their shared screen.
- **Characters think and celebrate.** Your own characters can have `name-think` and `name-celebrate` pictures next to `name-talk`; the drawn characters get a thinking pose and a little dance when they finish. In a live call with chatter on, a sub-agent that finishes says a word, once.
- **Sub-agents are named after their character** (“Rainbow Dash”), or from your own list in ⚙. No character is shown twice among the agents on the call, and a name frees up when its agent leaves. Each session deals the characters in its own order, so calls no longer all start with the same three; the same session always gets the same cast.
- **Keep my agents’ own names** (⚙ → Characters, off by default): a sub-agent you defined (`.claude/agents/code-reviewer.md`) or named when it was launched shows that name (“Code Reviewer”, “Code Reviewer 2”) and keeps its character’s picture.
- **Sub-agents say what they are doing** in a live call, one at a time, without spending any tokens (⚙, on by default; not with Quiet chatter).
- **Pony pack** in ⚙ → Characters, in place of the starter pack: the animated SVG ponies, now with Trixie, Starlight Glimmer and Aurelia, each with talk, think and celebrate frames. If you had picked the starter pack, the call goes back to your folder (or the drawn characters).
- ⚙ sets how long a finished agent stays on the call: 30 s by default, where it was 2 minutes.
- Fixes. A live line could stay off screen or, when the page failed halfway through an update, go missing until a reload. Long lines no longer freeze on their first part. The lead no longer shows “waiting” while it works alongside background agents. A report is answered once, and an agent that finishes between two others’ lines still gets its word. The ambience volume now covers the room tone and the typing clicks too. The laptop option also puts a laptop in front of Claude and you when they are your own characters. Speech no longer reads link brackets, list marks or tables. Shared screens fit above a transcript docked at the bottom. A sub-agent busy with a long command or a long answer no longer leaves the call while it works, and its screen no longer stays up after it has left: silence counts as finished only after its turn has closed and 6 minutes have passed (30 minutes when it stopped mid-call), and an agent that gets back to work comes back to the call.
- **Your turn, when it is.** The Sessions view and the VS Code status bar read Claude Code’s own end-of-turn mark: a line followed by a tool call no longer shows “your turn”, a session stopped with Esc shows it at once instead of “working” for ten minutes, and a turn that ends on an API error or a usage limit is over instead of looking busy for three minutes. The live call keeps the lead at work until its turn really ends, also in the first turn of a session.
- **Inner thoughts, tidied.** An agent’s reasoning is shown in whole sentences (“db/schema.sql” no longer splits it), one thought per line of its notes, three lines at most above the activity line. Gone: the “N calls in” thought, doubled punctuation, long file names, the `cd … &&` in front of a command, regular expressions read out, and the kind of agent taken for its task. No thought just before the agent’s own line or after it is done, and the mumble stops when someone speaks.
- **The wrap-up is made for the ear:** the first sentence of each paragraph and list item, about 280 characters, no tables, code or emoji.
- Fixes from the original project. The ⚡ token counts move during a live call again. The slider works in Replay and Demo. Very natural voices no longer drop the end of a long line, and a model download cut short is fetched again instead of failing forever. The list of system voices no longer holds up the first page. A pack name like `constructor` no longer answers a server error. `research_notes/` and `reports/` folders are never packaged.
- Safety: a to-do status in a transcript could inject markup into the page; only the three real statuses are kept now.
- The page is split into a stylesheet and one script per part, and `npm test` now also checks the page’s logic without a browser. The landing page has its character animations again.

## 1.25.8
- **Inner thoughts.** In a live call, an agent that has been at work for a while thinks to itself: a lighter, italic bubble that is not said out loud. What it thinks is real. When the session keeps the agent’s own reasoning, the bubble shows it, sentence by sentence, before anything else; Claude Code only keeps that text for some of the lead’s steps and almost never for sub-agents, so the rest of the time the thought is about what the agent is on: the command it is waiting for, the files it goes between, its current to-do item, a failure, its task. About one thought in five escapes as a mumble: the character’s own voice, low and muffled, lips closed, cut as soon as anyone speaks. Never while the agent talks, two at most on screen, off in Quiet or with ⚙ → Little lines & animations.
- **Your own lines are always voiced.** An order typed during a long command is handed over when the command returns, stamped with the time you typed it: two minutes “late”, so the call showed it without a voice, as it does when it is far behind. It now takes its place when the lead gets it. And whatever the backlog, a line of yours is never skipped nor muted: it is said, shortened if need be.
- Open VSX is published by the release workflow itself (trusted publishing, no token).

## 1.25.7
- **A live call that does not lose anything.** The page used to ask the server for “everything after line N”, but a session is not written in order: lines are added in the past, and lines already sent change. The server now tells the page what is new and what changed, and the page corrects itself. In a live call this brings back what was missing: an order you type while the lead works (1.25.6 only showed it after a reload, and could say the lead’s last line twice), a sub-agent’s report (its last line becomes a report a few seconds after it is written: until now it went by as an ordinary line, with no ✅, no ding and no thanks), and every tool call of a message that launches several.
- **The lead’s turn ends when it really ends.** Claude Code marks the message that closes a turn; the call uses that mark instead of “quiet for 25 seconds”. No more “your turn”, confetti and “To sum up…” in the middle of a turn after a long command; the lead shows as working while it thinks about your order; “Notify me when the agents finish” also works for a session without sub-agents. An interrupted turn ends too.
- **Speech bubbles are readable.** A bubble sits above the tile’s own status badge and icons at every width, is no longer cut by its tile, and is not shown twice.
- **Narrow panels (the VS Code side bar).** One row per agent up to 480 px, whoever needs you first; the playback bar no longer overflows; Call / Tree / Sessions stays reachable; no sideways scrolling from 270 px.
- **One status that tells the truth.** The header said WAITING while the lead worked, while an agent needed you and when it was your turn. It now says which: offline, who needs you, who is stalled, how many are working, or your turn with the lead’s last sentence (“Do you want me to commit?”). A click goes to the agent concerned.
- **First run.** With no session yet, the empty state and its demo button are no longer hidden behind Join, and the text names the folder being watched. Join has the focus (Enter joins); the settings toggles tell screen readers their state; Escape closes the menu and the detail panel.
- **Voices.** A line ends when its sound ends: the slowed-down cartoon characters kept talking over the next speaker for up to 2.5 seconds, mouth closed, and Pause did not stop them; subtitles now follow the real length of the voice. The voice says what the caption shows: “and/or” and “client/server” are read in full (only a file path is named by its last part; a web address by its site). A short line (“OK.”) no longer makes a character switch to the voice of the other language for one sentence. When the call is behind, the next lines are prepared in the form they will be said, so a voice starts with its line instead of a second later.
- **Chatter between agents is Normal by default again** (Quiet since 1.25.0 for those who had not chosen).
- Sub-agents launched by a workflow are part of the call (they were invisible). A compaction summary is no longer read aloud as if you had typed it. Session titles follow a later rename.
- Fix: the lead’s own answer to your order was skipped after a long order. Fix: pausing and resuming at the end of a live call said the last line again. Fix: in a replay, jumping to another line of the same speaker closed its bubble.
- Safety: one malformed request could stop the standalone server; another site could read the saved settings through a script tag; speech commands hidden in a transcript (`[[slnc …]]`) reached the macOS voice.
- Under the hood: the live call is now tested in a real browser on every push (one case per regression that reached a release), and nothing is published from a commit whose tests fail.

## 1.25.6
- **The lead answers your order.** About one time in three, Claude starts on its tools without writing a word, and the call stayed silent after your order (half a minute on average, sometimes minutes). In a live call the lead now says what it is starting with, taken from the tool call itself (“Got it. Let me look at server.js.”, “Okay. I’m running a command: run the tests.”). Only when it has not spoken by itself; local like the other little lines, absent from the transcript, off with ⚙ → Little lines & animations.
- Fix: in a live call, sub-agents no longer answered the lead’s orders, and the lead hardly ever thanked them for a report. Since 1.25.0 these little answers were only said when the call was less than 6 seconds behind the session, and reading the order itself takes longer than that while the new agent is already at work. An answer to what was just said is now allowed up to 30 seconds behind (remarks from bystanders still wait for a quiet moment). After a parallel launch, the first three agents answer (only the first one did since 1.25.2).
- An order you type while the lead is working is now part of the call. Claude Code hands such a message over in the middle of the turn, in a record of its own, and the call ignored it: your line was neither shown nor read, and the lead’s answer came out of nowhere.
- Fix: joining a live call read the end of the previous one again. The call picked the session up 16 events before its end, whatever its age, so the last lines of a session that was long over were said as if they had just happened (and said once more each time the session was loaded again: a rewritten transcript, a return from another session). A live call now starts when you join it: what happened before is on screen (states, transcript) and only what comes after is said, once. If the agents are at work when you join, the last 10 seconds are said too, so you know what they are on.

## 1.25.5
- Fix: the lead could read the same wrap-up several times in a row (its state flipped to done more than once without a new message). Once per message now.
- While a screen is shared, a member who speaks still gets the spotlight (the presenter’s own tile stays small: its camera is already in the corner of the share).

## 1.25.4
- Fix: after a change of characters (a pack, Reload, your folder), the small camera in the corner of a shared screen kept the previous look while the tile had the new one, so the lead could appear as two different characters at once.

## 1.25.3
- **Character packs built in**: ⚙ → Characters → Starter pack or Cat pack switches the whole call to those characters in one click, in the extension, the command and the desktop app alike; Drawn characters is the default; My folder uses your own images (picked by itself if your folder already had some). Until now the packs only lived in the repository, to copy by hand.
- **The voice follows the language of the line, not of the interface.** A session written in French with the interface in English was read by an English voice (French with an English accent); the other way round, an English line was read by a French voice. Each line now gets a voice of its own language when it clearly reads as French or English (the short lines of banter keep the interface language). A line already in French is no longer sent to Claude for translation.

## 1.25.2
- **Sub-agents show up at once in a live call.** When the lead launches several agents in parallel, their tiles appear the moment the orders are written (before, each tile waited for its order to be read out, one after the other, and a burst of hundreds of tool events could hide them until the call caught up). The first order is read in full; the others are named in one line (“Also Remy on X, Iris on Y”). Hundreds of tool events from parallel agents now scroll past in a couple of seconds instead of minutes.
- **The lead says what it did.** When the lead finishes (confetti), the part of its last message that the live reading had cut short is read as a wrap-up (“To sum up: …”), so you know what was done without opening the transcript.
- **Quiet chatter really is quiet**: no lines to fill the silences, no thinking out loud, no remarks from bystanders; only the real exchanges (orders, reports, a word of thanks or acknowledgement).
- A little faster voice while catching up on a backlog.

## 1.25.1
- Fix: in a live call, the first line after a silence (typically your own order) was skipped or rushed. The call measured how far behind it was against the previous event, which after a few idle minutes looked like a huge backlog. The lag is now the gap between the line being played and the newest line of the session, so an idle session is never “behind”.
- Fix: your own sub-agent characters were picked per agent without looking at the others, so two sub-agents often got the same picture while others went unused. A new sub-agent now gets a picture no other agent on the call holds; pictures repeat only once every one is taken. Contributed by [rqwj](https://github.com/rqwj) (#1).
- A cat pack in `examples/cats` (11 cats, CC0), contributed by [KajetanCiunelis](https://github.com/KajetanCiunelis) (#2). Their suggestion too: ⚙ → Characters → **Laptop in front of your own characters** (off by default) shows a darker laptop while a custom character works, dark enough to stay visible under a white or cream sprite.

## 1.25.0
Five UX improvements and agents that talk to each other more.
- **Jump to who needs you**: press **J** / **K** (or click the “need you” / “stalled” chip) to move to the next agent that needs you or is stalled. The help (**?**) now explains each state.
- **Settings menu**: sections that fold (and remember it), a search box, a new Display section. “Notify me when the agents finish” is now on by default (until you choose otherwise; the browser asks permission on your first click).
- **Cmd/Ctrl+K**: jump to any session from any view, with search.
- **Very narrow panel** (under 300 px, like the VS Code side bar): one row per agent instead of tiles. Wider windows keep the tiles.
- **Replay**: **←** / **→** step through the call, **N** / **Shift+N** jump between highlights, speed presets 1× 2× 4× 8×, and each session remembers where you stopped. Browser shortcuts (Cmd+R, Ctrl+N…) are no longer taken over by the page.
- **Agents talk to each other**, using what really happened in the session (edits, tool calls, errors, files, time taken): a new agent asks a question and the lead answers; a report gets a reaction that fits (all good, errors along the way, that took long) and sometimes a word from a third agent; an agent that fails three times in a row gets a “you okay?”; every few minutes the lead calls a quick round and the busy agents answer. ⚙ → Display → **Chatter between agents**: Quiet (default) / Normal / Lively.
- Reports are introduced more naturally (“All done. …”); orders keep the lead’s exact instructions, read a little longer in a live call.
- **Live calls keep the rhythm of the real session**: the page measures how far behind the real conversation it is and, past 6 s, speaks a little faster and reads shorter lines; the small talk and the exchanges between agents only happen when the call has caught up; past a minute it skips ahead. New events are polled every 0.4 s (was 0.7) and their audio is prepared as soon as they arrive. On a simulated live session the median delay between a line being written and it being spoken went from about 3 s to 1 s.

## 1.24.3
- **Dansk** (Danish) interface, suggested by a Reddit reader. AI-drafted: corrections welcome in `public/locales/da.json`.
- **Keyboard shortcuts** are listed under ⚙ → Keyboard shortcuts, or press **?**. Switching to the tree view with **T** now says how to get back.
- README: a security section (what it reads, what it can send, local only) and how several sessions at once are handled.

## 1.24.2
Narrow and short windows (the VS Code side bar, a small panel), found by going through every panel at five window sizes.
- Fix: the Sessions view showed a blank page when the window was 640 px wide or less, and stayed blank on the next load. A style meant for the status chips of the header was also applied to the whole page.
- Fix: the settings gear (⚙) slid off the right edge under about 400 px. The buttons now keep their size; the name, the context gauge and the token counter give way instead (the gauge is hidden under 480 px, the counter under 420 px).
- Fix: in a window less than about 350 px tall, the Highlights bar covered the seek and speed sliders while an agent shared their screen. The shared screen now shrinks, and the bar keeps to two rows and scrolls.
- Fix: the task list of the shared screen was cut off with no way to scroll (no task visible at 1280×450, a list of 8 cut at 1280×720). It now uses the full height, scrolls, and brings the task in progress into view.
- Fix: in a window narrower than about 480 px, the task list squeezed the shared terminal to a strip. The task list is now hidden there and the terminal keeps the room.
- Sessions view: cards of sessions that need you or are stalled keep their coloured border and status chip, but are no longer filled with red or orange, and titles are no longer tinted. That fill came from the same misapplied style.

## 1.24.1
- Fix: the settings menu (⚙) was taller than a small window since 1.24.0 and its last entries could not be reached. It now stops at the bottom of the window and scrolls.
- **A little more talk between agents**: whoever receives a report sometimes says thanks ("Got it, thanks.", "Noted. I'll take it from here.", about one report in four), and an agent that has been thinking for a long time says so ("Hmm, let me think.", "Hang on, I want to get this right."): after 20 seconds without a word in a live call, once per silence, and in a replay before a line that really took 40 seconds or more to come, about every other time. Eight variations of each, never the same twice in a row, in English and French. Part of ⚙ → Little lines & animations.

## 1.24.0
- **Video export records an MP4** (H.264 video + AAC audio, 1280×720) when the browser can record it, and falls back to `.webm` as before when it cannot (⚙ → Tools → 🎞 Export video). X, phones and most chat apps refuse `.webm`. Checked in Chrome; not tested inside VS Code's own panel, which may still produce a `.webm` there.
- **Clip to share** (⚙ → Tools → 🎬 Clip to share (25 s)): a short clip of about 25 seconds, saved as `agent-standup-clip.mp4` (`.webm` when the browser cannot record MP4). In the middle of a replay it starts at the current position; otherwise one spoken line before the first error or loop of the session when there is one, and failing that at the moment the lead first hands out work. The line being said when time is up is finished rather than cut, so the length varies by a few seconds. The clip carries the site address (atoll92.github.io/agent-standup) in the top right corner and ends with a short end card (product name, the tagline "Your Claude Code agents as a live team call", the site address). The full export has neither.
- **Hide code & file names in videos** (⚙ → Tools, off by default), for the full export and the clip: commands, their output, file contents, diffs and search results on the shared screen are drawn as grey bars of the same length; file names are removed from the window title and from the activity tags on tiles (the tool's name, e.g. "Bash" or "Read", stays); the session title is replaced by "Agent Standup". What the agents say is not masked: speech bubbles, subtitles and voices are kept as they are, so check the clip before posting if agents quote code or names aloud.
- **Pictures on the shared screen**: when a tool gives an agent a picture (a screenshot, an image file it reads: PNG, JPEG, GIF, WebP), it is shown on the shared screen instead of an empty terminal, stays up for several seconds (8 in a live call) whatever the agent does next. It also appears in the agent's Recent activity and in exported videos, where "Hide code & file names in videos" replaces it with an empty frame. Pictures are served from the session file itself, to this machine only; nothing else on your disk is read. Pictures you paste into your own messages are not shown.
- **Small talk during long silences**: when nobody has said anything for a while, an agent fills the gap with a typical video-call line ("Can you hear me?", "You guys still here?", "Sorry, I was on mute."). Whoever shares their screen says the screen ones ("Can everyone see my screen?"). After 45 seconds in a live call and about 10 seconds in a replay, at most three per silence and further and further apart; nothing is said in a hidden tab or once the session has been untouched for ten minutes. English and French, part of ⚙ → Little lines & animations.
- Fix: in 1.23.1 the "Reactions & jokes" option only prepared its jokes when three agents talked at the same time (a leftover from the removal of meme mode); they are prepared for every line again.

## 1.23.1
- Meme mode removed: it disturbed the layout.
- Natural voices (Kokoro): the default model is now q4 (about 305 MB). The smaller q4f16 returned silence on some lines. A line the model cannot make is now handed to a system voice instead of being dropped; Nicole (Kokoro's whisper voice, hard to hear) is replaced by Sarah. Found by [neondragon](https://github.com/neondragon/agent-standup) in their fork, thank you.

## 1.23.0
Ideas from [neondragon's fork](https://github.com/neondragon/agent-standup), rewritten and merged.
- **Settings are kept in a file** (`~/.config/agent-standup/prefs.json`, or `%APPDATA%` on Windows) shared by every window. Before, each VS Code window and each port started from scratch, because the browser stores settings per port.
- **The call stays with the session you follow** while it is active (90 s), so another session writing elsewhere no longer steals it mid-line. A workspace folder also matches the sessions of its sub-folders.
- **What you typed**: the blocks Claude Code wraps around your message (system reminders, IDE context, command echoes) are no longer shown as if you had said them.
- **Subtitles follow the voice**: a long line is shown one sentence at a time.
- **Very natural voices (Kokoro-82M)**, optional and installed on demand from ⚙ → Sound.
- Traditional Chinese wording polished with a native reader's suggestions. `npm test` runs the new tests.

## 1.22.1
- Security and robustness (found by a pre-release audit): custom-character folders no longer follow symlinks, side-effect endpoints refuse cross-site requests, a request error can no longer crash the server, translation helpers run with no tools, the TTS cache is private to the user, `--port` is validated.
- A lead waiting on a synchronous sub-agent now shows "stalled?" after a long silence; the repeated-command loop badge stays visible; the project picker works when the page was opened with a pinned project.
- Custom characters: stable assignment when you add or remove files, reload refreshes video exports, the mouth alternates in exports, the presenter camera uses the talking frame.

## 1.22.0
- **`agent-standup` command line** (npm package `@double_geste/agent-standup`, also attached to the release as a `.tgz`): `agent-standup --open` starts the local server and opens the call without any editor; `agent-standup status [--here] [--json]` prints what is going on; `agent-standup statusline` is a one-line indicator for the Claude Code status line, tmux and Neovim.
- **Desktop app for macOS** (Apple Silicon and Intel, unsigned): its own window plus a menu bar indicator (`⚙2 ✋1`) and a notification when an agent may need you. Built with Electron from the same server; Windows/Linux builds are set up in CI (experimental).
- **Publishing automation**: `.github/workflows/publish.yml` publishes tagged releases to the VS Code Marketplace, Open VSX (Cursor, Windsurf, VSCodium…) and npm when the corresponding tokens are set; `ci.yml` checks syntax, translations and the CLI package on every push.
- `ROADMAP.md`: what works where, plus research notes on other agent tools and on Rive.

## 1.21.0
- **Languages**: English, Français, 繁體中文, 简体中文, Español, Deutsch, Português (Brasil), 日本語, chosen in ⚙ → Language and remembered. Translations are plain JSON catalogues (`public/locales/`), with fallback to English for anything missing, a checker (`npm run i18n`) and a contributor guide. The VS Code manifest (command titles, setting descriptions) and the status bar texts are localised with VS Code's own `package.nls` / `l10n` mechanism. Non-English and non-French catalogues are AI drafts awaiting native review.
- **Your own characters**: drop your pixel art (PNG/GIF/WebP) in `~/.agent-standup/characters` — `lead.png`, `you.png`, any other image for the sub-agents, `name-talk.png` for an open-mouth frame — and it replaces the drawn figures, crisp and animated (bob, talking frame), with all states still shown. New command "Open characters folder", setting `agentStandup.charactersPath`, and a starter pack in `examples/characters`.

## 1.20.3
- Fix: the raised-hand animation of an agent that may need you shared its name with the talking arm animation, so one overrode the other; each now has its own.

## 1.20.2
- Fix: in Live, the lead's orders to sub-agents and the sub-agents' answers were often not heard. A burst of orders set off a catch-up mode that skipped voices and sped everything up. Now every line is read: when many are waiting each one is shortened to its first sentence (the bubble still shows the full text), only a backlog of more than a dozen lines is skipped, and in Live the voices speak one at a time instead of over each other.

## 1.20.1
Fixes from a second review pass by sub-agents:
- Loop watch: a batch of failing calls now counts once (it used to count each call), so four failures in a row means four failed steps.
- A pinned session that no longer exists no longer keeps the view silently pinned; the status bar refreshes the moment VS Code regains focus; a disposed panel is recreated instead of throwing.
- README: `statusBar` setting listed, duplicate sections merged, and the "zero token cost" claim now says it holds unless French translation or jokes are turned on.

## 1.20.0
Three features and a round of polish (chosen from a research pass by sub-agents; each approved before building):
- **VS Code status bar**: live counts for your workspace — "⚠ 1 needs you", "⟳ 3 working", "✓ your turn" — red when an agent may be waiting for you, with the sessions listed on hover. A click opens the call on the most urgent session (new setting `agentStandup.statusBar`, on by default). It reads the session files directly, so it works even before the panel is opened.
- **Context gauge**: "ctx 62%" in the header for the lead and on each tile and list row from 50%, orange at 70%, red at 88%, plus one warning before auto-compaction and a toast when the conversation is compacted. The window (200k or 1M) is inferred from observed sizes since transcripts do not state it; hover shows tokens used / window.
- **Highlights and loop watch**: in Replay, one-click jumps to the first error, the longest agent wait (waits for you and gaps over an hour are ignored), compactions, and a possible loop. A 🔁 badge appears on an agent that repeats the exact same call 3 times or fails 4 times in a row (polling and screenshot tools are ignored).
- **Polish** (from a UX best-practices review): higher contrast for dim text and tile labels, bigger status chips, done tiles no longer fade their text, calmer idle cards, a coloured dot on the tab icon when something needs you, a friendly "standing by" instead of a lone dot, smoother hover and press feedback.

## 1.19.3
Found by eight read-only sub-agents testing the app (each finding checked before applying):
- API: an unknown session now answers 404 (was 500), over-long ids answer 400; `/api/sessions` is ~10x faster cold (titles from a cached tail read instead of reading whole files) and cached for 2 s. A title you typed (custom title) now wins over the generated one.
- Tool calls shown properly instead of raw JSON: questions to the user (with the options), skills, tool search, notebook edits and MCP tools ("server · tool").
- Accessibility: tiles and agent-list rows are reachable and openable from the keyboard (Tab, Enter/Space), visible focus ring, "reduce motion" now stops every animation including confetti, toasts are announced politely, and a few labels that were English-only are translated.
- README: Sessions tab, `shareUsage` setting, exact menu labels, and the second "Voices" section renamed "Voice engines (per OS)".
- The call timer rests while the tab is hidden.

## 1.19.2
- Fix: the header could overflow the window when several status pills were shown. The pills now collapse to icon + number on windows narrower than 1180 px (full label on hover), and the call timer hides there.

## 1.19.1
Fixes from a code review (two read-only sub-agents, each finding checked before applying):
- Live: "needs you?" and the slow badge only trust wall-clock ages when playback has caught up with the live end (no false alerts while voices are queued).
- Switching sessions resets all per-session state (no stale 🎉/confetti/waiting states); past errors no longer replay as 😬 shakes when skipping ahead; a goodbye bubble can no longer stay stuck on a tile; the catch-up mode flags reset on pause.
- Server: one malformed transcript record no longer breaks the whole timeline; huge transcripts are read in 16 MB chunks; the Sessions board memoises its scan and caches untitled sessions; the 4-minute "silent sub-agent is finished" fallback (old transcripts only) now refreshes the cache when it kicks in; `..` is rejected for the pinned session.
- Known limitation, not changed: in Live, tool calls issued in parallel can be merged into a beat that was already delivered, so the tile may show them one update late.

## 1.19.0
- **Little lines and animations** (on by default, ⚙ → Little lines & animations; local, no API, never in the transcript): a sub-agent answers briefly when it receives an order, with variants by what it was asked (tests, review, exploring, bug fixing, docs, UI, cleanup, performance) and a generic pool, in English and French; it says goodbye before leaving the call; other agents sometimes comment when one reports back.
- Small touches: a thought emoji now and then above a busy agent (⌨️ for commands, 🔍 for reads), a little shake and 😬 when a tool call fails (also a quick cue for errors), and confetti when the lead hands the turn back after a long job.

## 1.18.1
- Fix: sub-agents looked finished the moment they were launched (since 1.17.3). Recent Claude Code answers an Agent/Task call with "Async agent launched" immediately, which is not a completion. Completion now comes from Claude Code's task-notification record (background agents) or from a real synchronous answer; a sub-agent's last sentence is only treated as its final report once it is finished (or silent for 90 s).
- Measured on real sessions: the average number of agents shown as working went from 0.0 back to 0.8 / 2.3 on two multi-agent sessions.

## 1.18.0
- **Optional usage counter** (`agentStandup.shareUsage`, off by default, ignored when VS Code telemetry is off): at most one empty request per day to a 1-pixel file on GitHub, so active installs can be counted without any server or identifier. Documented in the README.
- `npm run stats` (maintainers): landing visits per source, release downloads, opt-in active installs, with the change since the last run.

## 1.17.3
- Fix: agents showed "stalled" (and never left the call) after finishing. A sub-agent that ended without a final sentence was never marked done, so the lead kept "waiting" on it. Completion is now taken from the lead getting the sub-agent's answer back; background agents no longer block the lead's status.

## 1.17.2
- Fix: the reactions bar was still visible in 1.17.1 (a leftover CSS rule overrode the hiding); it is now really hidden by default.

## 1.17.1
- The reactions bar is now hidden by default (it took too much room); turn it on in ⚙ → Reactions bar.

## 1.17.0
- **Agents list**: a fixed column left of the call (wide windows) with each agent's role and one status line, urgent first, lead on top. Click = spotlight that agent (25 s), double-click = details. Toggle in ⚙ → Agents list.

## 1.16.0
- **Sessions board** (new tab next to Call / Tree): every session active in the last 12 h, across all projects, with a single state (working · needs you? · waiting on sub-agents · your turn · idle) and active sub-agents. Reads only the tail of each transcript (a few ms for 40 sessions). Click a card to follow that session live.
- **Call feels more like a call**: a raised hand ✋ on tiles that may need you, 😰 on stalled ones, ⌛ while waiting, 🎉 when someone finishes; participants count and a call timer in the header; hover cards with name, state and last command; a reactions bar (👍 👏 ☕ 🔥 🙌) that flies emojis to whoever has the floor and gets a reply.
- Tree view rows use the same one-line status as the tiles.
- Fix (introduced in 1.14.1): a pending file edit/write in Live could break the status update (a missing variable). 
- README and site now open with the positioning: who is waiting on whom, who is blocked, zero token cost.

## 1.15.2
- Fix: in Live, sub-agents were often silent. The "catching up" mode (which mutes voices) was triggered by the number of silent tool calls, and sub-agents produce thousands of them; it now only counts lines that are actually spoken. Skipping ahead also keeps the last 6 spoken lines instead of the last 14 events.

## 1.15.1
- Default voices are back to **Cartoon** (real words, understandable); Animal Crossing and Simlish babble are opt-in in ⚙.

## 1.15.0
- **Animal Crossing and Simlish voices** (opt-in): every agent, lead included, talks in gibberish with a sentence melody and its own register. Works identically on macOS/Windows/Linux and in any language, with no system voice or translation needed. Cartoon (real voice + character) and Natural remain in ⚙.

## 1.14.1
- "Needs you?" no longer fires for Bash commands (11.8% of them legitimately run 25 s+ in real sessions); it now covers file edits/writes pending for 15 s+ and questions/plans waiting.

## 1.14.0
- **One status per tile**: working · waiting on another agent (who) · needs you? · stalled hand-off · done, with a summary in the header and in the tab title. "Needs you?" is a heuristic (a tool that normally needs approval has been pending for 25 s, or a question/plan is waiting); the notification option also fires for it.
- **Cartoon voices** (default): a character per agent (chipmunk, deep, robot, wobbly, radio, monster, squeaky) applied to the system voice. New ⚙ choice: Cartoon / Natural / Babble (syllable babble for sub-agents).

## 1.13.0
- **Copy as Markdown** in the recap: a standup report you can paste in Slack, a PR or a ticket.
- **Notify me when agents finish** (⚙, off by default): chime + tab title + VS Code notification after the team has worked 20 s+ and gone quiet.
- **Search box** above the transcript.
- **Ambience volume** slider (⚙ → Office ambience).
- **Compact layout** for narrow panels such as the VS Code side bar (smaller tiles, banner spotlight).

## 1.12.1
- Office ambience is now off by default (⚙ → Office ambience to turn it on).

## 1.12.0
- **Office ambience** (on by default, ⚙ → Office ambience): keyboards typing while agents work and on every real command, mouse clicks when they read, a coffee machine (grinder, pouring, steam, beep) with a little "Someone is making coffee…" note, a phone buzzing, a chair, a far-away door, paper, a knock on the meeting-room door. All synthesised in the browser, no audio files; it fades down when someone talks.
- In Live, the header shows which project is being followed.

## 1.11.2
- The app now always starts in English (switch to Français in the menu; your choice is remembered).

## 1.11.1
- Live view now honours `CLAUDE_CONFIG_DIR` (and `AGENT_STANDUP_PROJECTS`) and lets you pin the project to follow, instead of always the most recent session anywhere (menu → Source → Live).

## 1.11.0
- **Token usage per agent**: ⚡ counter in the header and on each tile, per-agent breakdown in the detail drawer and the recap (counted once per message, as recorded in the session files).
- **Stuck / quiet / failed**: tiles pulse amber with ⏳ when a command has been running for 1 min+, show 💤 after 3 min of silence, and count failed tool calls (✗). The tab title shows how many agents are working.
- **Much faster server**: each transcript is parsed once and then read incrementally (a live update on a 12 MB, 168-sub-agent session went from ~1.6 s to ~50 ms), responses are cached and gzip-compressed (12 MB → 3.3 MB), and memory for sessions you are no longer viewing is released. Verified identical to the previous output on 9 real sessions.
- Fix: a report from a nested sub-agent now goes to its real parent instead of the lead.
- Smoother UI on very large sessions (repaints of the tree, details and badges are coalesced). Keyboard shortcuts **T** (tree/call), **R** (recap), **L** (transcript).

## 1.10.0
- Built-in demo (⚙ → Source → Demo, or "Watch the demo" when there is no session yet): a fictional team fixes a slow login page, with real-looking commands, outputs, diffs, a task list and a retry-logic sub-agent. Ships its own French.
- Spotlight sizing: the speaker's tile now keeps a 3:2 shape at every window size (it used to get too flat on wide screens).
- The "is sharing their screen" badge moved into the window's title bar.
- README and website: real screenshots, a 1-minute video and a GIF, all produced by `scripts/capture-demo.js` from the demo.

## 1.9.0
- The coffee link is easier to find (still never intrusive): a gold ☕ button in the header, a highlighted line in the ⚙ menu, a link under the Join button, and the end-of-episode recap.
- Landing page / download site (GitHub Pages, source in `docs/`, generated by `npm run landing` from the app's own character art).

## 1.8.1
- Fix: two Agent Standup windows (sidebar + panel + browser) no longer talk at the same time; the last window where you pressed Join/Play/🔊 owns the sound, the others show 🔈.
- Fix: a line that is not translated in time is spoken by an English voice instead of a French voice reading English.

## 1.8.0
- Support: a "buy the dev a coffee" line in the ⚙ menu and at the end of the recap (never during a live call), a Sponsor button on the repository, and a note in the README. Friendlier "port already in use" message for `node server.js`.

## 1.7.1
- Translation: finds Claude Code much more reliably (PATH, Homebrew/npm/nvm/Bun/Volta, Windows `.exe`/`.cmd`, and the binary bundled with the official VS Code Claude Code extension); new `agentStandup.claudePath` setting; precise hints (not found / not signed in / VS Code started from a Claude Code session); stays in English without a warning when French cannot work and was not chosen explicitly.
- The extension now always runs its own server on a free port (`agentStandup.port` = 0) instead of reusing whatever already answers on 4747, which could be a server without the right environment.

## 1.7.0
- Office music: live FIP web radio (8 stations) with a volume control. The music fades down quickly while agents talk and back up slowly afterwards (ducking). Never recorded in video exports.

## 1.6.0
- Final name: **Agent Standup** (extension id `agent-standup`, commands `Agent Standup: …`, settings `agentStandup.*`). Uninstall *Agent Calling* / *Claude Call* first; settings and saved preferences start fresh.

## 1.5.0
- Renamed to **Agent Calling** (extension id `agent-calling`, commands `Agent Calling: …`, settings `agentCalling.*`). Uninstall *Claude Call* first; settings and saved preferences start fresh.

## 1.4.1
- Security: the local server only answers requests addressed to localhost and refuses cross-site / DNS-rebinding requests; session ids are validated.
- Reliability: translation workers are stopped when VS Code closes or after 10 min idle; another window takes over the server if the one serving it closes; an OFFLINE indicator shows when the server is unreachable; cached audio older than a day is purged.
- Performance: very large sessions are re-parsed at most every ~2× their parse time instead of on every poll.
- Polish: bilingual tooltips and aria-labels, keyboard focus outline, bilingual hints.

## 1.4.0
- Real outputs: tool results from the transcripts are matched to their calls. The shared terminal shows each command's actual output (errors in red), search matches, and a spinner with a live counter while a command runs; the editor view shows files that are read with their real content and line numbers; edits keep their diff plus the result line.
- Precise activity tags: tiles show what each agent is doing ("Reading App.jsx", "Running npm test", "Searching “x”"…) and tool calls end with ✓/✗ and their real duration.
- Task list panel next to the shared screen when the agent uses a todo list; agent detail drawer lists recent calls with expandable output; recap counts tool errors.
- The shared screen stays up while a command is running.
- Replay/seek and live-join rebuild the recent screen history so the shared screen is never empty.

## 1.3.0
- Renamed to **Claude Call** (extension id `claude-call`, commands `Claude Call: …`, settings `claudeCall.*`). If you had *Agent Standup* installed, uninstall it; settings and saved preferences start fresh.
- README rewritten to cover every feature, platform voices, translation, privacy and troubleshooting.

## 1.2.1
- Fix: a character's body/background could turn transparent after a screen share (duplicate SVG gradient ids between the tile and the presenter camera). Ids are now unique per instance.
- Live call is much closer to real time: every new line is translated the moment it arrives by warm workers (~4 s instead of 15–20 s), the feed polls every 0.7 s, lines are shorter in live mode, and the call skips ahead when it falls too far behind. With ANTHROPIC_API_KEY set, translation takes ~1–2 s.

## 1.2.0
- Voices on Windows (installed SAPI voices via PowerShell) and Linux (espeak-ng), same pipeline as macOS.

## 1.1.0
- Finished agents leave the call after 2 minutes (playback time) with a dissolve animation, particles and a "left the call" toast; they return if they get a new task. Can be turned off in the menu.
- The speaker always gets the spotlight and keeps it until someone else talks.
- Screen sharing now looks like a real video call: a terminal or editor window (with the actual diff) fills the stage, with a "sharing" badge and the presenter's camera in the corner.

## 1.0.0
- New original look: soft mascots at their desks in front of illustrated rooms; expressions follow what the agent is doing (typing, speaking, done).
- Live call that follows the newest Claude Code session; sidebar view and editor panel in VS Code.
- Reliable voices: generated by the server (macOS `say`) and played through WebAudio, so it sounds the same in a browser and in VS Code. Lip-sync follows the audio.
- Sub-agent tree, shared "screen" of the tool being used, clickable timeline (replay), recap, video export with voices.
- French or English, translated on the fly with your local `claude` CLI.
- Simplified controls: one settings menu, one mute button, one play/pause.
