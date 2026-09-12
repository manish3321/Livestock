/** Sound, vibration and optional Nepali speech — the worker is watching the animal. */
export function shedFeedback(kind: 'ok' | 'bad', spoken?: string): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = kind === 'ok' ? 880 : 220;
    gain.gain.value = 0.08;
    osc.start();
    osc.stop(ctx.currentTime + (kind === 'ok' ? 0.12 : 0.28));
    osc.onended = () => void ctx.close();
  } catch {
    /* cheap Androids without WebAudio */
  }
  try {
    navigator.vibrate?.(kind === 'ok' ? [40] : [40, 60, 40]);
  } catch {
    /* desktop */
  }
  if (spoken && 'speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(spoken);
    u.lang = 'ne-NP';
    u.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }
}
