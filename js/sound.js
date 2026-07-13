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

  playRecordFanfare() {
    if (!this.enabled || !this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    const start = this.ctx.currentTime + 0.03;
    const melody = [[523.25, 0.13], [659.25, 0.13], [783.99, 0.13], [1046.5, 0.28], [0, 0.06], [783.99, 0.12], [987.77, 0.12], [1174.66, 0.12], [1318.51, 0.48]];
    const harmony = [[261.63, 0.39], [392, 0.34], [329.63, 0.36], [523.25, 0.48]];
    const sparkle = [[1567.98, 0.08], [0, 0.05], [1975.53, 0.08], [0, 0.05], [2637.02, 0.28]];
    this.scheduleNotes(melody, Math.min(0.2, SFX_VOLUME * 1.5), start);
    this.scheduleNotes(harmony, Math.min(0.12, SFX_VOLUME), start);
    this.scheduleNotes(sparkle, Math.min(0.1, SFX_VOLUME * 0.8), start + 1.05);
  }

  playGameOver(reason = "topout") {
    if (!this.enabled || !this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    const start = this.ctx.currentTime + 0.02;
    if (reason === "time") {
      this.scheduleNotes([[988, 0.08], [0, 0.04], [988, 0.08], [0, 0.06], [659, 0.15], [494, 0.24]], Math.min(0.18, SFX_VOLUME * 1.35), start);
      this.scheduleNotes([[247, 0.2], [196, 0.2], [147, 0.3]], Math.min(0.1, SFX_VOLUME), start + 0.2);
      return;
    }
    this.scheduleNotes([[392, 0.1], [330, 0.1], [262, 0.14], [196, 0.2], [131, 0.34]], Math.min(0.2, SFX_VOLUME * 1.45), start);
    this.scheduleNotes([[98, 0.2], [82, 0.22], [65, 0.42]], Math.min(0.11, SFX_VOLUME), start + 0.12);
  }

  startMusic() {
    if (!this.enabled) return;
    this.music.currentTime = 0;
    this.music.playbackRate = 1;
    this.music.play().catch(() => {});
  }

  stopMusic() {
    this.music.pause();
    this.music.playbackRate = 1;
  }

  setMusicPressure(remainingSeconds) {
    if (remainingSeconds <= 10) this.music.playbackRate = 1.08;
    else if (remainingSeconds <= 30) this.music.playbackRate = 1.04;
    else this.music.playbackRate = 1;
  }
}
