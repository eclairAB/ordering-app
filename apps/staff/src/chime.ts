let ctx: AudioContext | null = null;

/** Short two-tone chime for new orders. Browsers allow audio after the first user tap (the login). */
export function chime(): void {
  try {
    ctx ??= new AudioContext();
    const start = ctx.currentTime;
    for (const [i, freq] of [880, 1320].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.3, start + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.18 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + i * 0.18);
      osc.stop(start + i * 0.18 + 0.32);
    }
  } catch {
    // No audio available; the board still updates.
  }
}
