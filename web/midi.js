export function createMidiOut({ selectEl, statusEl }) {
  let output = null;
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        audioCtx = new Ctx();
      } catch (err) {
        // No audio available (unsupported or blocked): stay silent rather than
        // letting the failure propagate into the sequencer's note-firing path.
        console.warn("Audio unavailable:", err);
        return null;
      }
    }
    return audioCtx;
  }

  function playTone(noteNumber, durationSeconds) {
    const ctx = getAudioContext();
    if (!ctx) return;
    const freq = 440 * Math.pow(2, (noteNumber - 69) / 12);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSeconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationSeconds);
  }

  function send(bytes) {
    if (!output) return;
    try {
      output.send(bytes);
    } catch (err) {
      // A disconnected or otherwise invalid output can throw; don't let that
      // break playback.
      console.warn("MIDI send failed:", err);
    }
  }

  function noteOn(noteNumber) {
    send([0x90, noteNumber, 100]);
    playTone(noteNumber, 0.3);
  }

  function noteOff(noteNumber) {
    send([0x80, noteNumber, 0]);
  }

  function populateOutputs(access) {
    const previousId = output ? output.id : null;
    selectEl.innerHTML = '<option value="">(none)</option>';
    for (const out of access.outputs.values()) {
      const opt = document.createElement("option");
      opt.value = out.id;
      opt.textContent = out.name;
      selectEl.appendChild(opt);
    }
    if (previousId !== null && !access.outputs.get(previousId)) {
      // The selected device went away mid-session; drop the stale reference.
      output = null;
      statusEl.textContent = "not connected";
    } else if (previousId !== null) {
      selectEl.value = previousId;
    }
    selectEl.onchange = () => {
      output = access.outputs.get(selectEl.value) || null;
      statusEl.textContent = output ? `connected: ${output.name}` : "not connected";
    };
  }

  async function init() {
    if (!navigator.requestMIDIAccess) {
      statusEl.textContent = "Web MIDI not supported in this browser";
      return;
    }
    try {
      const access = await navigator.requestMIDIAccess();
      populateOutputs(access);
      access.onstatechange = () => populateOutputs(access);
    } catch {
      statusEl.textContent = "MIDI access denied";
    }
  }

  init();

  return { noteOn, noteOff };
}
