// Importing this module never opens audio: only explicit, enabled calls do.
export const SOUND_CHANNELS = Object.freeze([
  'event', 'alarm', 'end', 'notification', 'error', 'anomaly', 'experiment', 'success', 'boris',
]);
export const SOUND_LABELS = Object.freeze({
  event: 'События', alarm: 'Тревога', end: 'Конец вселенной',
  notification: 'Уведомления', error: 'Ошибки', anomaly: 'Аномалии',
  experiment: 'Эксперименты', success: 'Успех', boris: 'Борис',
});
const contexts = new WeakMap();
const tones = {
  event: [220, 440, 660], alarm: [660, 440, 660], end: [440, 330, 220, 110],
  notification: [740, 988], error: [180, 120], anomaly: [233, 311, 247, 349],
  experiment: [330, 495, 294, 587], success: [523, 659, 784, 1047], boris: [147, 196, 165],
};
const waves = { end: 'sawtooth', error: 'triangle', anomaly: 'triangle', experiment: 'square', boris: 'triangle' };

/** Returns true when notes were scheduled; audio support and permission are optional. */
export function playSound(type, settingsOrBoolean, AudioContextClass) {
  const settings = typeof settingsOrBoolean === 'boolean'
    ? { sound: settingsOrBoolean } : (settingsOrBoolean ?? {});
  const volume = Number.isFinite(settings.volume) ? Math.max(0, Math.min(1, settings.volume)) : 0.45;
  if (settings.sound !== true || volume === 0 || settings.channels?.[type] === false) return false;
  const Context = AudioContextClass === undefined
    ? (globalThis.AudioContext || globalThis.webkitAudioContext) : AudioContextClass;
  if (typeof Context !== 'function' || !Object.hasOwn(tones, type)) return false;
  try {
    let audio = contexts.get(Context);
    if (!audio || audio.state === 'closed') {
      audio = new Context();
      contexts.set(Context, audio);
    }
    Promise.resolve(audio.resume()).catch(() => {});
    const peak = Math.max(Number.MIN_VALUE, 0.065 * volume);
    const floor = Math.min(0.0001, peak / 2);
    const start = audio.currentTime;
    tones[type].forEach((frequency, i) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const time = start + i * 0.09;
      oscillator.type = waves[type] || 'sine';
      oscillator.frequency.setValueAtTime(frequency, time);
      gain.gain.setValueAtTime(floor, time);
      gain.gain.exponentialRampToValueAtTime(peak, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(floor, time + 0.15);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.onended = () => { oscillator.disconnect?.(); gain.disconnect?.(); };
      oscillator.start(time);
      oscillator.stop(time + 0.17);
    });
    return true;
  } catch { return false; }
}
