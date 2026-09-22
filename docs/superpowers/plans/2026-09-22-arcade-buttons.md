# Arcade-Style Light-Up Keyboard Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the 12 note-input keys into staggered round "arcade" buttons matching the hardware sketch, and make the button matching the currently-sounding note light up (green), both during playback and on Write-mode clicks.

**Architecture:** One small `core/sequencer.js` fix first (mode-switch now fires `onNoteOff` for any note that was actively sounding, matching `handleStop`'s existing behavior — needed so the new light-up state can't get stuck lit). Then a purely visual restyle of the keyboard buttons (CSS + JS positioning, no light-up logic yet). Then the light-up wiring itself, layered on the existing `onNoteOn`/`onNoteOff` callbacks and the keyboard click handler.

**Tech Stack:** Same as the existing project — plain JS ES modules, no framework, no build step, Node's built-in test runner for `core/sequencer.js`'s tests.

## Global Constraints

- No behavior changes to `core/sequencer.js` other than the one specified: `setMode` fires `onNoteOff(activeNote)` before clearing it, if a note was actively sounding — mirrors `handleStop`'s existing pattern exactly. All existing tests must still pass; a new test covers this.
- Pitch-class matching: `((note % 12) + 12) % 12` maps any MIDI note (including transposed values outside 60-71) to 0-11, which is the exact index into the existing `keyButtons` array (built from `KEYBOARD_NOTES`, already in chromatic order C=0..B=11).
- Keyboard button positions (exact values from the approved mockup): white (natural) button centers 62px apart, `left` offsets `[11, 73, 135, 197, 259, 321, 383]`px, 38px diameter, bottom-aligned. Black (sharp) buttons centered exactly between their two flanking naturals, `left` offsets `[45, 107, 231, 293, 355]`px, 32px diameter, top-aligned. No black button between E/F or B/C (unchanged note layout — only the visual treatment changes).
- Lit (playing) state color: green radial gradient `#7dffb0` → `#1f9a52` with glow `var(--led-green-glow)` — reuses the exact existing LED green tokens already defined in `style.css`, so it matches the sequencer LEDs' "this note is sounding" color exactly.
- Write-mode click flash duration: 150ms, applied directly to the clicked button (always correct regardless of OCT offset, since transposing by whole octaves never changes pitch class).
- Play-mode lighting is driven entirely by the existing `onNoteOn`/`onNoteOff` sequencer callbacks — no new timers, exact sync with the real gate length.

---

## File Structure

No new files. Modified: `core/sequencer.js`, `test/sequencer.test.js`, `style.css`, `web/ui.js`.

---

### Task 1: Core — `setMode` fires `onNoteOff` for an actively-sounding note

**Files:**
- Modify: `core/sequencer.js`
- Test: `test/sequencer.test.js`

**Interfaces:**
- Produces: `setMode(newMode)`'s behavior contract now includes "fires `onNoteOff` for any note that was actively sounding before switching" — this is what Task 3's light-up logic depends on to never get stuck in a lit state when the mode changes mid-note.

- [ ] **Step 1: Write the failing test**

Append to `test/sequencer.test.js`:

```js
test("switching mode while a note is sounding fires note-off for the active note", () => {
  const { sequencer, notesOff } = makeHarness();
  sequencer.inputNote(60);
  sequencer.setMode("play");
  sequencer.handleStart(); // note-on for step 0, gate open
  assert.equal(notesOff.length, 0);

  sequencer.setMode("write");
  assert.equal(notesOff.length, 1);
  assert.equal(notesOff[0], 60);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `notesOff.length` is 0 after `setMode("write")`, since `setMode` currently clears `activeNote` without calling `onNoteOff`.

- [ ] **Step 3: Implement the change in `core/sequencer.js`**

Find:

```js
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
```

Replace with:

```js
  function setMode(newMode) {
    if (newMode !== "write" && newMode !== "play") {
      throw new Error(`Unknown mode: ${newMode}`);
    }
    if (newMode === mode) return;
    mode = newMode;
    running = false;
    clockPulseCount = 0;
    if (activeNote !== null) {
      onNoteOff(activeNote);
      activeNote = null;
      gatePulsesRemaining = null;
    }
    if (newMode === "play") {
      playhead = 0;
    }
    emitAllLeds();
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all tests including the new one (22/22).

- [ ] **Step 5: Commit**

```bash
git add core/sequencer.js test/sequencer.test.js
git commit -m "fix: setMode fires note-off for an actively-sounding note"
```

---

### Task 2: Restyle the keyboard to staggered round "arcade" buttons

**Files:**
- Modify: `style.css`
- Modify: `web/ui.js`

**Interfaces:**
- Consumes: nothing new from Task 1.
- Produces: each `keyButtons[i]` element now has an inline `left` position matching its piano-interval x-coordinate — Task 3 doesn't depend on this directly (it indexes `keyButtons` by pitch class, which was already true before this task), but the `.lit` CSS class this task adds is what Task 3's light-up logic toggles.

- [ ] **Step 1: Replace the keyboard CSS block in `style.css`**

Find:

```css
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
```

Replace with:

```css
/* Staggered round "arcade button" keyboard: 7 natural buttons in a lower
   row, 5 sharp buttons in an upper row, positioned to match real piano
   intervals (no button between E-F or B-C). Each button's horizontal
   position is set inline via `left` in web/ui.js (WHITE_KEY_LEFT/
   BLACK_KEY_LEFT), computed from the approved mockup's pixel values. */
.keyboard {
  position: relative;
  width: 480px;
  height: 130px;
  flex-shrink: 0;
}
.key {
  position: absolute;
  border: none;
  border-radius: 50%;
  cursor: pointer;
}
.key.white {
  bottom: 16px;
  width: 38px;
  height: 38px;
  background: radial-gradient(circle at 35% 30%, #f5f5f3, #d4d4d1);
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.4);
}
.key.black {
  top: 16px;
  width: 32px;
  height: 32px;
  background: radial-gradient(circle at 35% 30%, #4a4f58, #1c1e21);
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.1);
}
.key:disabled { cursor: not-allowed; opacity: 0.5; }
.key.lit {
  background: radial-gradient(circle at 35% 35%, var(--led-green), var(--led-green-dark));
  box-shadow: 0 0 14px var(--led-green-glow), 0 3px 6px rgba(0, 0, 0, 0.5);
}
```

- [ ] **Step 2: Position each key button inline in `web/ui.js`**

Find:

```js
const keyButtons = KEYBOARD_NOTES.map(({ note, label, type }) => {
  const button = document.createElement("button");
  button.className = `key ${type}`;
  button.dataset.note = String(note);
  button.title = label;
  button.setAttribute("aria-label", label);
  button.disabled = true; // enabled only in write mode
  keyboardEl.appendChild(button);
  return button;
});
```

Replace with:

```js
// Piano-interval x-positions for the staggered round keyboard buttons
// (from the approved mockup): 7 white centers 62px apart; 5 black buttons
// centered exactly between their flanking white keys.
const WHITE_KEY_LEFT = [11, 73, 135, 197, 259, 321, 383];
const BLACK_KEY_LEFT = [45, 107, 231, 293, 355];

let nextWhiteIndex = 0;
let nextBlackIndex = 0;
const keyButtons = KEYBOARD_NOTES.map(({ note, label, type }) => {
  const button = document.createElement("button");
  button.className = `key ${type}`;
  button.dataset.note = String(note);
  button.title = label;
  button.setAttribute("aria-label", label);
  button.disabled = true; // enabled only in write mode
  button.style.left = `${type === "white" ? WHITE_KEY_LEFT[nextWhiteIndex++] : BLACK_KEY_LEFT[nextBlackIndex++]}px`;
  keyboardEl.appendChild(button);
  return button;
});
```

- [ ] **Step 3: Run the core test suite (unaffected by this task, confirms no regressions)**

Run: `npm test`
Expected: PASS, 22/22 tests (from Task 1).

- [ ] **Step 4: Manually verify in a browser**

Serve the site locally (per `README.md`) and open it.
Expected, compared to the approved mockup:
- 12 separate round buttons in two staggered rows: 7 lighter naturals in the lower row, 5 darker sharps in the upper row.
- Each sharp sits horizontally centered between its two flanking naturals; there's a visible gap with no sharp between the 3rd/4th naturals (E/F) and after the 7th natural wrapping to the next octave (B/C).
- The whole keyboard fills roughly the same width the old piano-key layout did, staying centered in the bottom row.
- Clicking a button (in Write mode) still records the correct note — no change to click behavior yet, just appearance.

- [ ] **Step 5: Commit**

```bash
git add style.css web/ui.js
git commit -m "feat: restyle keyboard to staggered round arcade buttons"
```

---

### Task 3: Light-up logic — pitch-class sync during playback, flash on click

**Files:**
- Modify: `web/ui.js`

**Interfaces:**
- Consumes: Task 1's `setMode` fix (so mode switches can never leave a button stuck lit) and Task 2's `.lit` CSS class + positioned `keyButtons`.
- Produces: no interface consumed by anything outside this task — it's the last task in the plan.

- [ ] **Step 1: Add pitch-class matching and extend the sequencer's note callbacks**

Find:

```js
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
```

Replace with:

```js
// Maps a MIDI note to its keyboard button by pitch class, so a transposed
// note (via OCT) still lights the visible button with the same letter name.
function pitchClassButton(note) {
  const pitchClass = ((note % 12) + 12) % 12;
  return keyButtons[pitchClass];
}

const sequencer = createSequencer({
  onLedChange: (index, color) => {
    ledElements[index].className = `led ${color}`;
  },
  onNoteOn: (note) => {
    midiOut.noteOn(note);
    pitchClassButton(note).classList.add("lit");
  },
  onNoteOff: (note) => {
    midiOut.noteOff(note);
    pitchClassButton(note).classList.remove("lit");
  },
});
```

- [ ] **Step 2: Add the Write-mode click flash**

Find:

```js
keyButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    sequencer.inputNote(Number(btn.dataset.note) + octaveOffset * 12);
    persistPattern();
  });
});
```

Replace with:

```js
const KEY_CLICK_FLASH_MS = 150;

keyButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    sequencer.inputNote(Number(btn.dataset.note) + octaveOffset * 12);
    persistPattern();
    // Write mode doesn't produce a real note-on/off gate to sync to, so
    // flash the clicked button briefly as instant feedback instead.
    btn.classList.add("lit");
    setTimeout(() => btn.classList.remove("lit"), KEY_CLICK_FLASH_MS);
  });
});
```

- [ ] **Step 3: Run the core test suite (unaffected by this task, confirms no regressions)**

Run: `npm test`
Expected: PASS, 22/22 tests.

- [ ] **Step 4: Manually verify in a browser (including a headless-browser screenshot check if possible)**

Serve the site locally and open it.
Expected:
- Clicking a keyboard button in Write mode briefly flashes it green, then it returns to idle, regardless of whether that step is later muted.
- Programming a short pattern, switching to Play mode, and pressing PLAY: the correct button lights up green in sync with each programmed step's audible note, and un-lights exactly when the note's gate closes.
- Setting OCT to a non-zero value (e.g. +2), programming a note by clicking the visible C button, then playing it back: the same visible C button lights up during playback (not a different one), even though the recorded note is transposed.
- Switching from Play mode back to Write mode while a note is actively sounding mid-gate does NOT leave any button stuck lit (this is what Task 1's core fix guarantees).

- [ ] **Step 5: Commit**

```bash
git add web/ui.js
git commit -m "feat: light up the keyboard button matching the sounding note"
```

---

## Self-Review Notes

- **Spec coverage:** the core symmetry fix (Task 1), the visual restyle (Task 2), and the light-up wiring for both playback-sync and Write-mode-click (Task 3) — every section of the design spec maps to a task.
- **Placeholder scan:** no TBD/TODO markers; every step contains complete, literal code verified against the current file contents (read directly before writing this plan).
- **Type consistency:** `pitchClassButton(note)` (Task 3) indexes `keyButtons`, which Task 2 already builds in the same chromatic order the pitch-class formula assumes (`KEYBOARD_NOTES` was never reordered by this plan). The `.lit` class name is used identically in `style.css` (Task 2) and `web/ui.js` (Task 3).
