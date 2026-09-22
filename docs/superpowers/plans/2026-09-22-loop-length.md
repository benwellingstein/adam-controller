# Loop Length Knob Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-pattern loop-length knob (1-16, default 16) that controls how many of the 16 steps actually play back, without restricting Write-mode editing to fewer steps.

**Architecture:** `core/sequencer.js` gets a small `loopLength` addition that only affects playback wraparound (`advanceStep` wraps at `loopLength` instead of always 16). Everything else — per-pattern storage of loop length, the new dial UI, and dimming out-of-loop LEDs — lives in `web/ui.js`/`index.html`/`style.css`, mirroring the existing pattern-select dial's mechanics and reusing its CSS classes.

**Tech Stack:** Same as the existing project — plain JS ES modules, no framework, no build step, Node's built-in test runner for `core/sequencer.js`'s tests.

## Global Constraints

- Loop length range: 1-16, clamped (not wraparound). Default for a fresh/empty pattern slot: 16 (full loop).
- Write-mode editing (cursor movement, note input) is unaffected by loop length — always spans all 16 steps. Only playback wraparound (`advanceStep`) is restricted to `loopLength`.
- Loop length is stored per pattern slot, alongside that slot's notes. This requires changing each pattern-bank slot's shape from a bare 16-step array to `{ pattern: [...16 steps...], loopLength: N }`, with migration from the old bare-array format (and the older single-pattern legacy key) so no existing saved data is lost.
- The loop-length dial reuses the pattern-select dial's exact interaction model (click-drag vertically, 12px per step, scroll wheel, arrow keys when focused) and CSS classes (`.pattern-select`, `.dial`, `.pattern-number`) — no new CSS needed for the dial itself, only a new LED-dimming rule.
- Out-of-loop LEDs (index ≥ current loop length) render at `opacity: 0.4`, applied via a `.led.out-of-loop` class added directly inside the existing `onLedChange` callback (so it can never go stale when other LED state changes).
- The loop-length dial is Write-mode-only, matching the pattern dial, OCT, and CLEAR PATTERN.
- No changes to `core/sequencer.js`'s existing tests' expected outcomes — default `loopLength` is 16, matching prior unconditional-16 behavior exactly, so nothing existing should regress.

---

## File Structure

No new files. Modified: `core/sequencer.js`, `test/sequencer.test.js`, `index.html`, `style.css`, `web/ui.js`.

---

### Task 1: Core — add `loopLength` state and playback wraparound

**Files:**
- Modify: `core/sequencer.js`
- Test: `test/sequencer.test.js`

**Interfaces:**
- Produces: `setLoopLength(n)` (clamps to 1-16) and `getLoopLength()`, added to the object `createSequencer` returns. `advanceStep()`'s wraparound now uses `loopLength` instead of the fixed `STEP_COUNT`.

- [ ] **Step 1: Write the failing tests**

Append to `test/sequencer.test.js`:

```js
test("setLoopLength clamps to 1-16", () => {
  const { sequencer } = makeHarness();
  sequencer.setLoopLength(0);
  assert.equal(sequencer.getLoopLength(), 1);
  sequencer.setLoopLength(99);
  assert.equal(sequencer.getLoopLength(), 16);
  sequencer.setLoopLength(4);
  assert.equal(sequencer.getLoopLength(), 4);
});

test("playback wraps at the loop length instead of step 16", () => {
  const { sequencer, notesOn } = makeHarness();
  sequencer.inputNote(60); // step 0 = note 60, cursor -> 1
  sequencer.moveCursor(3); // cursor -> step 4
  sequencer.inputNote(72); // step 4 = note 72, cursor -> 5
  sequencer.setLoopLength(4);
  sequencer.setMode("play");
  sequencer.handleStart(); // step 0 fires immediately
  assert.deepEqual(notesOn, [60]);

  // 4 step-advances (4*6=24 pulses) should wrap the loop (0->1->2->3->0)
  // back to step 0 without ever reaching step 4's note.
  for (let i = 0; i < 4 * 6; i++) sequencer.handleClockPulse();
  assert.equal(sequencer.getState().playhead, 0);
  assert.deepEqual(notesOn, [60, 60]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `setLoopLength`/`getLoopLength` don't exist yet, and `advanceStep` always wraps at 16.

- [ ] **Step 3: Implement the change in `core/sequencer.js`**

Find:

```js
  let activeNote = null;
  let gatePulsesRemaining = null;
```

Replace with:

```js
  let activeNote = null;
  let gatePulsesRemaining = null;
  let loopLength = STEP_COUNT;
```

Find:

```js
  function advanceStep() {
    playhead = (playhead + 1) % STEP_COUNT;
    triggerCurrentStep();
    emitAllLeds();
  }
```

Replace with:

```js
  function advanceStep() {
    playhead = (playhead + 1) % loopLength;
    triggerCurrentStep();
    emitAllLeds();
  }

  function setLoopLength(n) {
    loopLength = Math.min(STEP_COUNT, Math.max(1, Math.floor(n)));
  }

  function getLoopLength() {
    return loopLength;
  }
```

Find:

```js
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
```

Replace with:

```js
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
    setLoopLength,
    getLoopLength,
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all tests including the 2 new ones (24/24).

- [ ] **Step 5: Commit**

```bash
git add core/sequencer.js test/sequencer.test.js
git commit -m "feat: add loop length with playback-only wraparound"
```

---

### Task 2: Loop-length dial UI, per-pattern storage, out-of-loop LED dimming

**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Modify: `web/ui.js`

**Interfaces:**
- Consumes: `sequencer.setLoopLength(n)`/`getLoopLength()`/`emitAllLeds()` from Task 1.
- Produces: no interface consumed by anything outside this task — it's the last task in the plan. Pattern-bank slots change shape from bare arrays to `{ pattern, loopLength }` objects; every existing reference to a slot in `web/ui.js` is updated accordingly in this same task.

- [ ] **Step 1: Add the loop-length dial markup to `index.html`**

Find:

```html
      <div class="pattern-select">
        <span>PATTERN SELECT</span>
        <div id="pattern-dial" class="dial" role="slider" aria-valuemin="1" aria-valuemax="16" aria-valuenow="1" aria-label="Pattern select" tabindex="0"></div>
        <span id="pattern-number" class="pattern-number">01</span>
        <button id="clear-pattern-button" class="clear-pattern">CLEAR PATTERN</button>
      </div>
```

Replace with:

```html
      <div class="pattern-select">
        <span>PATTERN SELECT</span>
        <div id="pattern-dial" class="dial" role="slider" aria-valuemin="1" aria-valuemax="16" aria-valuenow="1" aria-label="Pattern select" tabindex="0"></div>
        <span id="pattern-number" class="pattern-number">01</span>
        <button id="clear-pattern-button" class="clear-pattern">CLEAR PATTERN</button>
      </div>

      <div class="pattern-select">
        <span>LOOP LENGTH</span>
        <div id="loop-length-dial" class="dial" role="slider" aria-valuemin="1" aria-valuemax="16" aria-valuenow="16" aria-label="Loop length" tabindex="0"></div>
        <span id="loop-length-number" class="pattern-number">16</span>
      </div>
```

- [ ] **Step 2: Add out-of-loop LED dimming and dial focus styling to `style.css`**

Find:

```css
.led.dim-green { background: var(--led-dim-green); border-color: transparent; }
```

Replace with:

```css
.led.dim-green { background: var(--led-dim-green); border-color: transparent; }
.led.out-of-loop { opacity: 0.4; }
```

Find:

```css
.rocker:focus-visible,
.play-button:focus-visible,
.oct button:focus-visible,
.step-nav button:focus-visible,
.key:focus-visible,
#bpm-input:focus-visible,
#pattern-dial:focus-visible,
#clear-pattern-button:focus-visible {
  outline: 2px solid var(--accent-gold);
  outline-offset: 2px;
}
```

Replace with:

```css
.rocker:focus-visible,
.play-button:focus-visible,
.oct button:focus-visible,
.step-nav button:focus-visible,
.key:focus-visible,
#bpm-input:focus-visible,
#pattern-dial:focus-visible,
#clear-pattern-button:focus-visible,
#loop-length-dial:focus-visible {
  outline: 2px solid var(--accent-gold);
  outline-offset: 2px;
}
```

- [ ] **Step 3: Change pattern-bank slots to `{ pattern, loopLength }` and add DOM refs in `web/ui.js`**

Find:

```js
function emptyPattern() {
  return Array.from({ length: 16 }, () => ({ note: null, muted: false }));
}

let patternBank = Array.from({ length: PATTERN_COUNT }, emptyPattern);
let currentPatternIndex = 0;
```

Replace with:

```js
function emptyPattern() {
  return Array.from({ length: 16 }, () => ({ note: null, muted: false }));
}

function emptySlot() {
  return { pattern: emptyPattern(), loopLength: PATTERN_COUNT };
}

function normalizeSlot(slot) {
  if (Array.isArray(slot) && slot.length === 16) {
    // Pre-loop-length format: bare pattern array, default full-length loop.
    return { pattern: slot, loopLength: PATTERN_COUNT };
  }
  if (
    slot &&
    Array.isArray(slot.pattern) &&
    slot.pattern.length === 16 &&
    Number.isInteger(slot.loopLength) &&
    slot.loopLength >= 1 &&
    slot.loopLength <= PATTERN_COUNT
  ) {
    return slot;
  }
  return emptySlot();
}

let patternBank = Array.from({ length: PATTERN_COUNT }, emptySlot);
let currentPatternIndex = 0;
```

Find:

```js
const patternDial = document.getElementById("pattern-dial");
const patternNumberEl = document.getElementById("pattern-number");
const clearPatternButton = document.getElementById("clear-pattern-button");
```

Replace with:

```js
const patternDial = document.getElementById("pattern-dial");
const patternNumberEl = document.getElementById("pattern-number");
const clearPatternButton = document.getElementById("clear-pattern-button");
const loopLengthDial = document.getElementById("loop-length-dial");
const loopLengthNumberEl = document.getElementById("loop-length-number");
```

- [ ] **Step 4: Update `persistPattern`, add `updateLoopLengthDisplay`/`setSlotLoopLength`, update `switchPattern`**

Find:

```js
function persistPattern() {
  patternBank[currentPatternIndex] = sequencer.getPattern();
  persistPatternBank();
}

function updatePatternDisplay() {
  patternNumberEl.textContent = String(currentPatternIndex + 1).padStart(2, "0");
  const angle = -135 + (currentPatternIndex / (PATTERN_COUNT - 1)) * 270;
  patternDial.style.setProperty("--dial-angle", `${angle}deg`);
  patternDial.setAttribute("aria-valuenow", String(currentPatternIndex + 1));
}

function switchPattern(newIndex) {
  const clamped = ((newIndex % PATTERN_COUNT) + PATTERN_COUNT) % PATTERN_COUNT;
  patternBank[currentPatternIndex] = sequencer.getPattern();
  currentPatternIndex = clamped;
  sequencer.loadPattern(patternBank[currentPatternIndex]); // also resets cursor to 0
  updatePatternDisplay();
  persistPatternBank();
}
```

Replace with:

```js
function persistPattern() {
  patternBank[currentPatternIndex] = {
    pattern: sequencer.getPattern(),
    loopLength: sequencer.getLoopLength(),
  };
  persistPatternBank();
}

function updatePatternDisplay() {
  patternNumberEl.textContent = String(currentPatternIndex + 1).padStart(2, "0");
  const angle = -135 + (currentPatternIndex / (PATTERN_COUNT - 1)) * 270;
  patternDial.style.setProperty("--dial-angle", `${angle}deg`);
  patternDial.setAttribute("aria-valuenow", String(currentPatternIndex + 1));
}

function updateLoopLengthDisplay() {
  const length = sequencer.getLoopLength();
  loopLengthNumberEl.textContent = String(length).padStart(2, "0");
  const angle = -135 + ((length - 1) / (PATTERN_COUNT - 1)) * 270;
  loopLengthDial.style.setProperty("--dial-angle", `${angle}deg`);
  loopLengthDial.setAttribute("aria-valuenow", String(length));
}

function setSlotLoopLength(newLength) {
  const clamped = Math.min(PATTERN_COUNT, Math.max(1, newLength));
  sequencer.setLoopLength(clamped);
  sequencer.emitAllLeds(); // refresh out-of-loop dimming immediately
  updateLoopLengthDisplay();
  persistPattern();
}

function switchPattern(newIndex) {
  const clamped = ((newIndex % PATTERN_COUNT) + PATTERN_COUNT) % PATTERN_COUNT;
  patternBank[currentPatternIndex] = {
    pattern: sequencer.getPattern(),
    loopLength: sequencer.getLoopLength(),
  };
  currentPatternIndex = clamped;
  const slot = patternBank[currentPatternIndex];
  sequencer.setLoopLength(slot.loopLength);
  sequencer.loadPattern(slot.pattern); // also resets cursor to 0, renders LEDs with correct dimming
  updatePatternDisplay();
  updateLoopLengthDisplay();
  persistPatternBank();
}
```

- [ ] **Step 5: Apply out-of-loop dimming in the `onLedChange` callback and gate the new dial in `setControlsForMode`**

Find:

```js
const sequencer = createSequencer({
  onLedChange: (index, color) => {
    ledElements[index].className = `led ${color}`;
  },
```

Replace with:

```js
const sequencer = createSequencer({
  onLedChange: (index, color) => {
    const led = ledElements[index];
    led.className = `led ${color}`;
    if (index >= sequencer.getLoopLength()) {
      led.classList.add("out-of-loop");
    }
  },
```

Find:

```js
function setControlsForMode(mode) {
  const isWrite = mode === "write";
  playButton.disabled = isWrite;
  keyButtons.forEach((btn) => (btn.disabled = !isWrite));
  stepLeft.disabled = !isWrite;
  stepCenter.disabled = !isWrite;
  stepRight.disabled = !isWrite;
  clearPatternButton.disabled = !isWrite;
  patternDial.classList.toggle("is-disabled", !isWrite);
  octaveUpButton.disabled = !isWrite;
  octaveDownButton.disabled = !isWrite;
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
  clearPatternButton.disabled = !isWrite;
  patternDial.classList.toggle("is-disabled", !isWrite);
  loopLengthDial.classList.toggle("is-disabled", !isWrite);
  octaveUpButton.disabled = !isWrite;
  octaveDownButton.disabled = !isWrite;
}
```

- [ ] **Step 6: Update the CLEAR PATTERN handler for the new slot shape**

Find:

```js
clearPatternButton.addEventListener("click", () => {
  const cleared = emptyPattern();
  patternBank[currentPatternIndex] = cleared;
  sequencer.loadPattern(cleared);
  persistPatternBank();
});
```

Replace with:

```js
clearPatternButton.addEventListener("click", () => {
  const cleared = emptyPattern();
  patternBank[currentPatternIndex] = {
    pattern: cleared,
    loopLength: sequencer.getLoopLength(),
  };
  sequencer.loadPattern(cleared);
  persistPatternBank();
});
```

- [ ] **Step 7: Add the loop-length dial's drag/wheel/keyboard interaction**

Find:

```js
patternDial.addEventListener("keydown", (event) => {
  if (patternDial.classList.contains("is-disabled")) return;
  if (event.key === "ArrowUp" || event.key === "ArrowRight") {
    event.preventDefault();
    switchPattern(currentPatternIndex + 1);
  } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
    event.preventDefault();
    switchPattern(currentPatternIndex - 1);
  }
});
```

After it, add:

```js
let loopDialDragStartY = null;
let loopDialDragStartLength = PATTERN_COUNT;
let loopLastAppliedSteps = 0;

loopLengthDial.addEventListener("pointerdown", (event) => {
  loopDialDragStartY = event.clientY;
  loopDialDragStartLength = sequencer.getLoopLength();
  loopLastAppliedSteps = 0;
  loopLengthDial.setPointerCapture(event.pointerId);
});

loopLengthDial.addEventListener("pointermove", (event) => {
  if (loopDialDragStartY === null) return;
  const deltaY = loopDialDragStartY - event.clientY;
  const steps = Math.round(deltaY / 12);
  if (steps !== loopLastAppliedSteps) {
    setSlotLoopLength(loopDialDragStartLength + steps);
    loopLastAppliedSteps = steps;
  }
});

loopLengthDial.addEventListener("pointerup", () => {
  loopDialDragStartY = null;
});
loopLengthDial.addEventListener("pointercancel", () => {
  loopDialDragStartY = null;
});

loopLengthDial.addEventListener("wheel", (event) => {
  event.preventDefault();
  if (event.deltaY === 0) return;
  setSlotLoopLength(sequencer.getLoopLength() + (event.deltaY < 0 ? 1 : -1));
});

loopLengthDial.addEventListener("keydown", (event) => {
  if (loopLengthDial.classList.contains("is-disabled")) return;
  if (event.key === "ArrowUp" || event.key === "ArrowRight") {
    event.preventDefault();
    setSlotLoopLength(sequencer.getLoopLength() + 1);
  } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
    event.preventDefault();
    setSlotLoopLength(sequencer.getLoopLength() - 1);
  }
});
```

- [ ] **Step 8: Update `loadPatternBankFromStorage` and the init tail for the new slot shape**

Find:

```js
      if (Array.isArray(parsed.patterns) && parsed.patterns.length === PATTERN_COUNT) {
        patternBank = Array.from({ length: PATTERN_COUNT }, (_, i) => {
          const slot = parsed.patterns[i];
          return Array.isArray(slot) && slot.length === 16 ? slot : emptyPattern();
        });
        currentPatternIndex = Number.isInteger(parsed.currentIndex)
          ? ((parsed.currentIndex % PATTERN_COUNT) + PATTERN_COUNT) % PATTERN_COUNT
          : 0;
        return;
      }
```

Replace with:

```js
      if (Array.isArray(parsed.patterns) && parsed.patterns.length === PATTERN_COUNT) {
        patternBank = Array.from({ length: PATTERN_COUNT }, (_, i) => normalizeSlot(parsed.patterns[i]));
        currentPatternIndex = Number.isInteger(parsed.currentIndex)
          ? ((parsed.currentIndex % PATTERN_COUNT) + PATTERN_COUNT) % PATTERN_COUNT
          : 0;
        return;
      }
```

Find:

```js
  const legacy = localStorage.getItem(LEGACY_PATTERN_STORAGE_KEY);
  if (legacy) {
    try {
      const legacyPattern = JSON.parse(legacy);
      if (Array.isArray(legacyPattern) && legacyPattern.length === 16) {
        patternBank[0] = legacyPattern;
      }
    } catch {
      // Malformed legacy pattern: leave slot 0 empty.
    }
    localStorage.removeItem(LEGACY_PATTERN_STORAGE_KEY);
  }
```

Replace with:

```js
  const legacy = localStorage.getItem(LEGACY_PATTERN_STORAGE_KEY);
  if (legacy) {
    try {
      const legacyPattern = JSON.parse(legacy);
      if (Array.isArray(legacyPattern) && legacyPattern.length === 16) {
        patternBank[0] = { pattern: legacyPattern, loopLength: PATTERN_COUNT };
      }
    } catch {
      // Malformed legacy pattern: leave slot 0 empty.
    }
    localStorage.removeItem(LEGACY_PATTERN_STORAGE_KEY);
  }
```

Find:

```js
loadPatternBankFromStorage();
sequencer.loadPattern(patternBank[currentPatternIndex]); // also renders LEDs
updatePatternDisplay();
persistPatternBank();
```

Replace with:

```js
loadPatternBankFromStorage();
sequencer.setLoopLength(patternBank[currentPatternIndex].loopLength);
sequencer.loadPattern(patternBank[currentPatternIndex].pattern); // also renders LEDs
updatePatternDisplay();
updateLoopLengthDisplay();
persistPatternBank();
```

- [ ] **Step 9: Run the core test suite (unaffected by this task, confirms no regressions)**

Run: `npm test`
Expected: PASS, 24/24 tests (from Task 1).

- [ ] **Step 10: Manually verify in a browser (including a headless-browser screenshot check if possible)**

Serve the site locally and open it.
Expected:
- A new "LOOP LENGTH" dial appears next to PATTERN SELECT, starting at 16, styled identically to the pattern dial.
- Dragging/scrolling/arrow-keying it (in Write mode) changes the readout 1-16 and clamps at both ends (no wraparound).
- Setting it to e.g. 4 immediately dims LEDs for steps 4-15 (indices ≥ 4).
- Programming notes on steps 0-15, setting loop length to 4, then playing back: only steps 0-3 ever sound, the playhead wraps after step 3 back to step 0, and step 4+'s notes (still visible, still editable) never play.
- Switching to a different pattern slot and back restores that slot's own independently-remembered loop length (e.g. slot 1 at length 4, slot 2 still at the default 16).
- CLEAR PATTERN wipes notes but leaves the slot's loop length unchanged.
- Refreshing the page preserves every slot's loop length.
- The loop-length dial is dimmed/disabled in Play mode, like the pattern dial.

- [ ] **Step 11: Commit**

```bash
git add index.html style.css web/ui.js
git commit -m "feat: add per-pattern loop length dial with out-of-loop LED dimming"
```

---

## Self-Review Notes

- **Spec coverage:** core loop-length state + playback wraparound (Task 1), dial UI + per-pattern storage/migration + out-of-loop dimming + Write-mode gating (Task 2) — every piece of the approved design maps to a task.
- **Placeholder scan:** no TBD/TODO markers; every step contains complete, literal find/replace text verified against the current file contents (read directly before writing this plan).
- **Type consistency:** `setLoopLength`/`getLoopLength` (Task 1) are used identically in Task 2's `switchPattern`, `setSlotLoopLength`, `onLedChange`, and the init tail. The pattern-bank slot shape `{ pattern, loopLength }` is used consistently across every slot-touching function changed in Task 2 (`persistPattern`, `switchPattern`, `clearPatternButton` handler, `loadPatternBankFromStorage`, the init tail) — no function was left assuming the old bare-array shape.
