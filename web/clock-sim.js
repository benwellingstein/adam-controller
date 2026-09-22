export function createClockSim({ getBpm, onTick }) {
  let timerId = null;
  let nextTargetTime = 0;

  function pulseIntervalMs() {
    const bpm = Math.max(1, Number(getBpm()) || 120);
    return 60000 / (bpm * 24);
  }

  function tick() {
    try {
      onTick();
    } finally {
      // Always re-arm, even if onTick threw, so one bad pulse can't wedge the
      // clock with a non-null timerId that start() would refuse to replace.
      // Schedule against an absolute target so callback time and timer latency
      // don't compound into drift; the interval is re-read each pulse so a
      // live BPM change still takes effect immediately.
      nextTargetTime += pulseIntervalMs();
      timerId = setTimeout(tick, Math.max(0, nextTargetTime - performance.now()));
    }
  }

  function start() {
    if (timerId !== null) return;
    nextTargetTime = performance.now();
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
