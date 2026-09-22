export function createClockSim({ getBpm, onTick }) {
  let timerId = null;

  function pulseIntervalMs() {
    const bpm = Math.max(1, Number(getBpm()) || 120);
    return 60000 / (bpm * 24);
  }

  function tick() {
    onTick();
    timerId = setTimeout(tick, pulseIntervalMs());
  }

  function start() {
    if (timerId !== null) return;
    tick();
  }

  function stop() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  return { start, stop };
}
