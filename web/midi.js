export function createMidiOut() {
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

  function noteOn(noteNumber) {
    playTone(noteNumber, 0.3);
  }

  function noteOff() {
    // Playback is WebAudio-only now: each note is a fixed-duration envelope
    // started in noteOn, so there's nothing to cut short here.
  }

  return { noteOn, noteOff };
}
