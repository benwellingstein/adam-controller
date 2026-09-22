# Pattern Bank, Clear Pattern, and Octave Selector — Design

Date: 2026-09-22

## Background

The panel currently has three disabled placeholders left over from earlier
phases: the PATTERN SELECT dial + number display, the CLEAR PATTERN button,
and the OCT +/- control. This phase makes all three fully functional:

- A real 16-slot pattern bank, switchable via a rotary dial, matching the
  hardware sketch's "PATTERN SELECT 1-16" control.
- CLEAR PATTERN wipes the currently-selected pattern.
- OCT +/- transposes the keyboard's note input by up to 3 octaves in
  either direction.

## Scope

**In scope:**
- 16 independently-stored patterns ("pattern bank"), switchable via a
  click/drag/scroll rotary dial with a 2-digit slot number display.
- CLEAR PATTERN wipes the currently-selected pattern's 16 steps
  immediately (no confirmation).
- OCT +/- (range -3 to +3, starting at 0) transposes note input; a small
  numeric readout shows the current setting.
- One `core/sequencer.js` behavior change: `loadPattern()` now also resets
  the write-mode cursor to step 0 (previously it only replaced pattern
  content).
- Pattern-bank persistence with a one-time migration from the old
  single-pattern `localStorage` key.

**Out of scope:** No changes to gate timing, LED color rules, MIDI I/O,
or the visual palette established in the prior redesign phase — this
phase reuses the existing hardware-synth styling for all new controls.

## Architecture

`core/sequencer.js` stays single-pattern and otherwise unchanged — no new
concept of "multiple patterns" is added there. The pattern bank lives
entirely in `web/ui.js`, using the core's existing `getPattern()`/
`loadPattern()` functions to save/restore whichever pattern is "active" at
any moment. This keeps the core minimal and mirrors how the eventual ESP32
firmware would work too: one active pattern buffer in the sequencing
engine, with a bank of 16 stored patterns in flash that get swapped in.

**The one core change:** `loadPattern(saved)` will also reset the cursor
to step 0 after loading. This is safe for both of `loadPattern`'s callers
(pattern-bank switching, and the existing page-load restore from
`localStorage`, where a cursor reset to its already-default value of 0 is
a no-op).

## Pattern Bank

**Data model (in `web/ui.js`):**
```
patternBank = Array(16) of { note: number|null, muted: boolean }[16]
currentPatternIndex = 0..15
```

**Switching slots** (dial interaction or programmatic call):
1. `patternBank[currentPatternIndex] = sequencer.getPattern()` — save the
   outgoing pattern.
2. `currentPatternIndex = newIndex`.
3. `sequencer.loadPattern(patternBank[newIndex])` — load the incoming
   pattern (also resets cursor to step 0, per the core change above).
4. Persist the whole bank + current index to `localStorage`.
5. Update the 2-digit slot display.

**Dial interaction:** a rotary knob, click-and-drag vertically to change
(drag up = increase, drag down = decrease slot number), wrapping 1↔16.
Scroll wheel over the dial also nudges ±1. Active only in Write mode.

**Persistence:** a new `localStorage` key stores `{ patterns: [...16
patterns...], currentIndex }`. On first load under the new code, if the
old single-pattern key (`adam-controller-pattern`) exists and the new key
doesn't, its contents are migrated into slot 0 (displayed as "1") and the
old key is removed.

## Clear Pattern

Clicking CLEAR PATTERN immediately resets the *currently selected*
pattern's 16 steps to empty (`{ note: null, muted: false }` for each),
re-renders LEDs via `sequencer.loadPattern(...)` with an empty pattern
(cursor resets to step 0, consistent with the core change above), and
persists the bank. No confirmation dialog. Active only in Write mode.

## Octave Selector

- Range: **-3 to +3** (7 settings), starting at **0**. The `+`/`-`
  buttons clamp silently at the ends — no wraparound.
- Effect: the octave offset is applied at the moment a keyboard key is
  pressed — `sequencer.inputNote(baseNote + octaveOffset * 12)`. It only
  affects notes entered from this point forward; steps already programmed
  keep whatever note they were given at the time.
- A small numeric readout between the `+`/`-` buttons shows the current
  offset (e.g. "0", "+1", "-2"), for consistency with the rest of the
  panel's numeric feedback (BPM field, pattern slot number).
- Active only in Write mode, same as the keyboard whose input it affects.
- The octave offset persists across pattern switches — it's a live
  "where am I playing from" setting, not saved per-pattern, and is not
  reset by CLEAR PATTERN, switching patterns, or itself.

## Testing / Verification

`core/sequencer.js`'s one change (cursor reset in `loadPattern`) gets a
new Node test alongside the existing 20. Everything else in this phase is
DOM/CSS/localStorage wiring in `web/ui.js`, verified manually in a
browser per the project's established pattern (including, where
possible, a real headless-browser screenshot check as done in the prior
UI redesign phase):
- Programming a pattern, switching slots via the dial, confirming the
  original pattern reappears when switching back, and that a fresh slot
  starts empty.
- CLEAR PATTERN wipes only the active slot, not others.
- Refreshing the page preserves all 16 slots and the current slot index.
- A pre-existing single pattern (from before this phase) migrates into
  slot 1 on first load, and the old storage key is removed afterward.
- OCT +/- clamps at -3/+3, the readout updates, and keyboard key presses
  record the correctly transposed note (verified via the programmed
  step's stored note value, not just visually).
- All controls introduced in this phase (dial, CLEAR PATTERN, OCT +/-)
  are disabled in Play mode and enabled in Write mode, matching the
  keyboard/step-nav.
