# Hardware Synth UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the MIDI controller simulator's panel into a dark "Hardware Synth" look with a sliding-rocker mode switch and PLAY button relocated to bottom-left, and simplify MIDI handling: remove real MIDI Out entirely (WebAudio-only playback), and make the MIDI In (simulated) toggle a pure tempo-source selector rather than a transport control.

**Architecture:** No changes to `core/sequencer.js` or its tests — this is purely `index.html`/`style.css`/`web/ui.js`/`web/midi.js` work, validated against an already-approved interactive mockup. Behavior changes (Tasks 1-2) land first since they simplify the files before the visual/structural pass (Task 3) touches them again.

**Tech Stack:** Same as the existing project — plain JS ES modules, no framework, no build step, Node's built-in test runner for `core/sequencer.js`'s existing 20 tests (unaffected by this plan, but must still pass).

## Global Constraints

- No changes to `core/sequencer.js`'s behavior or its 20 existing tests — they must continue passing unmodified after every task.
- MIDI Out is removed entirely: no `navigator.requestMIDIAccess()`, no device selection UI, no `output.send(...)`. Only the WebAudio synth voice remains for playback.
- The MIDI In (simulated) toggle no longer starts/stops the transport. It only selects the tempo source: **checked** = use the BPM field's value, **unchecked** = use a fixed `120` BPM. The PLAY button is the sole start/stop control.
- The WRITE/PLAY mode switch is a custom sliding-rocker control (a `<button>`, not a checkbox), matching the approved mockup: a 72×30px recessed track with a 32×22px tab that slides from the left edge (Write) to the right edge (Play).
- The transport PLAY button moves to the bottom-left of the panel (grouped with the OCT placeholder above it, matching the original hardware sketch's left column), replacing its prior top-bar position.
- The keyboard is centered and widened (40px white keys, 22px black keys, capped at `max-width: 480px`), with black keys landing only between C-D, D-E, F-G, G-A, A-B (none between E-F or B-C) — this note/key ordering is already correct in `web/ui.js`'s `KEYBOARD_NOTES` array; this plan only changes sizing/centering CSS, not the note data.
- Visual palette (exact values, from the approved mockup): panel `#15171a` on `#0c0d0f` body, panel border `#2a2d32`, recessed wells `#0c0d0f`→`#1e2126` with border `#35383e`, raised elements `linear-gradient(180deg, #5b6068, #34373c)` with border `#46494f`, accent gold `#e8c15a`/`#caa227`, LED yellow `#ffe28a`/`#caa227` glow `rgba(255,210,90,0.7)`, LED green `#7dffb0`/`#1f9a52` glow `rgba(60,255,140,0.6)`, LED dim-green `#1a5c22` (unchanged), muted label text `#7d838d`.

---

## File Structure

No new files. Modified: `web/midi.js`, `web/ui.js`, `index.html`, `style.css`.

---

### Task 1: Remove MIDI Out entirely

**Files:**
- Modify: `web/midi.js`
- Modify: `web/ui.js`
- Modify: `index.html`
- Modify: `style.css`

**Interfaces:**
- Produces: `createMidiOut()` (no arguments — was `createMidiOut({ selectEl, statusEl })`), still returning `{ noteOn(noteNumber), noteOff(noteNumber) }`. `noteOn` still plays an audible WebAudio tone; `noteOff` becomes a no-op (the audio envelope already decays on its own — there's no sustained voice to cut and no MIDI byte to send).

- [ ] **Step 1: Replace `web/midi.js` with the WebAudio-only version**

Replace the entire contents of `web/midi.js` with:

```js
export function createMidiOut() {
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        audioCtx = new Ctx();
      } catch (err) {
        // No audio available (unsupported or blocked): stay silent rather than
        // letting the failure propagate into the sequencer's note-firing path.
        console.warn("Audio unavailable:", err);
        return null;
      }
    }
    return audioCtx;
  }

  function playTone(noteNumber, durationSeconds) {
    const ctx = getAudioContext();
    if (!ctx) return;
    const freq = 440 * Math.pow(2, (noteNumber - 69) / 12);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSeconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationSeconds);
  }

  function noteOn(noteNumber) {
    playTone(noteNumber, 0.3);
  }

  function noteOff() {
    // Playback is WebAudio-only now: each note is a fixed-duration envelope
    // started in noteOn, so there's nothing to cut short here.
  }

  return { noteOn, noteOff };
}
```

- [ ] **Step 2: Update `web/ui.js`'s `createMidiOut` call site**

Find this line near the top of `web/ui.js`:

```js
const midiOut = createMidiOut({
  selectEl: document.getElementById("midi-out-select"),
  statusEl: document.getElementById("midi-out-status"),
});
```

Replace it with:

```js
const midiOut = createMidiOut();
```

- [ ] **Step 3: Remove the MIDI Out block from `index.html`**

Delete this block (currently between the `.midi-in-sim` div and the `.pattern-select` div in the `.top-bar`):

```html
      <div class="midi-out">
        <label>
          MIDI Out
          <select id="midi-out-select"><option value="">(none)</option></select>
        </label>
        <span id="midi-out-status">not connected</span>
      </div>
```

- [ ] **Step 4: Update `style.css`'s combined selector**

Find:

```css
.midi-in-sim, .midi-out { display: flex; gap: 12px; align-items: center; }
```

Replace with:

```css
.midi-in-sim { display: flex; gap: 12px; align-items: center; }
```

- [ ] **Step 5: Run the core test suite (unaffected by this task, confirms no regressions)**

Run: `npm test`
Expected: PASS, 20/20 tests, unchanged from before this task.

- [ ] **Step 6: Manually verify in a browser**

Serve the site locally (per the project's `README.md` — `npx serve .` or `python -m http.server`, since `file://` blocks ES modules) and open it.
Expected:
- No "MIDI Out" label, device dropdown, or status text anywhere in the top bar.
- Program a short pattern in Write mode, switch to Play mode, press PLAY: you hear audible square-wave tones for the programmed steps (WebAudio still works).
- No console errors related to `midi-out-select`/`midi-out-status` being missing.

- [ ] **Step 7: Commit**

```bash
git add web/midi.js web/ui.js index.html style.css
git commit -m "feat: remove real MIDI Out, keep WebAudio-only playback"
```

---

### Task 2: MIDI In toggle becomes tempo-source-only; PLAY is the sole transport control

**Files:**
- Modify: `web/ui.js`

**Interfaces:**
- Consumes: `clockSim` from `web/clock-sim.js` (unchanged — `createClockSim({ getBpm, onTick })` still returns `{ start(), stop() }`; only the `getBpm` callback passed to it changes).
- Produces: no change to any exported interface — this task only changes internal wiring inside `web/ui.js`.

- [ ] **Step 1: Remove the MIDI In toggle's write-mode disabling in `setControlsForMode`**

Find:

```js
function setControlsForMode(mode) {
  const isWrite = mode === "write";
  playButton.disabled = isWrite;
  // The MIDI In toggle is the other half of the same transport control, so it
  // is only usable where the PLAY button is.
  midiInToggle.disabled = isWrite;
  keyButtons.forEach((btn) => (btn.disabled = !isWrite));
  stepLeft.disabled = !isWrite;
  stepCenter.disabled = !isWrite;
  stepRight.disabled = !isWrite;
}
```

Replace with:

```js
function setControlsForMode(mode) {
  const isWrite = mode === "write";
  playButton.disabled = isWrite;
  keyButtons.forEach((btn) => (btn.disabled = !isWrite));
  stepLeft.disabled = !isWrite;
  stepCenter.disabled = !isWrite;
  stepRight.disabled = !isWrite;
}
```

(The MIDI In toggle is now always enabled, in both Write and Play mode, since it no longer drives transport state — there's no more desync risk to guard against.)

- [ ] **Step 2: Change the clock's BPM source to consult the toggle**

Find:

```js
const clockSim = createClockSim({
  getBpm: () => bpmInput.value,
  onTick: () => sequencer.handleClockPulse(),
});
```

Replace with:

```js
// The MIDI In (simulated) toggle no longer starts/stops playback — it only
// selects which tempo source drives the clock while PLAY is running.
const clockSim = createClockSim({
  getBpm: () => (midiInToggle.checked ? Number(bpmInput.value) : 120),
  onTick: () => sequencer.handleClockPulse(),
});
```

- [ ] **Step 3: Simplify `syncTransportControls` into a direct `updatePlayButtonLabel` call**

Find:

```js
// Single source of truth for the transport: the PLAY button and the simulated
// MIDI In toggle are two ways to drive the same sequencer + clock state, and
// both are re-synced from the sequencer's actual `running` flag afterwards.
function syncTransportControls() {
  updatePlayButtonLabel();
  midiInToggle.checked = sequencer.getState().running;
}

function startPlayback() {
  sequencer.handleStart(); // no-op unless we're in play mode
  if (sequencer.getState().running) {
    clockSim.start();
  }
  syncTransportControls();
}

function stopPlayback() {
  clockSim.stop();
  sequencer.handleStop();
  syncTransportControls();
}
```

Replace with:

```js
function startPlayback() {
  sequencer.handleStart(); // no-op unless we're in play mode
  if (sequencer.getState().running) {
    clockSim.start();
  }
  updatePlayButtonLabel();
}

function stopPlayback() {
  clockSim.stop();
  sequencer.handleStop();
  updatePlayButtonLabel();
}
```

- [ ] **Step 4: Update the mode-toggle handler's call to `syncTransportControls`**

Find:

```js
modeToggle.addEventListener("change", () => {
  const newMode = modeToggle.checked ? "play" : "write";
  sequencer.setMode(newMode); // clears `running` itself
  setControlsForMode(newMode);
  if (newMode === "write") {
    clockSim.stop();
  }
  syncTransportControls();
});
```

Replace with:

```js
modeToggle.addEventListener("change", () => {
  const newMode = modeToggle.checked ? "play" : "write";
  sequencer.setMode(newMode); // clears `running` itself
  setControlsForMode(newMode);
  if (newMode === "write") {
    clockSim.stop();
  }
  updatePlayButtonLabel();
});
```

(Task 3 replaces this whole handler with a click-based rocker handler — this step just keeps the file consistent in the meantime.)

- [ ] **Step 5: Remove the MIDI In toggle's `change` listener entirely**

Find and delete this whole block:

```js
midiInToggle.addEventListener("change", () => {
  if (midiInToggle.checked) {
    startPlayback();
  } else {
    stopPlayback();
  }
});
```

- [ ] **Step 6: Update the init block**

Find:

```js
setControlsForMode("write");
syncTransportControls();
```

Replace with:

```js
setControlsForMode("write");
updatePlayButtonLabel();
```

- [ ] **Step 7: Run the core test suite (unaffected, confirms no regressions)**

Run: `npm test`
Expected: PASS, 20/20 tests.

- [ ] **Step 8: Manually verify in a browser**

Serve the site locally and open it.
Expected:
- The MIDI In (simulated) checkbox is clickable/enabled in both Write and Play mode (no longer grayed out in Write mode).
- Program a pattern, switch to Play mode, press PLAY with the MIDI In toggle **unchecked**: playback runs at a fixed 120 BPM regardless of whatever value is in the BPM field (try setting the field to e.g. 200 first — tempo should stay at 120).
- Check the MIDI In toggle **while already playing**: tempo should switch live to the BPM field's value.
- Uncheck it again while still playing: playback keeps running (does NOT stop), tempo reverts to 120.
- Press PLAY again to stop: playback stops regardless of the toggle's state.

- [ ] **Step 9: Commit**

```bash
git add web/ui.js
git commit -m "feat: MIDI In toggle becomes tempo-source selector, PLAY is sole transport control"
```

---

### Task 3: Hardware Synth visual redesign — sliding rocker, PLAY moved to bottom-left, full palette

**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Modify: `web/ui.js`

**Interfaces:**
- Consumes: `sequencer.getState().mode` (from `core/sequencer.js`, already returns `"write"` or `"play"` — unchanged) to derive the rocker's current position instead of reading a checkbox's `.checked`.
- Produces: no change to any function signature consumed by other tasks — this is the final task in the plan.

- [ ] **Step 1: Restructure `index.html`**

Replace the entire `<body>` content with:

```html
<body>
  <div class="panel">
    <div class="top-bar">
      <div class="mode-switch">
        <span class="mode-label" data-side="write">WRITE</span>
        <button type="button" id="mode-toggle" class="rocker" role="switch" aria-checked="false" aria-label="Write or Play mode">
          <span class="rocker-tab"></span>
        </button>
        <span class="mode-label" data-side="play">PLAY</span>
      </div>

      <div class="midi-in-sim">
        <label>
          <input type="checkbox" id="midi-in-toggle" />
          MIDI In (simulated)
        </label>
        <label>
          BPM
          <input type="number" id="bpm-input" min="20" max="300" value="120" />
        </label>
      </div>

      <div class="pattern-select placeholder" aria-disabled="true">
        <span>PATTERN SELECT</span>
        <div class="dial"></div>
        <span class="pattern-number">1</span>
        <button class="clear-pattern" disabled>CLEAR PATTERN</button>
      </div>
    </div>

    <div class="led-row" id="led-row"></div>

    <div class="bottom-row">
      <div class="bottom-left">
        <div class="oct placeholder" aria-disabled="true">
          <span>OCT</span>
          <button disabled>+</button>
          <button disabled>-</button>
        </div>
        <button id="play-button" class="play-button" disabled aria-label="Play or stop">
          <span class="play-icon"></span>
        </button>
      </div>

      <div class="keyboard" id="keyboard"></div>

      <div class="step-nav">
        <button id="step-left" aria-label="Move cursor left">&#9664;</button>
        <button id="step-center" aria-label="Toggle mute">&#9632;</button>
        <button id="step-right" aria-label="Move cursor right">&#9654;</button>
      </div>
    </div>
  </div>

  <script type="module" src="web/ui.js"></script>
</body>
```

(Note: the `<head>` is unchanged — only `<body>` content changes. The PLAY button now sits above/beside the OCT placeholder in a `.bottom-left` group, matching the original hardware sketch's left column, and is now an icon-only button instead of text.)

- [ ] **Step 2: Replace `style.css` in full**

Replace the entire contents of `style.css` with:

```css
:root {
  --bg: #0c0d0f;
  --panel-bg: #15171a;
  --panel-border: #2a2d32;
  --recessed-bg: #1e2126;
  --recessed-border: #35383e;
  --well-bg: #0c0d0f;
  --raised-top: #5b6068;
  --raised-bottom: #34373c;
  --raised-border: #46494f;
  --text-muted: #7d838d;
  --text-fg: #c7cbd1;
  --accent-gold: #e8c15a;
  --accent-gold-dark: #caa227;
  --accent-gold-glow: rgba(232, 193, 90, 0.6);
  --led-off: #1e2126;
  --led-off-border: #2a2d32;
  --led-yellow: #ffe28a;
  --led-yellow-dark: #caa227;
  --led-yellow-glow: rgba(255, 210, 90, 0.7);
  --led-green: #7dffb0;
  --led-green-dark: #1f9a52;
  --led-green-glow: rgba(60, 255, 140, 0.6);
  --led-dim-green: #1a5c22;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text-fg);
  font-family: system-ui, sans-serif;
  display: flex;
  justify-content: center;
  padding: 24px;
}

.panel {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  padding: 22px;
  width: 100%;
  max-width: 900px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.top-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding-bottom: 18px;
  border-bottom: 1px solid #24262b;
  margin-bottom: 20px;
}

.mode-switch { display: flex; align-items: center; gap: 10px; }

.mode-label {
  font: 11px/1 monospace;
  letter-spacing: 1px;
  color: var(--text-muted);
}
.mode-label.is-active { color: var(--accent-gold); }

.rocker {
  width: 72px;
  height: 30px;
  padding: 3px;
  border: 1px solid var(--recessed-border);
  border-radius: 6px;
  background: linear-gradient(180deg, var(--well-bg), var(--recessed-bg));
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.6);
  position: relative;
  cursor: pointer;
}

.rocker-tab {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 32px;
  height: 22px;
  border-radius: 4px;
  background: linear-gradient(180deg, var(--raised-top), var(--raised-bottom));
  box-shadow: 0 2px 3px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.15);
  transition: left 0.15s ease;
}
.rocker.is-play .rocker-tab { left: 37px; }

.midi-in-sim {
  display: flex;
  gap: 12px;
  align-items: center;
  font: 10px/1 monospace;
  color: var(--text-muted);
  letter-spacing: 0.5px;
}
.midi-in-sim label { display: flex; align-items: center; gap: 6px; }
#bpm-input {
  width: 52px;
  background: var(--well-bg);
  border: 1px solid var(--recessed-border);
  border-radius: 4px;
  color: var(--text-fg);
  font: 11px/1 monospace;
  padding: 4px 6px;
}

.placeholder { opacity: 0.35; }

.led-row {
  display: flex;
  gap: 24px;
  justify-content: space-between;
  padding: 20px 0;
  border-bottom: 1px solid #24262b;
  margin-bottom: 20px;
}
.led-group { display: flex; gap: 9px; }
.led {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--led-off);
  border: 1px solid var(--led-off-border);
}
.led.yellow {
  background: radial-gradient(circle at 35% 35%, var(--led-yellow), var(--led-yellow-dark));
  box-shadow: 0 0 8px var(--led-yellow-glow);
  border-color: transparent;
}
.led.green {
  background: radial-gradient(circle at 35% 35%, var(--led-green), var(--led-green-dark));
  box-shadow: 0 0 8px var(--led-green-glow);
  border-color: transparent;
}
.led.dim-green { background: var(--led-dim-green); border-color: transparent; }

.bottom-row {
  display: flex;
  gap: 20px;
  align-items: flex-end;
}

.bottom-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.oct {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 48px;
  font: 10px/1 monospace;
  color: var(--text-muted);
  text-align: center;
}
.oct button {
  background: linear-gradient(180deg, var(--raised-top), var(--raised-bottom));
  border: 1px solid var(--raised-border);
  border-radius: 4px;
  color: var(--text-fg);
  padding: 4px 0;
}

.play-button {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  background: radial-gradient(circle at 35% 30%, var(--raised-top), var(--raised-bottom));
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.15);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.play-button:disabled { opacity: 0.4; cursor: not-allowed; }
.play-button.is-running {
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.15), 0 0 14px var(--accent-gold-glow);
}
.play-icon {
  width: 0;
  height: 0;
  border-top: 10px solid transparent;
  border-bottom: 10px solid transparent;
  border-left: 15px solid var(--accent-gold);
  margin-left: 3px;
  filter: drop-shadow(0 0 4px var(--accent-gold-glow));
  display: block;
}

/* 7 equal white keys, 5 black keys overlaid at the correct semitone
   boundaries (none between E-F or B-C), centered and capped in width. */
.keyboard {
  display: flex;
  gap: 3px;
  height: 110px;
  flex: 1;
  max-width: 480px;
  justify-content: center;
}
.key { border: 1px solid #999; cursor: pointer; }
.key.white {
  width: 40px;
  background: linear-gradient(180deg, #f2f2f0, #d8d8d5);
  border-radius: 0 0 4px 4px;
}
.key.black {
  width: 22px;
  height: 68px;
  margin-left: -11px;
  margin-right: -11px;
  background: #161616;
  border: none;
  border-radius: 0 0 3px 3px;
  box-shadow: 0 2px 3px rgba(0, 0, 0, 0.5);
  z-index: 1;
}
.key:disabled { cursor: not-allowed; opacity: 0.5; }

.step-nav { display: flex; gap: 8px; flex-shrink: 0; }
.step-nav button {
  width: 34px;
  height: 34px;
  border-radius: 6px;
  border: 1px solid var(--raised-border);
  background: linear-gradient(180deg, var(--raised-top), var(--raised-bottom));
  box-shadow: 0 2px 3px rgba(0, 0, 0, 0.4);
  color: var(--text-muted);
  cursor: pointer;
}
.step-nav button:disabled { opacity: 0.4; cursor: not-allowed; }
```

- [ ] **Step 3: Rewrite the mode-switch wiring in `web/ui.js`**

Add this new `const` near the other `document.getElementById` declarations at the top of the file (after the `stepRight` line):

```js
const modeLabels = document.querySelectorAll(".mode-label");
```

Find the `modeToggle.addEventListener("change", ...)` block (as left by Task 2):

```js
modeToggle.addEventListener("change", () => {
  const newMode = modeToggle.checked ? "play" : "write";
  sequencer.setMode(newMode); // clears `running` itself
  setControlsForMode(newMode);
  if (newMode === "write") {
    clockSim.stop();
  }
  updatePlayButtonLabel();
});
```

Replace it with:

```js
function applyMode(newMode) {
  sequencer.setMode(newMode); // clears `running` itself
  setControlsForMode(newMode);
  modeToggle.setAttribute("aria-checked", String(newMode === "play"));
  modeToggle.classList.toggle("is-play", newMode === "play");
  modeLabels.forEach((label) => {
    label.classList.toggle("is-active", label.dataset.side === newMode);
  });
  if (newMode === "write") {
    clockSim.stop();
  }
  updatePlayButtonState();
}

modeToggle.addEventListener("click", () => {
  const currentMode = sequencer.getState().mode;
  applyMode(currentMode === "write" ? "play" : "write");
});
```

(`modeToggle` is now a `<button>`, not a checkbox — `index.html`'s `id="mode-toggle"` is unchanged, so the existing `const modeToggle = document.getElementById("mode-toggle");` line needs no change.)

- [ ] **Step 4: Rename `updatePlayButtonLabel` to `updatePlayButtonState` and change its implementation**

Find:

```js
function updatePlayButtonLabel() {
  playButton.textContent = sequencer.getState().running ? "STOP" : "PLAY";
}
```

Replace with:

```js
function updatePlayButtonState() {
  playButton.classList.toggle("is-running", sequencer.getState().running);
}
```

Then update its three call sites (in `startPlayback`, `stopPlayback`, and the `applyMode` function from Step 3) from `updatePlayButtonLabel()` to `updatePlayButtonState()`.

- [ ] **Step 5: Update the init block to use `applyMode`**

Find:

```js
setControlsForMode("write");
updatePlayButtonLabel();
```

Replace with:

```js
applyMode("write");
```

- [ ] **Step 6: Run the core test suite (unaffected, confirms no regressions)**

Run: `npm test`
Expected: PASS, 20/20 tests.

- [ ] **Step 7: Manually verify in a browser against the approved design**

Serve the site locally and open it.
Expected, compared to the approved mockup (dark panel, sliding rocker, bottom-left PLAY, centered wide keyboard):
- Panel renders as a dark rounded rectangle with the described palette — no leftover default browser control styling (no native checkbox visible for the mode switch).
- Clicking the rocker track (anywhere on it) slides the tab from left (Write) to right (Play) and back; the WRITE/PLAY labels change gold/muted to match.
- Clicking the rocker still correctly puts the sequencer in the right mode — same functional behavior as the old checkbox (keyboard/step-nav enabled in Write, PLAY enabled in Play).
- The circular PLAY button sits at the bottom-left, above/beside the dimmed OCT placeholder, with a gold triangle icon; it gains a gold glow while playback is running and loses it when stopped.
- The keyboard is centered in the bottom row and visibly wider than before; black keys sit at the correct boundaries (between C-D, D-E, F-G, G-A, A-B — not between E-F or B-C).
- LEDs glow appropriately: yellow (write cursor) has a warm glow, green (programmed/playing) has a green glow, dim-green and off are flat, unlit-looking colors.
- No console errors.

- [ ] **Step 8: Commit**

```bash
git add index.html style.css web/ui.js
git commit -m "feat: hardware-synth visual redesign with sliding rocker and relocated PLAY button"
```

---

## Self-Review Notes

- **Spec coverage:** MIDI Out removal (Task 1), MIDI In toggle → tempo-source-only + PLAY sole transport (Task 2), sliding rocker + PLAY relocation + full palette + keyboard widen/center (Task 3) — every section of the design spec maps to a task. Keyboard note/key ordering was verified already correct in the existing `KEYBOARD_NOTES` array, so no data changes were needed, only CSS sizing.
- **Placeholder scan:** no TBD/TODO markers; every step includes complete, literal code to write or the exact find/replace text against the current file contents (verified by reading the actual current files before writing this plan).
- **Type consistency:** `createMidiOut()`'s new no-argument signature (Task 1) matches its only call site (also Task 1, same task). `applyMode`/`updatePlayButtonState` (Task 3) are used consistently at all three call sites within the same task. No function signature introduced in one task is contradicted by a later task.
