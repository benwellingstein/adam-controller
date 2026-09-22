export function createMidiOut({ selectEl, statusEl }) {
  let output = null;
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
    }
    return audioCtx;
  }

  function playTone(noteNumber, durationSeconds) {
    const ctx = getAudioContext();
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

  function noteOn(noteNumber) {
    if (output) {
      output.send([0x90, noteNumber, 100]);
    }
    playTone(noteNumber, 0.3);
  }

  function noteOff(noteNumber) {
    if (output) {
      output.send([0x80, noteNumber, 0]);
    }
  }

  function populateOutputs(access) {
    selectEl.innerHTML = '<option value="">(none)</option>';
    for (const out of access.outputs.values()) {
      const opt = document.createElement("option");
      opt.value = out.id;
      opt.textContent = out.name;
      selectEl.appendChild(opt);
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
