# MIDI Step-Sequencer Controller — Web Simulator Design

Date: 2026-09-22

## Background

Adam (a DJ) and Ben are building a physical MIDI step-sequencer controller from
scratch: an ESP32 plus female MIDI-in/MIDI-out DIN jacks, 16 RGB LEDs (one per
1/16-note step of a 16-step pattern), a note-input keyboard, and various
transport/navigation controls. See `sketch.jpg` in the project root for the
hand-drawn panel layout this design is based on.

Before any hardware exists, this phase builds a website that simulates the
controller's front panel and behavior in the browser. MIDI In is simulated
on-screen (no real MIDI input device involved) via a toggle and a settable
BPM field, standing in for the real MIDI clock the hardware will eventually
receive. MIDI Out is real, via the Web MIDI API, so the programmed pattern
can actually play into a DAW or synth, alongside an audible WebAudio voice
so it's audible with no device attached at all. The site will be hosted as
static files (Netlify or GitHub Pages) so it can be iterated on
collaboratively. A later phase will port the sequencer logic to ESP32
firmware and design a 3D-printed case — out of scope here, but this design
deliberately isolates the sequencing logic so that port is straightforward.

## Scope

**In scope for this phase:**
- MIDI In: simulated only — an on/off toggle acts as the transport
  start/stop signal, and a settable BPM number field drives an internal
  clock at the equivalent rate real MIDI clock pulses would arrive at. No
  real Web MIDI input device is used for this phase.
- MIDI Out: real, via Web MIDI API — send Note On/Off for the programmed
  pattern during playback to a selected output device, plus an audible
  WebAudio synth voice (web-only convenience, so Adam/Ben can hear the
  pattern without a real synth attached).
- Write/Play mode switch (top toggle).
- Transport Play button (bottom-left, starts/stops playback in Play mode).
- 16 RGB-style step LEDs (yellow = cursor being programmed, green = programmed
  note, dim/unlit = muted or empty), grouped visually in 4s as in the sketch.
- 1-octave note-input keyboard (12 keys, piano-style black/white layout).
- Step-nav cluster: left/right arrows move the Write-mode cursor, center
  button mutes/unmutes the cursor step.
- Pattern autosave/restore via `localStorage`.

**Explicitly out of scope for this phase** (drawn on the sketch but
deferred; rendered as disabled/placeholder UI so the layout doesn't need to
change later):
- OCT (octave shift) control.
- Pattern select dial and 2-digit pattern number display.
- Clear pattern button.
- "Playthrough" mode (auditioning notes live from the keyboard outside of
  Write-mode recording).

## Architecture

Plain HTML/CSS/JS, no framework, no build step (keeps static hosting trivial
and keeps the core logic close to portable C-like pseudocode).

```
core/sequencer.js   – pure logic, zero DOM/Web MIDI dependencies
web/clock-sim.js    – simulated MIDI In: on/off toggle + settable-BPM clock
web/midi.js         – real Web MIDI Out glue + WebAudio synth playback
web/ui.js           – DOM rendering + input wiring
index.html
style.css
```

### `core/sequencer.js` (the ESP32-portable piece)

Owns all sequencer state and behavior as a self-contained module with a small
callback-based event interface — no async/await, no closures over DOM nodes,
no browser globals. This is the piece intended to be re-implemented
(structurally, not copy-pasted) in C/C++ on the ESP32, so it deliberately:
- Takes only primitive inputs (numbers/booleans/MIDI byte values).
- Emits only primitive outputs via callbacks (`onLedChange(index, color)`,
  `onNoteOn(note)`, `onNoteOff(note)`).
- Has no dependency on `requestAnimationFrame`, DOM events, or Web MIDI types.

State:
```
pattern[16] = { note: number|null, muted: boolean }
cursor: 0-15          // Write-mode editing position
playhead: 0-15        // Play-mode current step
mode: "write" | "play"
running: boolean       // transport running (Play mode only)
clockPulseCount: number // counts 0-5 between steps (6 pulses = one 1/16 step)
```

Inputs (functions called by the web adapter):
- `handleClockPulse()` — call on each simulated clock tick (from the BPM-driven
  internal timer for this phase; a real 0xF8 MIDI clock pulse once the ESP32
  has a real MIDI In jack). Every 6th call advances the step.
- `handleStart()`, `handleStop()`, `handleContinue()` — transport control
  (driven by the simulated MIDI In toggle for this phase).
- `setMode("write" | "play")` — switching to "write" stops playback and
  resets `running = false`; switching to "play" resets `playhead = 0` and
  `running = false` (playback doesn't auto-start — the PLAY button or an
  incoming MIDI Start message still has to trigger it).
- `moveCursor(delta)` — Write mode only; `delta` is +1 or -1, wraps 0↔15.
- `toggleMute()` — Write mode only; flips `pattern[cursor].muted`.
- `inputNote(noteNumber)` — Write mode only; sets
  `pattern[cursor] = { note: noteNumber, muted: false }`, fires an LED update,
  then advances cursor by +1 (wrapping), firing another LED update for the
  new cursor position.

Outputs (callbacks the web adapter subscribes to):
- `onLedChange(stepIndex, color)` where `color` is `"off" | "yellow" | "green" | "dim-green"`.
- `onNoteOn(noteNumber)`, `onNoteOff(noteNumber)` — fired only during Play
  mode playback, per the 50%-gate timing below.

### `web/clock-sim.js` (simulated MIDI In)

- A toggle switch stands in for MIDI In transport: switching it on calls the
  core's `handleStart()`; off calls `handleStop()`.
- A settable BPM number field drives an internal `setInterval`, computed to
  fire at the equivalent rate of 24-ppqn MIDI clock pulses at that BPM, and
  calls the core's `handleClockPulse()` on each tick. Changing the BPM value
  live updates the interval immediately.
- No Web MIDI input device or real clock bytes are involved for this phase —
  this whole module is a stand-in for the hardware's future MIDI In jack.

### `web/midi.js` (real MIDI Out)

- Requests Web MIDI access (`navigator.requestMIDIAccess()`), populates a
  MIDI Out device-select dropdown from the available output ports.
- On `onNoteOn`/`onNoteOff` from the core: sends real Note On/Off bytes to
  the selected MIDI Out device (if any), AND triggers a simple WebAudio
  synth voice (e.g. a short oscillator envelope) so the pattern is audible
  in the browser even with no MIDI Out device selected. This audio playback
  is web-only and has no equivalent on the ESP32.

### `web/ui.js`

- Renders the panel matching the sketch layout: top bar (Write/Play switch,
  PLAY transport button, simulated MIDI In toggle + BPM field, MIDI Out
  device picker/status), 16-LED row (grouped in 4s), bottom row (OCT
  placeholder, 12-key piano-style keyboard, pattern-select/clear-pattern
  placeholders, step-nav triangle/square/triangle cluster, bottom PLAY
  button).
- Wires DOM clicks/keys to the core's input functions and re-renders LEDs
  from `onLedChange` events.
- Disabled placeholder controls (OCT, pattern select, clear pattern) are
  visible but inert, so the layout doesn't need rework when those are
  implemented later.

## Interaction Flow

### Write mode
- Cursor step LED = yellow. Other steps: green if programmed+unmuted,
  dim-green if programmed+muted, off if empty.
- Left/right arrow buttons move the cursor ±1 step (wraps).
- Center button toggles mute on the cursor's step; does not move the cursor.
  Muting keeps the stored note — unmuting restores it, and inputting a new
  note while muted overwrites the stored note and un-mutes it.
- Pressing a keyboard note key records that note into the cursor step
  (turns green, un-mutes it) and auto-advances the cursor to the next step
  (which turns yellow). No audio/MIDI is sent for this key press.
- The bottom PLAY button and step-nav are otherwise inert in terms of
  transport — switching modes stops any running playback.

### Play mode
- Keyboard note keys and the step-nav cluster are inactive (no-op) — there
  is no editing cursor concept in Play mode.
- The bottom PLAY button starts/stops the transport; the simulated MIDI In
  toggle does the same (both call the core's `handleStart()`/`handleStop()`).
- Each 6th simulated clock pulse (rate set by the BPM field) advances
  `playhead` (wraps 15→0). If the step at
  `playhead` is unmuted and has a note, fire `onNoteOn` (LED shows green for
  that step during playback), then `onNoteOff` at the 50% gate point (3
  pulses later). If muted or empty, the playhead still advances but no LED
  lights and no note fires.

## Data Persistence

The `pattern` array is saved to `localStorage` on every edit and restored on
page load. No other state (mode, cursor, BPM value) needs to persist across
reloads for this phase.

## Testing / Verification

Since this is browser UI, verification is manual in this phase:
- Confirm the simulated MIDI In toggle starts/stops playback, and that
  changing the BPM field changes step speed immediately and correctly
  (verify against a stopwatch/metronome at a couple of BPM values).
- Manually program a pattern in Write mode and confirm playback in Play mode
  matches (correct notes, correct mute behavior, correct gate timing) both
  audibly (WebAudio) and via real MIDI Out (e.g. into a DAW or synth).
- Confirm pattern persists across a page refresh.
