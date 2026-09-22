# MIDI Controller Web Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static, no-build-step website that simulates the ESP32 MIDI step-sequencer controller's front panel: a 16-step/1-bar sequencer with a simulated (toggle + BPM) MIDI In clock, real Web MIDI Out (plus an audible WebAudio voice), Write/Play modes, an RGB-style LED step row, a 1-octave note keyboard, and a left/right/center step-nav cluster.

**Architecture:** `core/sequencer.js` is a pure, dependency-free JS module owning all sequencer state and behavior (the piece meant to be re-implemented on the ESP32 later); `web/clock-sim.js` and `web/midi.js` are thin browser adapters (simulated MIDI In, real MIDI Out + audio); `web/ui.js` wires DOM elements to the core and adapters. `index.html`/`style.css` render the panel layout from the sketch.

**Tech Stack:** Plain JavaScript ES modules, no framework, no bundler. Node's built-in test runner (`node:test` + `node:assert/strict`) for the core module's automated tests — zero npm dependencies. Web MIDI API + Web Audio API in the browser. `localStorage` for pattern persistence.

## Global Constraints

- No build step — all files must run directly as static assets (openable via `index.html`, deployable to Netlify/GitHub Pages as-is).
- `core/sequencer.js` must have zero DOM, Web MIDI, or browser-global dependencies — it's the piece intended for later ESP32 porting.
- 16 steps per pattern, each step = one 1/16 note; MIDI clock is 24 pulses per quarter note, so **6 clock pulses = 1 step**.
- Note gate length is **50%**: note-off fires **3 pulses** after note-on.
- MIDI In is fully simulated for this phase (on/off toggle = transport start/stop, settable BPM field drives the internal clock) — no real Web MIDI input device is used.
- MIDI Out is real via the Web MIDI API, plus an audible WebAudio voice so playback is audible with no device attached.
- Keyboard covers exactly 1 octave (12 keys, piano-style black/white layout).
- Pattern (`note`/`muted` per step) autosaves to `localStorage` on every edit and restores on page load.
- LED colors: `"off"`, `"yellow"` (Write-mode cursor), `"green"` (programmed+unmuted, or actively playing), `"dim-green"` (programmed+muted).

---

## File Structure

```
adam_controller/
  index.html
  style.css
  package.json
  core/
    sequencer.js
  test/
    sequencer.test.js
  web/
    clock-sim.js
    midi.js
    ui.js
```

---

### Task 1: Project scaffold + core sequencer — Write-mode behavior

**Files:**
- Create: `package.json`
- Create: `core/sequencer.js`
- Test: `test/sequencer.test.js`

**Interfaces:**
- Produces: `createSequencer({ onLedChange, onNoteOn, onNoteOff })` returning
  `{ setMode(mode), moveCursor(delta), toggleMute(), inputNote(noteNumber), handleClockPulse(), handleStart(), handleStop(), handleContinue(), getPattern(), loadPattern(saved), emitAllLeds(), getState() }`.
  - `onLedChange(index: 0-15, color: "off"|"yellow"|"green"|"dim-green")`
  - `onNoteOn(noteNumber: number)`, `onNoteOff(noteNumber: number)`
  - `getState()` returns `{ cursor, playhead, mode, running }`
  - `getPattern()` returns `Array<{ note: number|null, muted: boolean }>` (length 16)
- This task implements everything except clock/play-mode timing (Task 2) and persistence helpers' full behavior (Task 3 adds `getPattern`/`loadPattern` tests, but the functions are written here since `getPattern` is needed to inspect state in this task's own tests).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "adam-controller",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/"
  }
}
```

- [ ] **Step 2: Write the failing tests for Write-mode behavior**

Create `test/sequencer.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSequencer } from "../core/sequencer.js";

function makeHarness() {
  const ledColors = new Array(16).fill(null);
  const notesOn = [];
  const notesOff = [];
  const sequencer = createSequencer({
    onLedChange: (index, color) => {
      ledColors[index] = color;
    },
    onNoteOn: (note) => notesOn.push(note),
    onNoteOff: (note) => notesOff.push(note),
  });
  return { sequencer, ledColors, notesOn, notesOff };
}

test("starts in write mode with step 0 as yellow cursor, rest off", () => {
  const { sequencer, ledColors } = makeHarness();
  sequencer.emitAllLeds();
  assert.equal(ledColors[0], "yellow");
  for (let i = 1; i < 16; i++) {
    assert.equal(ledColors[i], "off");
  }
});

test("inputNote records the note, turns the step green, and advances cursor", () => {
  const { sequencer, ledColors } = makeHarness();
  sequencer.inputNote(60);
  assert.equal(ledColors[0], "green");
  assert.equal(ledColors[1], "yellow");
  assert.equal(sequencer.getPattern()[0].note, 60);
  assert.equal(sequencer.getPattern()[0].muted, false);
  assert.equal(sequencer.getState().cursor, 1);
});

test("inputNote wraps cursor from step 15 back to step 0", () => {
  const { sequencer } = makeHarness();
  for (let i = 0; i < 16; i++) {
    sequencer.inputNote(60 + i);
  }
  assert.equal(sequencer.getState().cursor, 0);
});

test("moveCursor moves left/right and wraps", () => {
  const { sequencer, ledColors } = makeHarness();
  sequencer.moveCursor(-1);
  assert.equal(sequencer.getState().cursor, 15);
  assert.equal(ledColors[15], "yellow");
  assert.equal(ledColors[0], "off");

  sequencer.moveCursor(1);
  assert.equal(sequencer.getState().cursor, 0);
});

test("toggleMute dims a programmed step but keeps its note", () => {
  const { sequencer, ledColors } = makeHarness();
  sequencer.inputNote(60);
  sequencer.moveCursor(-1); // back to step 0
  sequencer.toggleMute();
  assert.equal(ledColors[0], "dim-green");
  assert.equal(sequencer.getPattern()[0].note, 60);
  assert.equal(sequencer.getPattern()[0].muted, true);

  sequencer.toggleMute();
  assert.equal(ledColors[0], "green");
  assert.equal(sequencer.getPattern()[0].muted, false);
});

test("inputNote while muted overwrites the note and un-mutes", () => {
  const { sequencer } = makeHarness();
  sequencer.inputNote(60);
  sequencer.moveCursor(-1);
  sequencer.toggleMute();
  sequencer.inputNote(64);
  assert.equal(sequencer.getPattern()[0].note, 64);
  assert.equal(sequencer.getPattern()[0].muted, false);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `core/sequencer.js` does not exist yet (module not found).

- [ ] **Step 4: Implement `core/sequencer.js` (Write-mode parts; Play-mode stubs)**

```js
export const LED_OFF = "off";
export const LED_YELLOW = "yellow";
export const LED_GREEN = "green";
export const LED_DIM_GREEN = "dim-green";

const STEP_COUNT = 16;

export function createSequencer({ onLedChange, onNoteOn, onNoteOff }) {
  const pattern = Array.from({ length: STEP_COUNT }, () => ({ note: null, muted: false }));
  let cursor = 0;
  let playhead = 0;
  let mode = "write";
  let running = false;
  let clockPulseCount = 0;
  let activeNote = null;
  let gatePulsesRemaining = null;

  function ledColorForStep(index) {
    if (mode === "write") {
      if (index === cursor) return LED_YELLOW;
      const step = pattern[index];
      if (step.note === null) return LED_OFF;
      return step.muted ? LED_DIM_GREEN : LED_GREEN;
    }
    // play mode: only the actively-sounding step lights up
    return index === playhead && activeNote !== null ? LED_GREEN : LED_OFF;
  }

  function emitAllLeds() {
    for (let i = 0; i < STEP_COUNT; i++) {
      onLedChange(i, ledColorForStep(i));
    }
  }

  function setMode(newMode) {
    if (newMode !== "write" && newMode !== "play") {
      throw new Error(`Unknown mode: ${newMode}`);
    }
    if (newMode === mode) return;
    mode = newMode;
    running = false;
    clockPulseCount = 0;
    activeNote = null;
    gatePulsesRemaining = null;
    if (newMode === "play") {
      playhead = 0;
    }
    emitAllLeds();
  }

  function moveCursor(delta) {
    if (mode !== "write") return;
    cursor = (cursor + delta + STEP_COUNT) % STEP_COUNT;
    emitAllLeds();
  }

  function toggleMute() {
    if (mode !== "write") return;
    pattern[cursor].muted = !pattern[cursor].muted;
    emitAllLeds();
  }

  function inputNote(noteNumber) {
    if (mode !== "write") return;
    pattern[cursor] = { note: noteNumber, muted: false };
    cursor = (cursor + 1) % STEP_COUNT;
    emitAllLeds();
  }

  // Play-mode / clock behavior implemented in Task 2.
  function handleClockPulse() {}
  function handleStart() {}
  function handleStop() {}
  function handleContinue() {}

  function getPattern() {
    return pattern.map((step) => ({ ...step }));
  }

  function loadPattern(saved) {
    if (!Array.isArray(saved) || saved.length !== STEP_COUNT) return;
    for (let i = 0; i < STEP_COUNT; i++) {
      const entry = saved[i] || {};
      pattern[i] = {
        note: typeof entry.note === "number" ? entry.note : null,
        muted: Boolean(entry.muted),
      };
    }
    emitAllLeds();
  }

  function getState() {
    return { cursor, playhead, mode, running };
  }

  return {
    setMode,
    moveCursor,
    toggleMute,
    inputNote,
    handleClockPulse,
    handleStart,
    handleStop,
    handleContinue,
    getPattern,
    loadPattern,
    emitAllLeds,
    getState,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (all 6 tests green).

- [ ] **Step 6: Commit**

```bash
git add package.json core/sequencer.js test/sequencer.test.js
git commit -m "feat: add core sequencer write-mode state machine"
```

---

### Task 2: Core sequencer — Play-mode, clock, and gate timing

**Files:**
- Modify: `core/sequencer.js`
- Test: `test/sequencer.test.js`

**Interfaces:**
- Consumes: the `createSequencer` scaffold and internal state from Task 1 (`mode`, `pattern`, `playhead`, `running`, `clockPulseCount`, `activeNote`, `gatePulsesRemaining`, `emitAllLeds`, `ledColorForStep`).
- Produces: working `handleClockPulse()`, `handleStart()`, `handleStop()`, `handleContinue()` — later tasks (web adapters) call these directly.

- [ ] **Step 1: Write the failing tests for Play-mode/clock behavior**

Append to `test/sequencer.test.js`:

```js
test("handleClockPulse does nothing while not running", () => {
  const { sequencer, notesOn } = makeHarness();
  sequencer.setMode("play");
  for (let i = 0; i < 12; i++) sequencer.handleClockPulse();
  assert.equal(notesOn.length, 0);
  assert.equal(sequencer.getState().playhead, 0);
});

test("advances one step every 6 clock pulses while running, firing note-on once per revolution for a programmed step", () => {
  const { sequencer, notesOn } = makeHarness();
  sequencer.inputNote(60); // step 0 = note 60, cursor advances to 1
  sequencer.setMode("play"); // playhead reset to 0
  sequencer.handleStart();

  for (let i = 0; i < 5; i++) sequencer.handleClockPulse();
  assert.equal(notesOn.length, 0); // not yet at the 6th pulse

  sequencer.handleClockPulse(); // 6th pulse: advance to step 1 (empty, no note)
  assert.equal(sequencer.getState().playhead, 1);
  assert.equal(notesOn.length, 0);

  // Advance through steps 2..15 and wrap back around to step 0 (15 more
  // step-advances = 15 * 6 = 90 pulses), where the programmed note lives.
  for (let i = 0; i < 15 * 6; i++) sequencer.handleClockPulse();
  assert.equal(sequencer.getState().playhead, 0);
  assert.equal(notesOn.length, 1);
  assert.equal(notesOn[0], 60);
});

test("fires note-off exactly 3 pulses (50% gate) after note-on, and skips muted/empty steps", () => {
  const { sequencer, notesOn, notesOff } = makeHarness();
  sequencer.inputNote(60); // step 0
  sequencer.setMode("play");
  sequencer.handleStart();

  // 16 step-advances (1 + 15) bring the playhead all the way around back to
  // step 0, where the programmed note fires.
  for (let i = 0; i < 6; i++) sequencer.handleClockPulse();
  for (let i = 0; i < 15 * 6; i++) sequencer.handleClockPulse();
  assert.equal(sequencer.getState().playhead, 0);
  assert.equal(notesOn.length, 1);
  assert.equal(notesOff.length, 0);

  sequencer.handleClockPulse();
  sequencer.handleClockPulse();
  assert.equal(notesOff.length, 0);
  sequencer.handleClockPulse(); // 3rd pulse since note-on: gate closes
  assert.equal(notesOff.length, 1);
  assert.equal(notesOff[0], 60);
});

test("handleStop halts playback, cuts any active note, and resets pulse count", () => {
  const { sequencer, notesOff } = makeHarness();
  sequencer.inputNote(60);
  sequencer.setMode("play");
  sequencer.handleStart();
  // 16 step-advances bring the playhead back around to step 0, triggering the note.
  for (let i = 0; i < 16 * 6; i++) sequencer.handleClockPulse();
  sequencer.handleStop();
  assert.equal(notesOff.length, 1);
  assert.equal(sequencer.getState().running, false);
});

test("switching to write mode while playing stops the transport", () => {
  const { sequencer } = makeHarness();
  sequencer.setMode("play");
  sequencer.handleStart();
  sequencer.setMode("write");
  assert.equal(sequencer.getState().running, false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `handleClockPulse`/`handleStart`/`handleStop` are no-ops from Task 1, so note-on/off assertions fail.

- [ ] **Step 3: Implement Play-mode/clock behavior in `core/sequencer.js`**

Replace the Task 1 stub functions with:

```js
  function handleStart() {
    if (mode !== "play") return;
    running = true;
  }

  function handleStop() {
    running = false;
    clockPulseCount = 0;
    if (activeNote !== null) {
      onNoteOff(activeNote);
      activeNote = null;
      gatePulsesRemaining = null;
    }
    emitAllLeds();
  }

  function handleContinue() {
    if (mode !== "play") return;
    running = true;
  }

  function handleClockPulse() {
    if (!running) return;

    if (gatePulsesRemaining !== null) {
      gatePulsesRemaining -= 1;
      if (gatePulsesRemaining <= 0) {
        onNoteOff(activeNote);
        activeNote = null;
        gatePulsesRemaining = null;
        emitAllLeds();
      }
    }

    clockPulseCount += 1;
    if (clockPulseCount >= 6) {
      clockPulseCount = 0;
      advanceStep();
    }
  }

  function advanceStep() {
    playhead = (playhead + 1) % STEP_COUNT;
    const step = pattern[playhead];
    if (!step.muted && step.note !== null) {
      onNoteOn(step.note);
      activeNote = step.note;
      gatePulsesRemaining = 3;
    }
    emitAllLeds();
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add core/sequencer.js test/sequencer.test.js
git commit -m "feat: add play-mode clock, step advance, and gate timing"
```

---

### Task 3: Core sequencer — pattern persistence round-trip tests

**Files:**
- Test: `test/sequencer.test.js`

**Interfaces:**
- Consumes: `getPattern()`/`loadPattern(saved)` from Task 1 (already implemented; this task only adds test coverage since persistence wiring in the browser depends on this contract being solid).

- [ ] **Step 1: Write the failing tests for persistence round-trip**

Append to `test/sequencer.test.js`:

```js
test("getPattern reflects programmed notes and mute state", () => {
  const { sequencer } = makeHarness();
  sequencer.inputNote(60);
  sequencer.moveCursor(-1);
  sequencer.toggleMute();
  const pattern = sequencer.getPattern();
  assert.equal(pattern.length, 16);
  assert.deepEqual(pattern[0], { note: 60, muted: true });
  assert.deepEqual(pattern[1], { note: null, muted: false });
});

test("loadPattern restores a saved pattern and re-renders LEDs", () => {
  const { sequencer, ledColors } = makeHarness();
  const saved = Array.from({ length: 16 }, (_, i) => ({
    note: i === 3 ? 67 : null,
    muted: i === 3,
  }));
  sequencer.loadPattern(saved);
  assert.deepEqual(sequencer.getPattern()[3], { note: 67, muted: true });
  assert.equal(ledColors[3], "dim-green");
});

test("loadPattern ignores malformed input instead of throwing", () => {
  const { sequencer } = makeHarness();
  sequencer.inputNote(60);
  assert.doesNotThrow(() => sequencer.loadPattern(null));
  assert.doesNotThrow(() => sequencer.loadPattern([{ note: 1 }]));
  assert.equal(sequencer.getPattern()[0].note, 60);
});
```

- [ ] **Step 2: Run the tests to verify they fail or pass**

Run: `npm test`
Expected: These should already PASS, since `getPattern`/`loadPattern` were implemented in Task 1. This step confirms that contract is correct before web code depends on it. If any fail, fix `getPattern`/`loadPattern` in `core/sequencer.js` until they pass.

- [ ] **Step 3: Commit**

```bash
git add test/sequencer.test.js
git commit -m "test: cover pattern persistence round-trip"
```

---

### Task 4: Static panel markup and styling

**Files:**
- Create: `index.html`
- Create: `style.css`

**Interfaces:**
- Produces: the DOM element IDs/classes that `web/ui.js` (Task 5) attaches behavior to:
  `#mode-toggle`, `#play-button`, `#midi-in-toggle`, `#bpm-input`, `#midi-out-select`, `#midi-out-status`, `#led-row`, `#keyboard`, `#step-left`, `#step-center`, `#step-right`.

- [ ] **Step 1: Create `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Adam Controller Simulator</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div class="panel">
    <div class="top-bar">
      <div class="mode-switch">
        <span>WRITE</span>
        <label class="toggle">
          <input type="checkbox" id="mode-toggle" />
          <span class="toggle-track"></span>
        </label>
        <span>PLAY</span>
      </div>

      <button id="play-button" class="play-button" disabled>PLAY</button>

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

      <div class="midi-out">
        <label>
          MIDI Out
          <select id="midi-out-select"><option value="">(none)</option></select>
        </label>
        <span id="midi-out-status">not connected</span>
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
      <div class="oct placeholder" aria-disabled="true">
        <span>OCT</span>
        <button disabled>+</button>
        <button disabled>-</button>
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
</html>
```

- [ ] **Step 2: Create `style.css`**

```css
:root {
  --led-off: #333;
  --led-yellow: #f5d90a;
  --led-green: #2ecc40;
  --led-dim-green: #1a5c22;
  --panel-bg: #1e1e1e;
  --panel-fg: #eee;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: #0d0d0d;
  color: var(--panel-fg);
  font-family: system-ui, sans-serif;
  display: flex;
  justify-content: center;
  padding: 24px;
}

.panel {
  background: var(--panel-bg);
  border-radius: 12px;
  padding: 24px;
  width: 100%;
  max-width: 900px;
}

.top-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: center;
  padding-bottom: 16px;
  border-bottom: 1px solid #444;
}

.mode-switch { display: flex; align-items: center; gap: 8px; }

.play-button {
  padding: 8px 20px;
  border-radius: 6px;
  border: none;
  background: #444;
  color: var(--panel-fg);
  cursor: pointer;
}
.play-button:disabled { opacity: 0.4; cursor: not-allowed; }

.midi-in-sim, .midi-out { display: flex; gap: 12px; align-items: center; }

.placeholder { opacity: 0.35; }

.led-row {
  display: flex;
  gap: 24px;
  justify-content: space-between;
  padding: 24px 0;
  border-bottom: 1px solid #444;
}

.led-group { display: flex; gap: 10px; }

.led {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--led-off);
  border: 2px solid #000;
}
.led.yellow { background: var(--led-yellow); }
.led.green { background: var(--led-green); }
.led.dim-green { background: var(--led-dim-green); }

.bottom-row {
  display: flex;
  gap: 24px;
  align-items: flex-end;
  padding-top: 20px;
}

.oct { display: flex; flex-direction: column; gap: 4px; width: 48px; }

.keyboard { display: flex; gap: 2px; flex: 1; height: 100px; }

.key {
  border: 1px solid #000;
  cursor: pointer;
}
.key.white { background: #eee; flex: 1; }
.key.black {
  background: #111;
  width: 28px;
  margin-left: -14px;
  margin-right: -14px;
  height: 60px;
  z-index: 1;
}
.key:disabled { cursor: not-allowed; opacity: 0.5; }

.step-nav { display: flex; gap: 8px; }
.step-nav button {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  border: none;
  background: #444;
  color: var(--panel-fg);
  cursor: pointer;
}
.step-nav button:disabled { opacity: 0.4; cursor: not-allowed; }
```

- [ ] **Step 3: Manually verify the static layout**

Open `index.html` directly in a browser (double-click, or `start index.html` on Windows).
Expected: panel renders with top bar controls, an empty LED row area, an empty keyboard area, and the step-nav cluster — no JavaScript errors in the console (the empty `#led-row`/`#keyboard` containers are expected until Task 5 populates them).

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "feat: add static panel markup and styling"
```

---

### Task 5: `web/ui.js` — wire core sequencer to the DOM, with persistence

**Files:**
- Create: `web/ui.js`

**Interfaces:**
- Consumes: `createSequencer` from `core/sequencer.js` (Task 1-3); DOM elements/IDs from `index.html` (Task 4).
- Produces: nothing consumed by later tasks directly, but defines `KEYBOARD_NOTES` (12 entries, MIDI notes 60-71) referenced conceptually by Task 6/7's manual test steps.

- [ ] **Step 1: Implement `web/ui.js`**

```js
import { createSequencer } from "../core/sequencer.js";

const PATTERN_STORAGE_KEY = "adam-controller-pattern";

const KEYBOARD_NOTES = [
  { note: 60, label: "C", type: "white" },
  { note: 61, label: "C#", type: "black" },
  { note: 62, label: "D", type: "white" },
  { note: 63, label: "D#", type: "black" },
  { note: 64, label: "E", type: "white" },
  { note: 65, label: "F", type: "white" },
  { note: 66, label: "F#", type: "black" },
  { note: 67, label: "G", type: "white" },
  { note: 68, label: "G#", type: "black" },
  { note: 69, label: "A", type: "white" },
  { note: 70, label: "A#", type: "black" },
  { note: 71, label: "B", type: "white" },
];

const ledRow = document.getElementById("led-row");
const keyboardEl = document.getElementById("keyboard");
const modeToggle = document.getElementById("mode-toggle");
const playButton = document.getElementById("play-button");
const midiInToggle = document.getElementById("midi-in-toggle");
const bpmInput = document.getElementById("bpm-input");
const stepLeft = document.getElementById("step-left");
const stepCenter = document.getElementById("step-center");
const stepRight = document.getElementById("step-right");

const ledElements = [];
for (let group = 0; group < 4; group++) {
  const groupEl = document.createElement("div");
  groupEl.className = "led-group";
  for (let i = 0; i < 4; i++) {
    const index = group * 4 + i;
    const led = document.createElement("div");
    led.className = "led off";
    led.dataset.index = String(index);
    groupEl.appendChild(led);
    ledElements[index] = led;
  }
  ledRow.appendChild(groupEl);
}

const keyButtons = KEYBOARD_NOTES.map(({ note, label, type }) => {
  const button = document.createElement("button");
  button.className = `key ${type}`;
  button.dataset.note = String(note);
  button.title = label;
  button.disabled = true; // enabled only in write mode
  keyboardEl.appendChild(button);
  return button;
});

function persistPattern() {
  localStorage.setItem(PATTERN_STORAGE_KEY, JSON.stringify(sequencer.getPattern()));
}

function updatePlayButtonLabel() {
  playButton.textContent = sequencer.getState().running ? "STOP" : "PLAY";
}

function setControlsForMode(mode) {
  const isWrite = mode === "write";
  playButton.disabled = isWrite;
  keyButtons.forEach((btn) => (btn.disabled = !isWrite));
  stepLeft.disabled = !isWrite;
  stepCenter.disabled = !isWrite;
  stepRight.disabled = !isWrite;
}

const sequencer = createSequencer({
  onLedChange: (index, color) => {
    ledElements[index].className = `led ${color}`;
  },
  onNoteOn: (note) => {
    midiOut.noteOn(note);
  },
  onNoteOff: (note) => {
    midiOut.noteOff(note);
  },
});

modeToggle.addEventListener("change", () => {
  const newMode = modeToggle.checked ? "play" : "write";
  sequencer.setMode(newMode);
  setControlsForMode(newMode);
  if (newMode === "write" && midiInToggle.checked) {
    midiInToggle.checked = false;
    clockSim.stop();
  }
  updatePlayButtonLabel();
});

playButton.addEventListener("click", () => {
  const { running } = sequencer.getState();
  if (running) {
    sequencer.handleStop();
  } else {
    sequencer.handleStart();
  }
  updatePlayButtonLabel();
});

midiInToggle.addEventListener("change", () => {
  if (midiInToggle.checked) {
    sequencer.handleStart();
    clockSim.start();
  } else {
    clockSim.stop();
    sequencer.handleStop();
  }
  updatePlayButtonLabel();
});

keyButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    sequencer.inputNote(Number(btn.dataset.note));
    persistPattern();
  });
});

stepLeft.addEventListener("click", () => sequencer.moveCursor(-1));
stepRight.addEventListener("click", () => sequencer.moveCursor(1));
stepCenter.addEventListener("click", () => {
  sequencer.toggleMute();
  persistPattern();
});

setControlsForMode("write");

const saved = localStorage.getItem(PATTERN_STORAGE_KEY);
if (saved) {
  try {
    sequencer.loadPattern(JSON.parse(saved));
  } catch {
    sequencer.emitAllLeds();
  }
} else {
  sequencer.emitAllLeds();
}
```

Note: this file references `midiOut` and `clockSim`, which don't exist yet — Tasks 6 and 7 create them and this file's imports are updated then. For this task, temporarily stub them so the panel is testable in isolation:

- [ ] **Step 2: Add temporary stubs so Task 5 is independently testable**

At the top of `web/ui.js`, above the `sequencer` construction, add:

```js
const midiOut = { noteOn: () => {}, noteOff: () => {} };
const clockSim = { start: () => {}, stop: () => {} };
```

(These two lines are removed in Task 6/Task 7 once the real modules exist.)

- [ ] **Step 3: Manually verify Write-mode interactions**

Open `index.html` in a browser.
Expected:
- Step 0's LED is yellow; keyboard keys and step-nav buttons are enabled; PLAY button is disabled.
- Clicking a white or black key lights that step green and moves the yellow cursor to the next step.
- Clicking the left/right step-nav arrows moves the yellow cursor without changing any note.
- Clicking the center step-nav button on a programmed step dims it to dark green; clicking again restores green.
- Refreshing the page keeps the programmed pattern (persisted via `localStorage`).
- Toggling the WRITE/PLAY switch to PLAY disables the keyboard and step-nav buttons and enables the PLAY button.

- [ ] **Step 4: Commit**

```bash
git add web/ui.js
git commit -m "feat: wire core sequencer to DOM panel with persistence"
```

---

### Task 6: `web/clock-sim.js` — simulated MIDI In (toggle + BPM)

**Files:**
- Create: `web/clock-sim.js`
- Modify: `web/ui.js`

**Interfaces:**
- Produces: `createClockSim({ getBpm, onTick })` returning `{ start(), stop() }`. `onTick` is called at a rate of `bpm * 24 / 60` times per second (24 clock pulses per quarter note).

- [ ] **Step 1: Implement `web/clock-sim.js`**

```js
export function createClockSim({ getBpm, onTick }) {
  let timerId = null;

  function pulseIntervalMs() {
    const bpm = Math.max(1, Number(getBpm()) || 120);
    return 60000 / (bpm * 24);
  }

  function tick() {
    onTick();
    timerId = setTimeout(tick, pulseIntervalMs());
  }

  function start() {
    if (timerId !== null) return;
    tick();
  }

  function stop() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  return { start, stop };
}
```

- [ ] **Step 2: Wire it into `web/ui.js`**

Add the import at the top of `web/ui.js`:

```js
import { createClockSim } from "./clock-sim.js";
```

Remove the temporary stub line `const clockSim = { start: () => {}, stop: () => {} };` added in Task 5, and instead add (after the `sequencer` constant is created, since `clockSim` needs `sequencer.handleClockPulse`):

```js
const clockSim = createClockSim({
  getBpm: () => bpmInput.value,
  onTick: () => sequencer.handleClockPulse(),
});
```

- [ ] **Step 3: Manually verify simulated clock behavior**

Open `index.html` in a browser, switch to PLAY mode, click PLAY, then check the MIDI In (simulated) checkbox.
Expected:
- With the MIDI In toggle checked, the sequencer's playhead advances through steps at a rate matching the BPM field (e.g. set BPM to 120 and time 16 steps against a stopwatch — 16 sixteenth notes at 120 BPM should take 4 seconds).
- Changing the BPM value while running changes the step rate immediately.
- Unchecking MIDI In stops the transport (`PLAY` button label reverts to `PLAY`).

- [ ] **Step 4: Commit**

```bash
git add web/clock-sim.js web/ui.js
git commit -m "feat: add simulated MIDI In clock (toggle + settable BPM)"
```

---

### Task 7: `web/midi.js` — real MIDI Out + audible WebAudio voice

**Files:**
- Create: `web/midi.js`
- Modify: `web/ui.js`

**Interfaces:**
- Produces: `createMidiOut({ selectEl, statusEl })` returning `{ noteOn(noteNumber), noteOff(noteNumber) }`.

- [ ] **Step 1: Implement `web/midi.js`**

```js
export function createMidiOut({ selectEl, statusEl }) {
  let output = null;
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
    }
    return audioCtx;
  }

  function playTone(noteNumber, durationSeconds) {
    const ctx = getAudioContext();
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
    if (output) {
      output.send([0x90, noteNumber, 100]);
    }
    playTone(noteNumber, 0.3);
  }

  function noteOff(noteNumber) {
    if (output) {
      output.send([0x80, noteNumber, 0]);
    }
  }

  function populateOutputs(access) {
    selectEl.innerHTML = '<option value="">(none)</option>';
    for (const out of access.outputs.values()) {
      const opt = document.createElement("option");
      opt.value = out.id;
      opt.textContent = out.name;
      selectEl.appendChild(opt);
    }
    selectEl.onchange = () => {
      output = access.outputs.get(selectEl.value) || null;
      statusEl.textContent = output ? `connected: ${output.name}` : "not connected";
    };
  }

  async function init() {
    if (!navigator.requestMIDIAccess) {
      statusEl.textContent = "Web MIDI not supported in this browser";
      return;
    }
    try {
      const access = await navigator.requestMIDIAccess();
      populateOutputs(access);
      access.onstatechange = () => populateOutputs(access);
    } catch {
      statusEl.textContent = "MIDI access denied";
    }
  }

  init();

  return { noteOn, noteOff };
}
```

- [ ] **Step 2: Wire it into `web/ui.js`**

Add the import at the top of `web/ui.js`:

```js
import { createMidiOut } from "./midi.js";
```

Remove the temporary stub line `const midiOut = { noteOn: () => {}, noteOff: () => {} };` added in Task 5, and instead add it before the `sequencer` constant is created (since `sequencer`'s `onNoteOn`/`onNoteOff` callbacks reference `midiOut`):

```js
const midiOut = createMidiOut({
  selectEl: document.getElementById("midi-out-select"),
  statusEl: document.getElementById("midi-out-status"),
});
```

- [ ] **Step 3: Manually verify MIDI Out and audio**

Open `index.html` in a browser (Chrome or Edge; Web MIDI isn't supported in all browsers), grant MIDI access if prompted, program a short pattern in Write mode, switch to Play mode, enable the simulated MIDI In toggle, and click PLAY.
Expected:
- Each programmed, unmuted step produces an audible square-wave beep at the correct pitch while playing, even with no MIDI Out device selected.
- If a real or virtual MIDI output device is available in the `#midi-out-select` dropdown, selecting it and playing the pattern sends visible Note On/Off activity to that device (verify in a DAW's MIDI monitor or a tool like MIDI-OX/`sendmidi`).
- The `#midi-out-status` text reflects connection state.

- [ ] **Step 4: Commit**

```bash
git add web/midi.js web/ui.js
git commit -m "feat: add real MIDI Out plus audible WebAudio playback"
```

---

## Self-Review Notes

- **Spec coverage:** Write-mode cursor/mute/note-input (Task 1), Play-mode clock/gate timing (Task 2), persistence contract (Task 3, wired in Task 5), panel layout matching the sketch incl. disabled OCT/pattern-select/clear-pattern placeholders (Task 4), simulated MIDI In toggle+BPM (Task 6), real MIDI Out + audible playback (Task 7) — every spec section maps to a task.
- **Placeholder scan:** no TBD/TODO markers; all steps include complete, runnable code.
- **Type consistency:** `createSequencer`'s returned method names/signatures (Task 1) are used identically in Tasks 2, 3, 5; `createClockSim`'s `{ start, stop }` (Task 6) and `createMidiOut`'s `{ noteOn, noteOff }` (Task 7) match exactly how `web/ui.js` (Task 5) references them.
