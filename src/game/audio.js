const effects = {
  jump: [220, 600, .11, 'square'], land: [100, 45, .08, 'triangle'],
  pickup: [660, 1320, .16, 'sine'], damage: [150, 40, .22, 'sawtooth'],
  detection: [380, 580, .15, 'square'], alert: [380, 580, .15, 'square'],
  vault: [130, 520, .7, 'triangle'], win: [440, 1760, .6, 'sine'],
  select: [550, 820, .06, 'sine'], step: [60, 35, .025, 'triangle'],
};

export function createAudio() {
  let context, musicTimer;
  let settings = { muted: false, music: .12, sfx: .3 };
  function tone(start, end, duration, type, volume) {
    if (!context || context.state !== 'running' || settings.muted) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(start, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(end, context.currentTime + duration);
    gain.gain.setValueAtTime(Math.max(.0001, volume), context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  return {
    unlock() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      context ||= new AudioContext();
      context.resume().catch(() => {});
    },
    configure(next) { settings = { ...settings, ...next }; },
    play(name) { const effect = effects[name]; if (effect) tone(...effect, settings.sfx * .11); },
    active(active) {
      clearInterval(musicTimer);
      if (!active) { context?.suspend().catch(() => {}); return; }
      context?.resume().catch(() => {});
      let beat = 0;
      musicTimer = setInterval(() => {
        const notes = [65.4, 65.4, 98, 73.4, 65.4, 130.8, 98, 87.3];
        const note = notes[beat++ % notes.length];
        tone(note, note, .22, 'triangle', settings.music * .16);
      }, 330);
    },
    dispose() { clearInterval(musicTimer); context?.close().catch(() => {}); },
  };
}
