// Synthesized sound effects and ambience (no audio files). Starts after the first user gesture.
let AC = null, master = null, noise = null, muted = false;
const getPref = () => { try { return localStorage.getItem('rm-mute') === '1'; } catch { return false; } };
export function initAudio() {
  if (AC) return; try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  master = AC.createGain(); master.gain.value = .5; master.connect(AC.destination);
  noise = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  muted = getPref(); ambience();
}
export function toggleMute() { muted = !muted; try { localStorage.setItem('rm-mute', muted ? '1' : '0'); } catch {} if (master) master.gain.value = muted ? 0 : .5; return muted; }
export const isMuted = () => muted;
let vol = 1;
function tone(f, dur, type = 'sine', v = .2, slide) { if (!AC || muted) return; const t = AC.currentTime; const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur); g.gain.setValueAtTime(v * vol, t); g.gain.exponentialRampToValueAtTime(.0005, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .03); }
function hiss(dur, v, fc, q = 1, type = 'lowpass') { if (!AC || muted) return; const t = AC.currentTime; const s = AC.createBufferSource(); s.buffer = noise; s.loop = true; s.loopStart = Math.random(); s.loopEnd = s.loopStart + .5; const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = fc; f.Q.value = q; const g = AC.createGain(); g.gain.setValueAtTime(v * vol, t); g.gain.exponentialRampToValueAtTime(.0005, t + dur); s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + .03); }
export const sfx = {
  swing: () => hiss(.12, .22, 1600, 1.2, 'bandpass'),
  hit: () => { hiss(.07, .35, 700, .8); tone(150, .11, 'triangle', .3, 55); },
  crit: () => { hiss(.1, .45, 900, .8); tone(220, .16, 'triangle', .4, 70); tone(1200, .08, 'sine', .12); },
  hurt: () => tone(260, .14, 'square', .1, 130),
  die: () => { tone(320, .45, 'sawtooth', .13, 55); hiss(.3, .22, 450, 1); },
  coin: () => { tone(1320, .07, 'sine', .16); setTimeout(() => tone(1760, .11, 'sine', .14), 55); },
  pickup: () => { tone(640, .05, 'square', .07); setTimeout(() => tone(960, .09, 'square', .07), 45); },
  level: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .32, 'triangle', .17), i * 110)),
  heal: () => { tone(880, .4, 'sine', .1, 1400); tone(1320, .3, 'sine', .05); },
  bolt: () => tone(900, .22, 'sine', .12, 220),
  fire: () => { hiss(.45, .3, 420, .7); tone(90, .4, 'sawtooth', .14, 40); },
  click: () => tone(1100, .03, 'square', .04),
  quest: () => [784, 988, 1175].forEach((f, i) => setTimeout(() => tone(f, .26, 'triangle', .14), i * 120)),
  stun: () => tone(1500, .22, 'sine', .09, 300),
  slam: () => { hiss(.35, .5, 220, .5); tone(55, .45, 'sine', .4, 28); },
  roar: () => { tone(120, .8, 'sawtooth', .2, 70); hiss(.6, .25, 300, .6); },
  chain: () => { hiss(.12, .25, 3000, 2, 'bandpass'); tone(1800, .1, 'square', .05, 400); },
  deny: () => tone(200, .12, 'square', .06, 150),
  tele: () => tone(600, .5, 'sine', .08, 1800),
  bell: () => { tone(392, 1.8, 'sine', .18); tone(784, 1.3, 'sine', .07); },
};
export function sfxAt(name, d) { if (d > 18) return; vol = Math.max(.08, 1 - d / 18); sfx[name] && sfx[name](); vol = 1; }
let state = { fountain: 0, night: 0 };
export function setAmbience(s) { Object.assign(state, s); }
function ambience() {
  const bed = (fc, g0) => { const s = AC.createBufferSource(); s.buffer = noise; s.loop = true; const f = AC.createBiquadFilter(); f.type = fc > 1000 ? 'bandpass' : 'lowpass'; f.frequency.value = fc; f.Q.value = .6; const g = AC.createGain(); g.gain.value = g0; s.connect(f); f.connect(g); g.connect(master); s.start(); return g; };
  const wind = bed(260, .05), fount = bed(2400, 0);
  const lfo = AC.createOscillator(); lfo.frequency.value = .11; const lg = AC.createGain(); lg.gain.value = .03; lfo.connect(lg); lg.connect(wind.gain); lfo.start();
  let lastHour = -1;
  setInterval(() => {
    if (!AC || muted) return;
    fount.gain.value = state.fountain * .1;
    if (state.night > .4 && Math.random() < .5) { const n = 2 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) setTimeout(() => tone(4100 + Math.random() * 300, .035, 'sine', .015 * state.night), i * 60); }
    const hr = state.hour | 0; if (hr !== lastHour) { lastHour = hr; if (hr % 6 === 0 && state.inTown) { for (let i = 0; i < 3; i++) setTimeout(() => sfx.bell(), i * 900); } }
  }, 250);
}
