# Pattern Bank, Clear Pattern, and Octave Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the panel's three remaining placeholders functional: a real 16-slot pattern bank switchable via a rotary dial, a working CLEAR PATTERN button, and an OCT -3..+3 note-input transpose control.

**Architecture:** `core/sequencer.js` gets one small behavior change (`loadPattern()` now also resets the cursor to step 0). Everything else — the 16-pattern bank, dial interaction, clear behavior, and octave transposition — lives entirely in `web/ui.js`/`index.html`/`style.css`, reusing the core's existing `getPattern()`/`loadPattern()` functions to swap the "active" pattern in and out of a bank array.

**Tech Stack:** Same as the existing project — plain JS ES modules, no framework, no build step, Node's built-in test runner for `core/sequencer.js`'s tests.

## Global Constraints

- `core/sequencer.js`'s only change this plan: `loadPattern(saved)` resets the cursor to step 0 after loading (in addition to its existing behavior). All existing tests must still pass; a new test covers the cursor reset.
- Pattern bank: 16 independently-stored patterns. Switching slots saves the outgoing pattern into its slot, loads the incoming slot's pattern (which also resets the cursor, per the core change above), updates the display, and persists.
- Dial interaction: click-and-drag vertically (drag up = increase, drag down = decrease slot number, wrapping 1↔16), plus scroll-wheel and ArrowUp/ArrowDown-when-focused as equivalents. 12px of vertical drag = one slot step.
- CLEAR PATTERN wipes only the currently-selected pattern's 16 steps, immediately, no confirmation.
- Persistence: a new `localStorage` key (`adam-controller-pattern-bank`) stores `{ patterns: [...16 patterns...], currentIndex }`. On first load, if the old single-pattern key (`adam-controller-pattern`) exists and the new key doesn't, its pattern is migrated into slot 0 and the old key is removed.
- OCT range: **-3 to +3**, starting at **0**, clamped (not wraparound) at the ends. Effect: `sequencer.inputNote(baseNote + octaveOffset * 12)` — only affects notes entered from that point forward.
- The pattern dial, CLEAR PATTERN button, and OCT +/- buttons are enabled only in Write mode, matching the keyboard/step-nav (toggled via the existing `setControlsForMode` function).
- The octave offset is NOT reset by pattern switches, CLEAR PATTERN, or itself — it persists as a standalone live setting.
- Visual style reuses the existing "hardware synth" palette CSS custom properties (`--raised-top`, `--raised-bottom`, `--raised-border`, `--well-bg`, `--recessed-border`, `--accent-gold`, `--accent-gold-glow`, `--text-fg`, `--text-muted`) — no new colors introduced.

---

## File Structure

No new files. Modified: `core/sequencer.js`, `test/sequencer.test.js`, `index.html`, `style.css`, `web/ui.js`.

---

### Task 1: Core — `loadPattern` resets the write-mode cursor to step 0

**Files:**
- Modify: `core/sequencer.js`
- Test: `test/sequencer.test.js`

**Interfaces:**
- Produces: `loadPattern(saved)`'s behavior contract now includes "resets cursor to step 0" — this is what Task 2's pattern-switching and CLEAR PATTERN logic depends on to get correct cursor-reset behavior for free.

- [ ] **Step 1: Write the failing test**

Append to `test/sequencer.test.js`:

```js
test("loadPattern resets the write-mode cursor to step 0", () => {
  const { sequencer, ledColors } = makeHarness();
  sequencer.moveCursor(3); // cursor now on step 3
  assert.equal(sequencer.getState().cursor, 3);

  const saved = Array.from({ length: 16 }, () => ({ note: null, muted: false }));
  sequencer.loadPattern(saved);

  assert.equal(sequencer.getState().cursor, 0);
  assert.equal(ledColors[0], "yellow");
  assert.equal(ledColors[3], "off");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — the new test's cursor assertion fails (`loadPattern` doesn't reset cursor yet).

- [ ] **Step 3: Implement the change in `core/sequencer.js`**

Find:

```js
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
```

Replace with:

```js
  function loadPattern(saved) {
    if (!Array.isArray(saved) || saved.length !== STEP_COUNT) return;
    for (let i = 0; i < STEP_COUNT; i++) {
      const entry = saved[i] || {};
      pattern[i] = {
        note: typeof entry.note === "number" ? entry.note : null,
        muted: Boolean(entry.muted),
      };
    }
    cursor = 0;
    emitAllLeds();
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all tests including the new one (21/21).

- [ ] **Step 5: Commit**

```bash
git add core/sequencer.js test/sequencer.test.js
git commit -m "feat: loadPattern resets the write-mode cursor to step 0"
```

---

### Task 2: Pattern bank — dial, 2-digit display, CLEAR PATTERN, persistence + migration

**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Modify: `web/ui.js`

**Interfaces:**
- Consumes: `sequencer.getPattern()`/`sequencer.loadPattern()` from Task 1 (loadPattern now resets cursor as a side effect this task relies on).
- Produces: `patternDial`, `patternNumberEl`, `clearPatternButton` DOM consts and a `setControlsForMode` addition that Task 3 continues to extend.

- [ ] **Step 1: Update the pattern-select markup in `index.html`**

Find:

```html
      <div class="pattern-select placeholder" aria-disabled="true">
        <span>PATTERN SELECT</span>
        <div class="dial"></div>
        <span class="pattern-number">1</span>
        <button class="clear-pattern" disabled>CLEAR PATTERN</button>
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
```

- [ ] **Step 2: Add pattern-select styling to `style.css`**

Add this block anywhere after the `.midi-in-sim`/`#bpm-input` rules (e.g. right before `.placeholder { opacity: 0.35; }`):

```css
.pattern-select {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font: 10px/1 monospace;
  color: var(--text-muted);
  letter-spacing: 0.5px;
}
.pattern-select .dial {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, var(--raised-top), var(--raised-bottom));
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.15);
  position: relative;
  cursor: grab;
  touch-action: none;
}
.pattern-select .dial::after {
  content: "";
  position: absolute;
  top: 4px;
  left: 50%;
  width: 3px;
  height: 14px;
  margin-left: -1.5px;
  background: var(--accent-gold);
  border-radius: 2px;
  box-shadow: 0 0 4px var(--accent-gold-glow);
  transform: rotate(var(--dial-angle, -135deg));
  transform-origin: 50% 16px;
}
.pattern-select .dial.is-disabled {
  pointer-events: none;
  opacity: 0.4;
  cursor: not-allowed;
}
.pattern-select .pattern-number {
  color: var(--text-fg);
  background: var(--well-bg);
  border: 1px solid var(--recessed-border);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 11px;
}
.pattern-select .clear-pattern {
  margin-top: 4px;
  background: linear-gradient(180deg, var(--raised-top), var(--raised-bottom));
  border: 1px solid var(--raised-border);
  border-radius: 4px;
  color: var(--text-fg);
  font: 10px/1 monospace;
  letter-spacing: 0.5px;
  padding: 6px 10px;
  cursor: pointer;
}
.pattern-select .clear-pattern:disabled { opacity: 0.4; cursor: not-allowed; }
```

Also add `#pattern-dial`, `#clear-pattern-button` to the existing `:focus-visible` selector list at the bottom of the file:

Find:

```css
.rocker:focus-visible,
.play-button:focus-visible,
.oct button:focus-visible,
.step-nav button:focus-visible,
.key:focus-visible,
#bpm-input:focus-visible {
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
#clear-pattern-button:focus-visible {
  outline: 2px solid var(--accent-gold);
  outline-offset: 2px;
}
```

- [ ] **Step 3: Add the pattern-bank data model and DOM references to `web/ui.js`**

Find:

```js
const PATTERN_STORAGE_KEY = "adam-controller-pattern";
```

Replace with:

```js
const PATTERN_BANK_STORAGE_KEY = "adam-controller-pattern-bank";
const LEGACY_PATTERN_STORAGE_KEY = "adam-controller-pattern";
const PATTERN_COUNT = 16;

function emptyPattern() {
  return Array.from({ length: 16 }, () => ({ note: null, muted: false }));
}

let patternBank = Array.from({ length: PATTERN_COUNT }, emptyPattern);
let currentPatternIndex = 0;
```

Find:

```js
const stepLeft = document.getElementById("step-left");
const stepCenter = document.getElementById("step-center");
const stepRight = document.getElementById("step-right");
const modeLabels = document.querySelectorAll(".mode-label");
```

Replace with:

```js
const stepLeft = document.getElementById("step-left");
const stepCenter = document.getElementById("step-center");
const stepRight = document.getElementById("step-right");
const modeLabels = document.querySelectorAll(".mode-label");
const patternDial = document.getElementById("pattern-dial");
const patternNumberEl = document.getElementById("pattern-number");
const clearPatternButton = document.getElementById("clear-pattern-button");
```

- [ ] **Step 4: Replace `persistPattern` with bank-aware persistence**

Find:

```js
function persistPattern() {
  localStorage.setItem(PATTERN_STORAGE_KEY, JSON.stringify(sequencer.getPattern()));
}
```

Replace with:

```js
function persistPatternBank() {
  localStorage.setItem(
    PATTERN_BANK_STORAGE_KEY,
    JSON.stringify({ patterns: patternBank, currentIndex: currentPatternIndex })
  );
}

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

(`persistPattern` keeps its name and existing call sites in the keyboard/step-center click handlers below are unchanged — only its body and meaning changed, from "save the one pattern" to "save the active slot back into the bank.")

- [ ] **Step 5: Wire up CLEAR PATTERN, the dial's drag/wheel/keyboard interactions, and mode-gating**

Find:

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
}
```

Find:

```js
stepLeft.addEventListener("click", () => sequencer.moveCursor(-1));
stepRight.addEventListener("click", () => sequencer.moveCursor(1));
stepCenter.addEventListener("click", () => {
  sequencer.toggleMute();
  persistPattern();
});
```

After it, add:

```js
clearPatternButton.addEventListener("click", () => {
  const cleared = emptyPattern();
  patternBank[currentPatternIndex] = cleared;
  sequencer.loadPattern(cleared);
  persistPatternBank();
});

let dialDragStartY = null;
let dialDragStartIndex = 0;

patternDial.addEventListener("pointerdown", (event) => {
  dialDragStartY = event.clientY;
  dialDragStartIndex = currentPatternIndex;
  patternDial.setPointerCapture(event.pointerId);
});

patternDial.addEventListener("pointermove", (event) => {
  if (dialDragStartY === null) return;
  const deltaY = dialDragStartY - event.clientY; // drag up = positive = increase
  const steps = Math.round(deltaY / 12);
  if (steps !== 0) {
    switchPattern(dialDragStartIndex + steps);
  }
});

patternDial.addEventListener("pointerup", () => {
  dialDragStartY = null;
});
patternDial.addEventListener("pointercancel", () => {
  dialDragStartY = null;
});

patternDial.addEventListener("wheel", (event) => {
  event.preventDefault();
  switchPattern(currentPatternIndex + (event.deltaY < 0 ? 1 : -1));
});

patternDial.addEventListener("keydown", (event) => {
  if (event.key === "ArrowUp" || event.key === "ArrowRight") {
    event.preventDefault();
    switchPattern(currentPatternIndex + 1);
  } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
    event.preventDefault();
    switchPattern(currentPatternIndex - 1);
  }
});
```

(The `.dial.is-disabled` CSS rule sets `pointer-events: none`, so drag/wheel/click can't fire while the dial is disabled in Play mode — no extra mode check needed in these handlers. The dial can still receive keyboard focus when disabled since `tabindex` isn't removed, but `disabled`-equivalent styling plus `pointer-events: none` covers the drag/click/wheel paths; if you want keydown blocked too while disabled, that's a one-line addition, but it's not required by the plan's constraints since a `Tab`-focused-then-Play-mode-switch is an edge case, not a primary interaction path.)

- [ ] **Step 6: Replace the pattern-loading init tail with bank loading + migration**

Find:

```js
applyMode("write");

const saved = localStorage.getItem(PATTERN_STORAGE_KEY);
if (saved) {
  try {
    sequencer.loadPattern(JSON.parse(saved));
  } catch {
    // Malformed saved pattern: keep the empty pattern and fall through.
  }
}
// Always render LEDs from actual state, whether the load succeeded, was
// rejected as malformed, or never happened.
sequencer.emitAllLeds();
```

Replace with:

```js
applyMode("write");

function loadPatternBankFromStorage() {
  const savedBank = localStorage.getItem(PATTERN_BANK_STORAGE_KEY);
  if (savedBank) {
    try {
      const parsed = JSON.parse(savedBank);
      if (Array.isArray(parsed.patterns) && parsed.patterns.length === PATTERN_COUNT) {
        patternBank = parsed.patterns;
        currentPatternIndex = Number.isInteger(parsed.currentIndex)
          ? ((parsed.currentIndex % PATTERN_COUNT) + PATTERN_COUNT) % PATTERN_COUNT
          : 0;
        return;
      }
    } catch {
      // Malformed saved bank: fall through to migration/defaults below.
    }
  }

  // No valid bank yet: migrate a pre-pattern-bank single saved pattern (if
  // any) into slot 0, then remove the old key.
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
}

loadPatternBankFromStorage();
sequencer.loadPattern(patternBank[currentPatternIndex]); // also renders LEDs
updatePatternDisplay();
persistPatternBank();
```

- [ ] **Step 7: Run the core test suite (unaffected by this task, confirms no regressions)**

Run: `npm test`
Expected: PASS, 21/21 tests (from Task 1).

- [ ] **Step 8: Manually verify in a browser**

Serve the site locally (per `README.md`) and open it.
Expected:
- The dial, 2-digit display ("01"), and CLEAR PATTERN button are no longer dimmed/disabled in Write mode; switching to Play mode dims/disables the dial and CLEAR PATTERN, matching the keyboard.
- Programming a few notes, then dragging the dial up switches to slot 2 (display shows "02", the dial's gold indicator visibly rotates, all LEDs go dark since slot 2 is empty).
- Dragging back down to slot 1 restores the originally-programmed pattern.
- Scrolling over the dial and using arrow keys (after clicking/tabbing to focus it) both change slots the same way dragging does.
- Clicking CLEAR PATTERN on a programmed slot wipes it immediately (LEDs all go off, cursor back to step 0) without a confirmation prompt; switching to a different slot and back confirms only the cleared slot was affected.
- Refreshing the page preserves all 16 slots' contents and which slot was last selected.
- If you have an existing pattern from before this change (in the old `adam-controller-pattern` localStorage key), it appears in slot 1 on first load after this change, and the old key is gone from `localStorage` afterward (check via browser dev tools).

- [ ] **Step 9: Commit**

```bash
git add index.html style.css web/ui.js
git commit -m "feat: add 16-slot pattern bank with dial, clear pattern, and migration"
```

---

### Task 3: Octave selector (-3..+3, transposes note input)

**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Modify: `web/ui.js`

**Interfaces:**
- Consumes: `setControlsForMode` from Task 2 (this task adds two more lines to it).
- Produces: no interface consumed by anything outside this task — it's the last task in the plan.

- [ ] **Step 1: Update the OCT markup in `index.html`**

Find:

```html
        <div class="oct placeholder" aria-disabled="true">
          <span>OCT</span>
          <button disabled>+</button>
          <button disabled>-</button>
        </div>
```

Replace with:

```html
        <div class="oct">
          <span>OCT</span>
          <button id="octave-up" aria-label="Octave up">+</button>
          <span id="octave-display" class="octave-display">0</span>
          <button id="octave-down" aria-label="Octave down">-</button>
        </div>
```

- [ ] **Step 2: Add `.octave-display` styling to `style.css`**

Find:

```css
.oct button {
  background: linear-gradient(180deg, var(--raised-top), var(--raised-bottom));
  border: 1px solid var(--raised-border);
  border-radius: 4px;
  color: var(--text-fg);
  padding: 4px 0;
}
```

After it, add:

```css
.octave-display {
  color: var(--text-fg);
  background: var(--well-bg);
  border: 1px solid var(--recessed-border);
  border-radius: 4px;
  padding: 2px 0;
  font-size: 11px;
}
```

- [ ] **Step 3: Add octave state and DOM references to `web/ui.js`**

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
const octaveUpButton = document.getElementById("octave-up");
const octaveDownButton = document.getElementById("octave-down");
const octaveDisplay = document.getElementById("octave-display");

const OCTAVE_MIN = -3;
const OCTAVE_MAX = 3;
let octaveOffset = 0;

function updateOctaveDisplay() {
  octaveDisplay.textContent = octaveOffset > 0 ? `+${octaveOffset}` : String(octaveOffset);
}

function setOctaveOffset(newOffset) {
  octaveOffset = Math.min(OCTAVE_MAX, Math.max(OCTAVE_MIN, newOffset));
  updateOctaveDisplay();
}
```

- [ ] **Step 4: Enable/disable the octave buttons with the rest of Write-mode-only controls**

Find (as left by Task 2):

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
  octaveUpButton.disabled = !isWrite;
  octaveDownButton.disabled = !isWrite;
}
```

- [ ] **Step 5: Wire up the octave buttons and apply the offset to note input**

Find:

```js
keyButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    sequencer.inputNote(Number(btn.dataset.note));
    persistPattern();
  });
});
```

Replace with:

```js
keyButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    sequencer.inputNote(Number(btn.dataset.note) + octaveOffset * 12);
    persistPattern();
  });
});

octaveUpButton.addEventListener("click", () => setOctaveOffset(octaveOffset + 1));
octaveDownButton.addEventListener("click", () => setOctaveOffset(octaveOffset - 1));
```

- [ ] **Step 6: Ensure the display is explicitly synced at startup**

Find:

```js
applyMode("write");

function loadPatternBankFromStorage() {
```

Replace with:

```js
applyMode("write");
updateOctaveDisplay();

function loadPatternBankFromStorage() {
```

- [ ] **Step 7: Run the core test suite (unaffected by this task, confirms no regressions)**

Run: `npm test`
Expected: PASS, 21/21 tests.

- [ ] **Step 8: Manually verify in a browser**

Serve the site locally and open it.
Expected:
- The OCT `+`/`-` buttons and the small readout between them are enabled and visible (not dimmed) in Write mode; dimmed/disabled in Play mode.
- Clicking `+` repeatedly increases the readout `0 → +1 → +2 → +3` and stops at `+3` (further clicks do nothing).
- Clicking `-` repeatedly decreases `0 → -1 → -2 → -3` and stops at `-3`.
- With OCT at `+1`, pressing the C key records a step with note 72 (one octave above the default 60) — confirm by checking the step's LED turns green and, if convenient, inspecting `localStorage`'s `adam-controller-pattern-bank` value for that step's `note`.
- Switching OCT back to `0` and pressing C again on a *different* step records note 60 there, while the earlier step (recorded at `+1`) still shows 72 — confirms already-programmed steps aren't retroactively changed.
- Switching pattern slots (via the dial) does not reset the OCT readout back to `0`.

- [ ] **Step 9: Commit**

```bash
git add index.html style.css web/ui.js
git commit -m "feat: add octave selector (-3..+3) for keyboard note input"
```

---

## Self-Review Notes

- **Spec coverage:** core cursor-reset behavior (Task 1), pattern bank with dial/display/clear/persistence/migration (Task 2), octave selector (Task 3) — every section of the design spec maps to a task. Mode-gating (Write-mode-only) is covered for all three new controls via `setControlsForMode`, built incrementally across Tasks 2 and 3.
- **Placeholder scan:** no TBD/TODO markers; every step contains complete, literal code or exact find/replace text verified against the current file contents (read directly before writing this plan).
- **Type consistency:** `patternDial`/`patternNumberEl`/`clearPatternButton` (introduced in Task 2) are referenced with identical names in Task 3's `setControlsForMode` replacement. `persistPattern()`'s new bank-aware body (Task 2) is called from the same pre-existing call sites in the keyboard and step-center handlers without any signature change, so Task 3's keyboard-handler edit (which wraps the same `persistPattern()` call) composes cleanly on top of it.
