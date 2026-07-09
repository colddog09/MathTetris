import { SFX_NOTES, SFX_VOLUME, BGM_VOLUME } from "./constants.js";

const BGM_FILE = "sounds/bg_music3.mp3";

export class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.music = new Audio(BGM_FILE);
    this.music.loop = true;
    this.music.volume = BGM_VOLUME;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      this.enabled = false;
      return;
    }
    this.ctx = new AudioContextClass();
  }

  scheduleNotes(notes, volume, startTime) {
    if (!this.ctx) return startTime;
    let time = startTime;
    for (const [frequency, duration] of notes) {
      if (frequency > 0 && duration > 0) {
        const oscillator = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, time);
        const attack = Math.max(0.005, duration * 0.12);
        const releaseStart = time + duration * 0.7;
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(volume, time + attack);
        gain.gain.setValueAtTime(volume, releaseStart);
        gain.gain.linearRampToValueAtTime(0, time + duration);
        oscillator.connect(gain);
        gain.connect(this.ctx.destination);
        oscillator.start(time);
        oscillator.stop(time + duration + 0.02);
      }
      time += duration;
    }
    return time;
  }

  play(name) {
    if (!this.enabled || !this.ctx) return;
    const notes = SFX_NOTES[name];
    if (!notes) return;
    this.scheduleNotes(notes, SFX_VOLUME, this.ctx.currentTime);
  }

  startMusic() {
    if (!this.enabled) return;
    this.music.currentTime = 0;
    this.music.play().catch(() => {});
  }

  stopMusic() {
    this.music.pause();
  }
}
