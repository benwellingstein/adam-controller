export const LED_OFF = "off";
export const LED_YELLOW = "yellow";
export const LED_GREEN = "green";
export const LED_DIM_GREEN = "dim-green";

const STEP_COUNT = 16;

export function createSequencer({ onLedChange, onNoteOn, onNoteOff }) {
  const pattern = Array.from({ length: STEP_COUNT }, () => ({ note: null, muted: false }));
  let cursor = 0;
  let playhead = 0;
  let mode = "write";
  let running = false;
  let clockPulseCount = 0;
  let activeNote = null;
  let gatePulsesRemaining = null;

  function ledColorForStep(index) {
    if (mode === "write") {
      const step = pattern[index];
      if (index === cursor) {
        if (step.note === null) return LED_YELLOW;
        return step.muted ? LED_DIM_GREEN : LED_GREEN;
      }
      if (step.note === null) return LED_OFF;
      return step.muted ? LED_DIM_GREEN : LED_GREEN;
    }
    // play mode: only the actively-sounding step lights up
    return index === playhead && activeNote !== null ? LED_GREEN : LED_OFF;
  }

  function emitAllLeds() {
    for (let i = 0; i < STEP_COUNT; i++) {
      onLedChange(i, ledColorForStep(i));
    }
  }

  function setMode(newMode) {
    if (newMode !== "write" && newMode !== "play") {
      throw new Error(`Unknown mode: ${newMode}`);
    }
    if (newMode === mode) return;
    mode = newMode;
    running = false;
    clockPulseCount = 0;
    activeNote = null;
    gatePulsesRemaining = null;
    if (newMode === "play") {
      playhead = 0;
    }
    emitAllLeds();
  }

  function moveCursor(delta) {
    if (mode !== "write") return;
    cursor = (cursor + delta + STEP_COUNT) % STEP_COUNT;
    emitAllLeds();
  }

  function toggleMute() {
    if (mode !== "write") return;
    pattern[cursor].muted = !pattern[cursor].muted;
    emitAllLeds();
  }

  function inputNote(noteNumber) {
    if (mode !== "write") return;
    pattern[cursor] = { note: noteNumber, muted: false };
    cursor = (cursor + 1) % STEP_COUNT;
    emitAllLeds();
  }

  // Play-mode / clock behavior implemented in Task 2.
  function handleClockPulse() {}
  function handleStart() {}
  function handleStop() {}
  function handleContinue() {}

  function getPattern() {
    return pattern.map((step) => ({ ...step }));
  }

  function loadPattern(saved) {
    if (!Array.isArray(saved) || saved.length !== STEP_COUNT) return;
    for (let i = 0; i < STEP_COUNT; i++) {
      const entry = saved[i] || {};
      pattern[i] = {
        note: typeof entry.note === "number" ? entry.note : null,
        muted: Boolean(entry.muted),
      };
    }
    emitAllLeds();
  }

  function getState() {
    return { cursor, playhead, mode, running };
  }

  return {
    setMode,
    moveCursor,
    toggleMute,
    inputNote,
    handleClockPulse,
    handleStart,
    handleStop,
    handleContinue,
    getPattern,
    loadPattern,
    emitAllLeds,
    getState,
  };
}
