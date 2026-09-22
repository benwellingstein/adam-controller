import { createSequencer } from "../core/sequencer.js";
import { createClockSim } from "./clock-sim.js";

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
  keyButtons.forEach((btn) => (btn.disabled = !isWrite));
  stepLeft.disabled = !isWrite;
  stepCenter.disabled = !isWrite;
  stepRight.disabled = !isWrite;
}

const midiOut = { noteOn: () => {}, noteOff: () => {} };

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

modeToggle.addEventListener("change", () => {
  const newMode = modeToggle.checked ? "play" : "write";
  sequencer.setMode(newMode);
  setControlsForMode(newMode);
  if (newMode === "write") {
    if (midiInToggle.checked) {
      midiInToggle.checked = false;
      clockSim.stop();
    }
  } else if (midiInToggle.checked) {
    // MIDI-in was already enabled while in write mode (a no-op there); now
    // that we're entering play mode, actually start the transport so the
    // toggle's checked state matches reality.
    sequencer.handleStart();
    clockSim.start();
  }
  updatePlayButtonLabel();
});

playButton.addEventListener("click", () => {
  const { running } = sequencer.getState();
  if (running) {
    sequencer.handleStop();
  } else {
    sequencer.handleStart();
  }
  updatePlayButtonLabel();
});

midiInToggle.addEventListener("change", () => {
  if (midiInToggle.checked) {
    sequencer.handleStart();
    clockSim.start();
  } else {
    clockSim.stop();
    sequencer.handleStop();
  }
  updatePlayButtonLabel();
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

const saved = localStorage.getItem(PATTERN_STORAGE_KEY);
if (saved) {
  try {
    sequencer.loadPattern(JSON.parse(saved));
  } catch {
    sequencer.emitAllLeds();
  }
} else {
  sequencer.emitAllLeds();
}
