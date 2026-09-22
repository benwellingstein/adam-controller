import { createSequencer } from "../core/sequencer.js";
import { createClockSim } from "./clock-sim.js";
import { createMidiOut } from "./midi.js";

const PATTERN_BANK_STORAGE_KEY = "adam-controller-pattern-bank";
const LEGACY_PATTERN_STORAGE_KEY = "adam-controller-pattern";
const PATTERN_COUNT = 16;

function emptyPattern() {
  return Array.from({ length: 16 }, () => ({ note: null, muted: false }));
}

let patternBank = Array.from({ length: PATTERN_COUNT }, emptyPattern);
let currentPatternIndex = 0;

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
const modeLabels = document.querySelectorAll(".mode-label");
const patternDial = document.getElementById("pattern-dial");
const patternNumberEl = document.getElementById("pattern-number");
const clearPatternButton = document.getElementById("clear-pattern-button");
const octaveUpButton = document.getElementById("octave-up");
const octaveDownButton = document.getElementById("octave-down");
const octaveDisplay = document.getElementById("octave-display");

const OCTAVE_MIN = -3;
const OCTAVE_MAX = 3;
let octaveOffset = 0;

function updateOctaveDisplay() {
  octaveDisplay.textContent = octaveOffset > 0 ? `+${octaveOffset}` : String(octaveOffset);
}

function setOctaveOffset(newOffset) {
  octaveOffset = Math.min(OCTAVE_MAX, Math.max(OCTAVE_MIN, newOffset));
  updateOctaveDisplay();
}

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

function persistPatternBank() {
  localStorage.setItem(
    PATTERN_BANK_STORAGE_KEY,
    JSON.stringify({ patterns: patternBank, currentIndex: currentPatternIndex })
  );
}

function persistPattern() {
  patternBank[currentPatternIndex] = sequencer.getPattern();
  persistPatternBank();
}

function updatePatternDisplay() {
  patternNumberEl.textContent = String(currentPatternIndex + 1).padStart(2, "0");
  const angle = -135 + (currentPatternIndex / (PATTERN_COUNT - 1)) * 270;
  patternDial.style.setProperty("--dial-angle", `${angle}deg`);
  patternDial.setAttribute("aria-valuenow", String(currentPatternIndex + 1));
}

function switchPattern(newIndex) {
  const clamped = ((newIndex % PATTERN_COUNT) + PATTERN_COUNT) % PATTERN_COUNT;
  patternBank[currentPatternIndex] = sequencer.getPattern();
  currentPatternIndex = clamped;
  sequencer.loadPattern(patternBank[currentPatternIndex]); // also resets cursor to 0
  updatePatternDisplay();
  persistPatternBank();
}

function updatePlayButtonState() {
  playButton.classList.toggle("is-running", sequencer.getState().running);
}

function setControlsForMode(mode) {
  const isWrite = mode === "write";
  playButton.disabled = isWrite;
  keyButtons.forEach((btn) => (btn.disabled = !isWrite));
  stepLeft.disabled = !isWrite;
  stepCenter.disabled = !isWrite;
  stepRight.disabled = !isWrite;
  clearPatternButton.disabled = !isWrite;
  patternDial.classList.toggle("is-disabled", !isWrite);
  octaveUpButton.disabled = !isWrite;
  octaveDownButton.disabled = !isWrite;
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

const BPM_MIN = Number(bpmInput.min);
const BPM_MAX = Number(bpmInput.max);

function clampedBpm() {
  const value = Number(bpmInput.value);
  if (Number.isNaN(value)) return BPM_MIN;
  return Math.min(BPM_MAX, Math.max(BPM_MIN, value));
}

// The MIDI In (simulated) toggle no longer starts/stops playback — it only
// selects which tempo source drives the clock while PLAY is running.
const clockSim = createClockSim({
  getBpm: () => (midiInToggle.checked ? clampedBpm() : 120),
  onTick: () => sequencer.handleClockPulse(),
});

function startPlayback() {
  sequencer.handleStart(); // no-op unless we're in play mode
  if (sequencer.getState().running) {
    clockSim.start();
  }
  updatePlayButtonState();
}

function stopPlayback() {
  clockSim.stop();
  sequencer.handleStop();
  updatePlayButtonState();
}

function applyMode(newMode) {
  sequencer.setMode(newMode); // clears `running` itself
  setControlsForMode(newMode);
  modeToggle.setAttribute("aria-checked", String(newMode === "play"));
  modeToggle.classList.toggle("is-play", newMode === "play");
  modeLabels.forEach((label) => {
    label.classList.toggle("is-active", label.dataset.side === newMode);
  });
  if (newMode === "write") {
    clockSim.stop();
  }
  updatePlayButtonState();
}

modeToggle.addEventListener("click", () => {
  const currentMode = sequencer.getState().mode;
  applyMode(currentMode === "write" ? "play" : "write");
});

playButton.addEventListener("click", () => {
  if (sequencer.getState().running) {
    stopPlayback();
  } else {
    startPlayback();
  }
});

keyButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    sequencer.inputNote(Number(btn.dataset.note) + octaveOffset * 12);
    persistPattern();
  });
});

octaveUpButton.addEventListener("click", () => setOctaveOffset(octaveOffset + 1));
octaveDownButton.addEventListener("click", () => setOctaveOffset(octaveOffset - 1));

stepLeft.addEventListener("click", () => sequencer.moveCursor(-1));
stepRight.addEventListener("click", () => sequencer.moveCursor(1));
stepCenter.addEventListener("click", () => {
  sequencer.toggleMute();
  persistPattern();
});

clearPatternButton.addEventListener("click", () => {
  const cleared = emptyPattern();
  patternBank[currentPatternIndex] = cleared;
  sequencer.loadPattern(cleared);
  persistPatternBank();
});

let dialDragStartY = null;
let dialDragStartIndex = 0;
let lastAppliedSteps = 0;

patternDial.addEventListener("pointerdown", (event) => {
  dialDragStartY = event.clientY;
  dialDragStartIndex = currentPatternIndex;
  lastAppliedSteps = 0;
  patternDial.setPointerCapture(event.pointerId);
});

patternDial.addEventListener("pointermove", (event) => {
  if (dialDragStartY === null) return;
  const deltaY = dialDragStartY - event.clientY; // drag up = positive = increase
  const steps = Math.round(deltaY / 12);
  if (steps !== lastAppliedSteps) {
    switchPattern(dialDragStartIndex + steps);
    lastAppliedSteps = steps;
  }
});

patternDial.addEventListener("pointerup", () => {
  dialDragStartY = null;
});
patternDial.addEventListener("pointercancel", () => {
  dialDragStartY = null;
});

patternDial.addEventListener("wheel", (event) => {
  event.preventDefault();
  if (event.deltaY === 0) return;
  switchPattern(currentPatternIndex + (event.deltaY < 0 ? 1 : -1));
});

patternDial.addEventListener("keydown", (event) => {
  if (patternDial.classList.contains("is-disabled")) return;
  if (event.key === "ArrowUp" || event.key === "ArrowRight") {
    event.preventDefault();
    switchPattern(currentPatternIndex + 1);
  } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
    event.preventDefault();
    switchPattern(currentPatternIndex - 1);
  }
});

applyMode("write");
updateOctaveDisplay();

function loadPatternBankFromStorage() {
  const savedBank = localStorage.getItem(PATTERN_BANK_STORAGE_KEY);
  if (savedBank) {
    try {
      const parsed = JSON.parse(savedBank);
      if (Array.isArray(parsed.patterns) && parsed.patterns.length === PATTERN_COUNT) {
        patternBank = Array.from({ length: PATTERN_COUNT }, (_, i) => {
          const slot = parsed.patterns[i];
          return Array.isArray(slot) && slot.length === 16 ? slot : emptyPattern();
        });
        currentPatternIndex = Number.isInteger(parsed.currentIndex)
          ? ((parsed.currentIndex % PATTERN_COUNT) + PATTERN_COUNT) % PATTERN_COUNT
          : 0;
        return;
      }
    } catch {
      // Malformed saved bank: fall through to migration/defaults below.
    }
  }

  // No valid bank yet: migrate a pre-pattern-bank single saved pattern (if
  // any) into slot 0, then remove the old key.
  const legacy = localStorage.getItem(LEGACY_PATTERN_STORAGE_KEY);
  if (legacy) {
    try {
      const legacyPattern = JSON.parse(legacy);
      if (Array.isArray(legacyPattern) && legacyPattern.length === 16) {
        patternBank[0] = legacyPattern;
      }
    } catch {
      // Malformed legacy pattern: leave slot 0 empty.
    }
    localStorage.removeItem(LEGACY_PATTERN_STORAGE_KEY);
  }
}

loadPatternBankFromStorage();
sequencer.loadPattern(patternBank[currentPatternIndex]); // also renders LEDs
updatePatternDisplay();
persistPatternBank();
