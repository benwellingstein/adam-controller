# Arcade-Style Light-Up Keyboard Buttons — Design

Date: 2026-09-22

## Background

The note-input keyboard currently renders as flat piano-key shapes (white/black
rectangles). This phase restyles it into separate round "arcade button" style
buttons, staggered like the original hardware sketch, and adds light-up
feedback: the button matching whatever note is currently sounding lights up
(green glow, matching the existing LED palette), both during pattern playback
and when clicking a key directly while programming.

## Scope

**In scope:**
- Restyle the 12 keyboard buttons from piano-key rectangles to separate round
  "arcade" buttons, in a staggered two-row layout matching real piano
  intervals (validated via mockup): 7 natural buttons in a lower row, 5 sharp
  buttons in an upper row, each sharp centered exactly between its two
  neighboring naturals, with a visible gap where no button exists (between
  E/F and B/C) — same underlying note layout as today, different visual
  treatment.
- Light-up feedback: whichever button matches the currently-sounding note's
  pitch class lights up (green glow) while the note is sounding, then returns
  to idle.
- Applies in two situations: (1) during Play-mode playback, synced exactly to
  the sequencer's real note-on/note-off timing; (2) when clicking a key
  directly in Write mode, as a brief visual flash (since Write mode doesn't
  produce a real note-on/off gate to sync to).

**Out of scope:** No change to the underlying note data (`KEYBOARD_NOTES`
notes 60-71), no change to gate timing, no change to any other panel control.

## Pitch-Class Matching

Programmed notes can be transposed via OCT (-3 to +3), so a sounding note's
exact MIDI number can fall outside the visible 60-71 range. The lit button is
chosen by pitch class: `((note % 12) + 12) % 12` maps any MIDI note (including
transposed/negative-mod-safe values) to 0-11, which corresponds directly to
the keyboard buttons' existing order (`KEYBOARD_NOTES[0]` = C = pitch class 0,
... `KEYBOARD_NOTES[11]` = B = pitch class 11). A low C and a high C both
light the same visible C button.

## Architecture

**Play mode (exact sync):** the sequencer's existing `onNoteOn(note)`/
`onNoteOff(note)` callbacks (already wired in `web/ui.js` to trigger audio)
additionally look up the matching button via pitch class and toggle a `lit`
CSS class on it — on for `onNoteOn`, off for `onNoteOff`. No new timers
needed; this reuses the exact gate-length timing the core already produces.

**Write mode (click flash):** the keyboard buttons' existing click handler
(which already calls `sequencer.inputNote(...)`) additionally toggles the
`lit` class on the clicked button for a fixed ~150ms, then removes it. This
is independent of the Play-mode mechanism — the two can never run
concurrently, since keyboard buttons are disabled in Play mode and the
sequencer doesn't fire note-on/off in Write mode.

No changes to `core/sequencer.js` — pitch-class mapping and lighting are
purely `web/ui.js`/`style.css` concerns, layered on top of existing callbacks
and click handlers.

## Visual Design

Validated via mockup (see conversation): staggered round buttons filling the
existing ~480px-wide keyboard area, matching real piano-key horizontal
intervals:
- 7 natural (white) buttons, 38px diameter, evenly spaced with centers 62px
  apart, in the lower row.
- 5 sharp (dark) buttons, 32px diameter, in the upper row, each horizontally
  centered at the midpoint between its two flanking naturals (no button
  between E/F or B/C).
- Idle naturals: light gradient (`#f5f5f3` → `#d4d4d1`), matching the
  existing piano-key color. Idle sharps: dark gradient (`#4a4f58` → `#1c1e21`),
  matching the existing hardware-synth "raised metal" treatment used
  elsewhere on the panel.
- Lit (playing) state, either button type: green radial gradient
  (`#7dffb0` → `#1f9a52`) with a green glow (`0 0 14px rgba(60,255,140,0.8)`),
  matching the sequencer LEDs' existing "green" color exactly — one
  consistent "this note is sounding" signal across the whole panel.

## Testing / Verification

No changes to `core/sequencer.js`'s tested behavior — the existing 21 Node
tests must continue passing unmodified. This phase is markup/CSS/`web/ui.js`
wiring, verified manually in a browser (including a real headless-browser
screenshot check, per the project's established pattern):
- Visual check against the approved mockup: staggered round buttons, correct
  piano-interval alignment, filling the keyboard area.
- Programming a pattern in Write mode: clicking a key briefly flashes green,
  then returns to idle, independent of whether that note is later muted.
- Switching to Play mode and running a pattern: the correct button lights up
  in sync with each programmed step's note-on, and un-lights at note-off,
  matching the audible gate length.
- With OCT set to a non-zero value, programming and then playing back a
  transposed note still lights the correct pitch-class button (e.g. OCT +2,
  pressing the visible C button records note 84, and during playback the
  same visible C button lights up for that step, not a different one).
