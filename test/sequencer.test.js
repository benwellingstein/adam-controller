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
