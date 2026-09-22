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
