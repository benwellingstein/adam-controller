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
  assert.equal(sequencer.getPattern()[0].note, 60);
  assert.equal(sequencer.getPattern()[0].muted, true);
  sequencer.moveCursor(1); // move cursor off step 0 to see its own color
  assert.equal(ledColors[0], "dim-green");

  sequencer.moveCursor(-1);
  sequencer.toggleMute();
  assert.equal(sequencer.getPattern()[0].muted, false);
  sequencer.moveCursor(1);
  assert.equal(ledColors[0], "green");
});

test("the write-mode cursor is always yellow, even on a programmed or muted step", () => {
  const { sequencer, ledColors } = makeHarness();
  sequencer.inputNote(60); // step 0 programmed, cursor now on 1
  assert.equal(ledColors[0], "green");

  sequencer.moveCursor(-1); // cursor back onto the programmed step 0
  assert.equal(ledColors[0], "yellow");

  sequencer.toggleMute(); // still under the cursor, still yellow
  assert.equal(ledColors[0], "yellow");
  assert.equal(sequencer.getPattern()[0].muted, true);
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

test("handleStart rewinds to step 0 and fires its note immediately", () => {
  const { sequencer, notesOn, ledColors } = makeHarness();
  sequencer.inputNote(60); // step 0 = note 60
  sequencer.setMode("play");
  sequencer.handleStart();

  assert.equal(sequencer.getState().playhead, 0);
  assert.equal(notesOn.length, 1);
  assert.equal(notesOn[0], 60);
  assert.equal(ledColors[0], "green"); // sounding step lights up right away
});

test("handleStart from a stopped mid-pattern position rewinds the playhead", () => {
  const { sequencer, notesOn } = makeHarness();
  sequencer.inputNote(60); // step 0 = note 60
  sequencer.setMode("play");
  sequencer.handleStart(); // fires step 0 (notesOn: 1)
  for (let i = 0; i < 6 * 3; i++) sequencer.handleClockPulse(); // 3 advances -> step 3
  assert.equal(sequencer.getState().playhead, 3);
  sequencer.handleStop();

  sequencer.handleStart();
  assert.equal(sequencer.getState().playhead, 0);
  assert.equal(notesOn.length, 2); // step 0 re-fired on restart
});

test("handleContinue resumes without rewinding and without re-triggering", () => {
  const { sequencer, notesOn } = makeHarness();
  sequencer.inputNote(60); // step 0 = note 60
  sequencer.setMode("play");
  sequencer.handleStart(); // notesOn: 1, playhead 0
  for (let i = 0; i < 6 * 3; i++) sequencer.handleClockPulse(); // -> step 3
  sequencer.handleStop();
  const beforeContinue = notesOn.length;

  sequencer.handleContinue();
  assert.equal(sequencer.getState().playhead, 3);
  assert.equal(sequencer.getState().running, true);
  assert.equal(notesOn.length, beforeContinue); // no immediate re-trigger
});

test("advances one step every 6 clock pulses while running, firing note-on once per revolution for a programmed step", () => {
  const { sequencer, notesOn } = makeHarness();
  sequencer.inputNote(60); // step 0 = note 60, cursor advances to 1
  sequencer.setMode("play"); // playhead reset to 0
  sequencer.handleStart(); // step 0 fires immediately
  assert.equal(notesOn.length, 1);

  for (let i = 0; i < 5; i++) sequencer.handleClockPulse();
  assert.equal(sequencer.getState().playhead, 0); // not yet at the 6th pulse

  sequencer.handleClockPulse(); // 6th pulse: advance to step 1 (empty, no note)
  assert.equal(sequencer.getState().playhead, 1);
  assert.equal(notesOn.length, 1);

  // Advance through steps 2..15 and wrap back around to step 0 (15 more
  // step-advances = 15 * 6 = 90 pulses), where the programmed note lives.
  for (let i = 0; i < 15 * 6; i++) sequencer.handleClockPulse();
  assert.equal(sequencer.getState().playhead, 0);
  assert.equal(notesOn.length, 2);
  assert.equal(notesOn[1], 60);
});

test("fires note-off exactly 3 pulses (50% gate) after note-on", () => {
  const { sequencer, notesOn, notesOff } = makeHarness();
  sequencer.inputNote(60); // step 0
  sequencer.setMode("play");
  sequencer.handleStart(); // note-on for step 0
  assert.equal(notesOn.length, 1);
  assert.equal(notesOff.length, 0);

  sequencer.handleClockPulse();
  sequencer.handleClockPulse();
  assert.equal(notesOff.length, 0);
  sequencer.handleClockPulse(); // 3rd pulse since note-on: gate closes
  assert.equal(notesOff.length, 1);
  assert.equal(notesOff[0], 60);
});

test("skips empty steps during playback", () => {
  const { sequencer, notesOn } = makeHarness();
  sequencer.inputNote(60); // step 0 only
  sequencer.setMode("play");
  sequencer.handleStart(); // step 0 fires
  assert.equal(notesOn.length, 1);

  // Steps 1..15 are empty: 15 step-advances produce no further note-ons.
  for (let i = 0; i < 15 * 6; i++) sequencer.handleClockPulse();
  assert.equal(sequencer.getState().playhead, 15);
  assert.equal(notesOn.length, 1);
});

test("skips a muted step that has a note during playback", () => {
  const { sequencer, notesOn } = makeHarness();
  sequencer.inputNote(60); // step 0 = note 60, cursor now on step 1
  sequencer.inputNote(64); // step 1 = note 64, cursor now on step 2
  sequencer.moveCursor(-1); // back to step 1
  sequencer.toggleMute(); // step 1 is muted but still holds note 64
  assert.deepEqual(sequencer.getPattern()[1], { note: 64, muted: true });

  sequencer.setMode("play");
  sequencer.handleStart(); // step 0 fires
  assert.deepEqual(notesOn, [60]);

  for (let i = 0; i < 6; i++) sequencer.handleClockPulse(); // advance to step 1
  assert.equal(sequencer.getState().playhead, 1);
  assert.deepEqual(notesOn, [60]); // muted step 1 fired nothing
});

test("handleStop halts playback, cuts any active note, and resets pulse count", () => {
  const { sequencer, notesOff } = makeHarness();
  sequencer.inputNote(60);
  sequencer.setMode("play");
  sequencer.handleStart(); // note-on for step 0, gate open for 3 pulses
  sequencer.handleClockPulse(); // gate still open
  sequencer.handleStop();
  assert.equal(notesOff.length, 1);
  assert.equal(notesOff[0], 60);
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
