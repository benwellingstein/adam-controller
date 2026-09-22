# Hardware Synth UI Redesign + Simplified MIDI Design

Date: 2026-09-22

## Background

The MIDI controller web simulator (built in a prior phase — see
`2026-09-22-midi-controller-simulator-design.md`) works functionally, but
the panel currently looks like plain unstyled HTML controls (checkboxes,
default `<select>`, browser buttons) rather than a real instrument. This
phase is a visual redesign plus two behavior simplifications, validated
interactively with mockups before implementation.

## Scope

**In scope:**
- Full visual redesign of `index.html`/`style.css` in a "Hardware Synth"
  aesthetic (matte dark panel, brushed-metal controls, glowing jewel LEDs) —
  see Visual Design below for exact treatment, validated via mockup and
  approved.
- Replace the WRITE/PLAY `<input type="checkbox">` mode switch with a
  custom sliding-rocker control (visually a metal tab sliding left/right in
  a recessed track) that behaves identically to the existing mode toggle
  (same `change`-equivalent semantics into `sequencer.setMode(...)`).
  Approved rocker style: **Sliding Rocker** (not See-Saw or Split Button).
- Move the transport PLAY button back to the bottom-left of the panel
  (matching the original hardware sketch), replacing its current top-bar
  position from the prior phase.
- Widen and center the 12-key keyboard for easier finger use, with
  corrected black/white key alignment (see Keyboard Layout below).
- Remove MIDI Out entirely: delete `web/midi.js`'s real Web MIDI output
  device request/selection/send logic and its UI (`#midi-out-select`,
  `#midi-out-status`), keeping only the WebAudio synth voice. Playback is
  audio-only going forward — "it will always play to speakers."
- Change the MIDI In (simulated) toggle's role: it no longer starts/stops
  the transport. It now only selects the tempo source while playing:
  **ON** = use the BPM field's value, **OFF** = use a fixed 120 BPM. The
  PLAY button becomes the sole start/stop control.

**Out of scope (unchanged from prior phases):** OCT control, pattern
select dial, clear-pattern button — remain disabled placeholders. No new
sequencing behavior — LED colors, gate timing, write-mode cursor behavior,
and the core `sequencer.js` state machine are unchanged by this phase.

## Visual Design

Approved via interactive mockup review (three style directions compared:
Hardware Synth, Modern Minimal, Neon Synthwave — Hardware Synth was
chosen, tried briefly against Neon, confirmed back to Hardware Synth).

**Palette & materials:**
- Panel background: near-black (`#15171a`), 1px border `#2a2d32`, rounded
  corners (~14px), subtle outer drop shadow + faint inner top highlight —
  gives the panel a slightly raised, molded-plastic/metal edge.
- Recessed elements (rocker track, MIDI-In toggle track, BPM field,
  unlit LEDs): darker well `#0c0d0f` to `#1e2126`, inset shadow, thin
  `#35383e` border — reads as "recessed into the case."
- Raised elements (rocker tab, step-nav buttons): light-to-dark linear
  gradients (`#5b6068` → `#34373c` or `#3a3d42` → `#232527`), drop shadow
  below + subtle inner highlight on top edge — reads as "metal button
  sitting proud of the case."
- Accent color: warm gold/amber (`#e8c15a` family) for the lit PLAY label,
  the play-triangle icon, and lit/active LED glow — a single consistent
  accent rather than many colors, so the panel reads as one coherent
  object. Green (`#7dffb0`/`#3fbf72` family) is reserved for programmed
  step LEDs per the existing LED color contract (unchanged: off/yellow/
  green/dim-green) — yellow steps use the same gold-family color as the
  accent, keeping the palette unified.
- Keyboard: white keys as light gradient blocks (`#f2f2f0` → `#d8d8d5`,
  bordered `#999`), black keys as near-black raised blocks — a simplified,
  slightly stylized piano-key look rather than photoreal skeuomorphism.
- Typography: small monospace labels (WRITE / PLAY / MIDI IN (SIM) / BPM)
  in muted gray (`#7d838d`) with the active side using the gold accent —
  reads as engraved panel labels.

**Sliding Rocker control:** replaces the mode checkbox. A recessed track
(`~72×30px`, rounded, inset shadow) contains a metal tab (`~32×22px`,
raised gradient) that sits at the left edge for Write mode and slides to
the right edge for Play mode. Static text labels "WRITE" and "PLAY" flank
the track; the label on the active side is gold, the inactive side is
muted gray. Clicking anywhere on the track toggles the mode, same as the
prior checkbox's click target.

**Layout changes from the prior phase:**
- Top bar now holds only: the sliding rocker (left) and the MIDI In
  (simulated) toggle + BPM field (right). The transport PLAY button and
  MIDI Out controls are removed from the top bar.
- Bottom row (left to right): the circular transport PLAY button (a
  raised metal disc, ~56px, with a gold play-triangle icon — visually
  echoes the sketch's circled bottom-left PLAY button) — centered, widened
  keyboard — step-nav cluster (left/center/right, styled as raised square
  metal buttons, unchanged function). This matches the original hardware
  sketch's left-to-right arrangement (OCT/PLAY stacked on the far left in
  the sketch; OCT remains a disabled placeholder elsewhere on the panel
  per existing scope, PLAY sits alone at bottom-left here).
- LED row, OCT placeholder, pattern-select placeholder, and clear-pattern
  placeholder positions are otherwise unchanged from the prior phase
  (still present as disabled placeholders where the sketch shows them).

## Keyboard Layout

Corrected 1-octave layout (12 keys, MIDI notes 60-71, unchanged from the
prior phase's note mapping — this phase only fixes visual width/alignment,
not the note numbers): 7 equal-width white keys (C, D, E, F, G, A, B)
rendered as `flex: 1` segments filling a centered, capped-width container;
5 black keys overlaid at the boundaries between white keys that have a
semitone gap — between C-D, D-E, F-G, G-A, and A-B. No black key between
E-F or B-C, matching a real piano. Overall keyboard is wider than the
prior phase's compact version and horizontally centered in the bottom row,
for easier finger reach.

## Behavior Changes

**MIDI Out removed entirely:**
- Delete `web/midi.js`'s Web MIDI output logic: `navigator.requestMIDIAccess()`
  call, device enumeration/population, `<select>` wiring, and
  `output.send(...)` calls for Note On/Off.
- Delete the `#midi-out-select` and `#midi-out-status` elements from
  `index.html` and any associated CSS.
- Keep `web/midi.js`'s WebAudio synth voice (`playTone`) as the sole
  playback mechanism — `createMidiOut(...)`'s returned `noteOn`/`noteOff`
  now only trigger audio, no MIDI bytes.
- `web/ui.js`'s `createMidiOut({...})` call site drops the
  `selectEl`/`statusEl` arguments since those elements no longer exist.

**MIDI In (simulated) toggle role change:**
- The toggle no longer calls `sequencer.handleStart()`/`handleStop()`. It
  becomes purely a tempo-source selector consulted by the clock's BPM
  lookup: when checked, the clock uses the BPM field's current value; when
  unchecked, the clock uses a fixed `120` BPM regardless of the field's
  contents.
- The BPM number input remains visible and editable in both states, but
  only has an audible effect while the toggle is checked (its value is
  simply ignored, not disabled — since the toggle's own state already
  communicates which source is active via the gold/inactive label
  styling, matching the panel's existing convention rather than adding a
  disabled-input visual).
- The PLAY button becomes the sole transport start/stop control: clicking
  it calls `sequencer.handleStart()`/`handleStop()` (rewind-and-play /
  stop, per the existing core behavior) and starts/stops `clockSim`
  together, exactly as PLAY already does today — the only change is that
  the MIDI-In-toggle's `change` handler no longer also drives transport
  state, only the BPM-source lookup.
- Since the toggle no longer controls transport, it should remain enabled
  in both Write and Play mode (unlike the prior phase, where it was
  disabled in Write mode to prevent the mode/transport desync bug) — there
  is no longer a desync risk since transport is PLAY-button-only.

## Testing / Verification

No changes to `core/sequencer.js`'s tested behavior — the existing 20 Node
tests must continue passing unmodified. This phase's changes are
UI/markup/CSS (`index.html`, `style.css`), `web/ui.js` wiring adjustments,
and `web/midi.js` simplification — verified manually in a browser (per the
project's established pattern, since there's no browser-automation tooling
available in this environment):
- Visual check against the approved mockup: dark panel, sliding rocker,
  bottom-left PLAY, centered wide keyboard with correct key alignment.
- Sliding rocker toggles Write/Play mode correctly (same behavior as the
  old checkbox).
- MIDI Out UI is gone; audio still plays through speakers.
- With MIDI In toggle OFF, playback runs at a fixed 120 BPM regardless of
  the BPM field's value; toggling ON switches live to the BPM field's
  value.
- PLAY button alone starts/stops playback in both toggle states.
