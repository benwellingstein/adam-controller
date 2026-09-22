import { createSequencer } from "../core/sequencer.js";
import { createClockSim } from "./clock-sim.js";
import { createMidiOut } from "./midi.js";

const PATTERN_STORAGE_KEY = "adam-controller-pattern";

const KEYBOARD_NOTES = [
  { note: 60, label: "C", type: "white" },
  { note: 61, label: "C#", type: "black" },
  { note: 62, label: "D", type: "white" },
  { note: 63, label: "D#", type: "black" },
  { note: 64, label: "E", type: "white" },
  { note: 65, label: "F", type: "white" },
  { note: 66, label: "F#", type: "black" },
  { note: 67, label: "G", type: "white" },
  { note: 68, label: "G#", type: "black" },
  { note: 69, label: "A", type: "white" },
  { note: 70, label: "A#", type: "black" },
  { note: 71, label: "B", type: "white" },
];

const ledRow = document.getElementById("led-row");
const keyboardEl = document.getElementById("keyboard");
const modeToggle = document.getElementById("mode-toggle");
const playButton = document.getElementById("play-button");
const midiInToggle = document.getElementById("midi-in-toggle");
const bpmInput = document.getElementById("bpm-input");
const stepLeft = document.getElementById("step-left");
const stepCenter = document.getElementById("step-center");
const stepRight = document.getElementById("step-right");

const ledElements = [];
for (let group = 0; group < 4; group++) {
  const groupEl = document.createElement("div");
  groupEl.className = "led-group";
  for (let i = 0; i < 4; i++) {
    const index = group * 4 + i;
    const led = document.createElement("div");
    led.className = "led off";
    led.dataset.index = String(index);
    groupEl.appendChild(led);
    ledElements[index] = led;
  }
  ledRow.appendChild(groupEl);
}

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

function persistPattern() {
  localStorage.setItem(PATTERN_STORAGE_KEY, JSON.stringify(sequencer.getPattern()));
}

function updatePlayButtonLabel() {
  playButton.textContent = sequencer.getState().running ? "STOP" : "PLAY";
}

function setControlsForMode(mode) {
  const isWrite = mode === "write";
  playButton.disabled = isWrite;
  // The MIDI In toggle is the other half of the same transport control, so it
  // is only usable where the PLAY button is.
  midiInToggle.disabled = isWrite;
  keyButtons.forEach((btn) => (btn.disabled = !isWrite));
  stepLeft.disabled = !isWrite;
  stepCenter.disabled = !isWrite;
  stepRight.disabled = !isWrite;
}

const midiOut = createMidiOut();

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

const clockSim = createClockSim({
  getBpm: () => bpmInput.value,
  onTick: () => sequencer.handleClockPulse(),
});

// Single source of truth for the transport: the PLAY button and the simulated
// MIDI In toggle are two ways to drive the same sequencer + clock state, and
// both are re-synced from the sequencer's actual `running` flag afterwards.
function syncTransportControls() {
  updatePlayButtonLabel();
  midiInToggle.checked = sequencer.getState().running;
}

function startPlayback() {
  sequencer.handleStart(); // no-op unless we're in play mode
  if (sequencer.getState().running) {
    clockSim.start();
  }
  syncTransportControls();
}

function stopPlayback() {
  clockSim.stop();
  sequencer.handleStop();
  syncTransportControls();
}

modeToggle.addEventListener("change", () => {
  const newMode = modeToggle.checked ? "play" : "write";
  sequencer.setMode(newMode); // clears `running` itself
  setControlsForMode(newMode);
  if (newMode === "write") {
    clockSim.stop();
  }
  syncTransportControls();
});

playButton.addEventListener("click", () => {
  if (sequencer.getState().running) {
    stopPlayback();
  } else {
    startPlayback();
  }
});

midiInToggle.addEventListener("change", () => {
  if (midiInToggle.checked) {
    startPlayback();
  } else {
    stopPlayback();
  }
});

keyButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    sequencer.inputNote(Number(btn.dataset.note));
    persistPattern();
  });
});

stepLeft.addEventListener("click", () => sequencer.moveCursor(-1));
stepRight.addEventListener("click", () => sequencer.moveCursor(1));
stepCenter.addEventListener("click", () => {
  sequencer.toggleMute();
  persistPattern();
});

setControlsForMode("write");
syncTransportControls();

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
