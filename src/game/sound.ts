/**
 * Original synthesized audio (no recordings): sound effects, warning alerts, generative background music
 * and ambience. All decisions (volumes, alert priority, mood) come from the pure rules in audioRules.ts.
 */
import { channelGain, claimAlert, decideAlert, DEFAULT_AUDIO, isAlert, newGate, normalizeSettings, type Ambience, type AlertKind, type AudioSettings, type Channel, type FacilitySound } from "./audioRules";
export type { AudioSettings } from "./audioRules";

type UiKind = "ok" | "fail" | "open" | "close" | "click" | "select" | "place" | "built" | "goal" | "objective" | "milestone" | "discovery" | "research" | "repair" | "upgrade" | "collect" | "activate" | "win" | "lose";
export type SoundKind = UiKind | AlertKind;

const KEY = "mbb.audio";
let settings: AudioSettings = DEFAULT_AUDIO;
if (typeof window !== "undefined") { try { settings = normalizeSettings(JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { /* ignore */ } }
export const getSettings = () => settings;
export function setSettings(p: Partial<AudioSettings>) {
  settings = normalizeSettings({ ...settings, ...p });
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  applyGains(); syncMusic();
}

let ctx: AudioContext | null = null;
let buses: Record<Channel, GainNode> | null = null;
let duck: GainNode | null = null;
let unlocked = false;

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  try { ctx = new AudioContext({ latencyHint: "playback" }); } catch { return null; }
  const c = ctx, comp = c.createDynamicsCompressor(), master = c.createGain();
  comp.threshold.value = -14; comp.ratio.value = 4; master.connect(comp).connect(c.destination);
  duck = c.createGain(); duck.connect(master);
  const bus = (to: AudioNode) => { const g = c.createGain(); g.gain.value = 0; g.connect(to); return g; };
  buses = { music: bus(duck), sfx: bus(master), alert: bus(master), ambience: bus(master) };
  applyGains();
  document.addEventListener("visibilitychange", () => {
    if (!ctx || !unlocked) return;
    if (document.hidden) void ctx.suspend(); else void ctx.resume();
  });
  return c;
}
function applyGains() {
  if (!ctx || !buses) return;
  const t = ctx.currentTime;
  for (const ch of Object.keys(buses) as Channel[]) buses[ch].gain.setTargetAtTime(channelGain(settings, ch) * (ch === "music" ? 0.5 : 1), t, 0.08);
}
const running = () => !!ctx && ctx.state === "running" && !!buses;

/** Browsers only allow audio after the player taps, clicks or presses a key. */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  const evs = ["pointerdown", "touchend", "keydown"] as const;
  const go = () => {
    const c = ensure(); if (!c) return;
    void c.resume().then(() => { unlocked = true; evs.forEach((e) => window.removeEventListener(e, go)); syncMusic(); });
  };
  evs.forEach((e) => window.addEventListener(e, go));
}

/* ---------------- Sound effects & alerts ---------------- */
type Tone = { f: number; to?: number; d: number; type: OscillatorType; at: number; g?: number };
const T = (type: OscillatorType, d: number, notes: number[], step = 0.09, g = 0.08): Tone[] => notes.map((f, i) => ({ f, d, type, at: i * step, g }));
const SOUNDS: Record<SoundKind, Tone[] | "noise"> = {
  ok: T("triangle", 0.15, [660, 880]), fail: T("sawtooth", 0.18, [220, 160], 0.09, 0.05), open: T("sine", 0.12, [520, 700], 0.06), close: T("sine", 0.1, [640, 470], 0.06, 0.06),
  click: T("sine", 0.035, [1250], 0, 0.04), select: T("triangle", 0.1, [660, 990], 0.06), place: [{ f: 180, to: 90, d: 0.25, type: "square", at: 0, g: 0.06 }, { f: 520, d: 0.18, type: "triangle", at: 0.08, g: 0.07 }],
  built: T("triangle", 0.22, [523, 659, 784, 1046, 1318], 0.09),
  goal: T("triangle", 0.2, [523, 659, 784, 1046]), objective: T("sine", 0.25, [440, 660], 0.15), milestone: T("triangle", 0.3, [392, 523, 659, 784, 1046], 0.12),
  discovery: T("sine", 0.3, [880, 1175, 1568], 0.08), research: T("square", 0.12, [600, 750, 900, 1200], 0.07, 0.04), repair: T("square", 0.06, [300, 300, 450], 0.1, 0.05),
  upgrade: T("triangle", 0.22, [400, 600, 800], 0.08), collect: T("sine", 0.1, [990, 1320], 0.06), activate: T("sine", 0.15, [330, 495], 0.07),
  win: T("triangle", 0.4, [523, 659, 784, 1046, 784, 1046], 0.16), lose: T("sawtooth", 0.5, [392, 330, 262, 196], 0.25, 0.05),
  alert: T("square", 0.16, [740, 0, 740], 0.18, 0.05), critical: [0, 1, 2].map((i) => ({ f: 900, to: 600, d: 0.22, type: "sawtooth" as const, at: i * 0.26, g: 0.06 })),
  "low-oxygen": [0, 1].flatMap((i) => [{ f: 880, d: 0.18, type: "sine" as const, at: i * 0.45, g: 0.09 }, { f: 660, d: 0.22, type: "sine" as const, at: i * 0.45 + 0.2, g: 0.09 }]),
  "low-water": [0, 1, 2].map((i) => ({ f: 1500, to: 480, d: 0.14, type: "sine" as const, at: i * 0.17, g: 0.09 })),
  "low-food": T("triangle", 0.16, [494, 392, 494, 392], 0.17, 0.08),
  "low-energy": [{ f: 700, to: 140, d: 0.6, type: "square", at: 0, g: 0.045 }, { f: 350, to: 90, d: 0.6, type: "sine", at: 0.05, g: 0.06 }],
  dust: "noise", radiation: [0, 1, 2, 3, 4, 5].map((i) => ({ f: 2400 + (i % 2) * 800, d: 0.03, type: "square" as const, at: i * 0.07 + (i % 3) * 0.03, g: 0.05 })),
  meteor: [{ f: 1400, to: 120, d: 1.1, type: "sawtooth", at: 0, g: 0.05 }], malfunction: T("square", 0.05, [180, 0, 180, 0, 180], 0.08, 0.06),
};
const durationOf = (s: Tone[] | "noise") => (s === "noise" ? 1.4 : Math.max(...s.map((n) => n.at + n.d)));

const gate = newGate();
let currentAlert: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
function noise(c: AudioContext) {
  if (noiseBuf) return noiseBuf;
  const len = c.sampleRate * 2; noiseBuf = c.createBuffer(1, len, c.sampleRate); const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
function render(c: AudioContext, s: Tone[] | "noise", out: AudioNode, t0: number) {
  if (s === "noise") { // wind whoosh for dust storms
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noise(c); f.type = "bandpass"; f.frequency.setValueAtTime(300, t0); f.frequency.linearRampToValueAtTime(1200, t0 + 1.4);
    g.gain.setValueAtTime(0.001, t0); g.gain.linearRampToValueAtTime(0.25, t0 + 0.5); g.gain.linearRampToValueAtTime(0.001, t0 + 1.4);
    src.connect(f).connect(g).connect(out); src.start(t0); src.stop(t0 + 1.45); return;
  }
  for (const n of s) {
    if (!n.f) continue;
    const o = c.createOscillator(), g = c.createGain(), t = t0 + n.at;
    o.type = n.type; o.frequency.setValueAtTime(n.f, t); if (n.to) o.frequency.exponentialRampToValueAtTime(n.to, t + n.d);
    g.gain.setValueAtTime(n.g ?? 0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + n.d);
    o.connect(g).connect(out); o.start(t); o.stop(t + n.d + 0.02);
  }
}

/** Play a sound. `key` groups repeats so the same warning isn't replayed every second. */
export function play(kind: SoundKind, key: string = kind) {
  if (!running()) return;
  const c = ctx!, alert = isAlert(kind), ch: Channel = alert ? "alert" : "sfx";
  if (channelGain(settings, ch) <= 0) return;
  const s = SOUNDS[kind], dur = durationOf(s), t0 = c.currentTime;
  if (alert) {
    const now = performance.now(), d = decideAlert(gate, kind, key, now);
    if (d === "skip") { lastAlert = { kind, result: "skip" }; return; }
    if (d === "interrupt" && currentAlert) { const old = currentAlert; old.gain.setTargetAtTime(0, t0, 0.03); setTimeout(() => old.disconnect(), 200); }
    claimAlert(gate, kind, key, now, dur * 1000); lastAlert = { kind, result: d };
    duck!.gain.cancelScheduledValues(t0); duck!.gain.setTargetAtTime(0.35, t0, 0.05); duck!.gain.setTargetAtTime(1, t0 + dur + 0.3, 0.4);
  }
  const out = c.createGain(); out.connect(buses![ch]); render(c, s, out, t0);
  if (alert) currentAlert = out;
  setTimeout(() => { out.disconnect(); if (currentAlert === out) currentAlert = null; }, (dur + 0.3) * 1000);
}
/** Back-compat helper used by existing code. */
export const beep = (kind: "ok" | "fail" | "open" | "goal") => play(kind);
export function soundForAction(id: string): SoundKind {
  if (id.startsWith("scan-")) return "discovery";
  if (id.startsWith("tech-")) return "research";
  if (id.startsWith("review-") || id === "clean" || id === "scavenge") return "collect";
  if (id.startsWith("toggle-") || id.startsWith("facility-toggle:") || id === "drill-mode") return "activate";
  if (id.startsWith("build:")) return "place";
  if (id === "shield" || id === "storage") return "upgrade";
  if (id.includes("fix") || id.includes("repair")) return "repair";
  return "ok";
}

/* ---------------- Background music (generative, so it never has a loop seam) ---------------- */
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
const CALM = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 67], [48, 55, 60, 64, 67], [55, 59, 62, 64, 69]]; // Am9 · Fmaj9 · Cadd9 · G6
const TENSE = [[50, 53, 57, 60], [46, 50, 53, 57], [43, 46, 50, 53], [45, 49, 52, 55]]; // Dm7 · Bbmaj7 · Gm7 · A7
let mood: "calm" | "tense" = "calm", wantMood: "calm" | "tense" = "calm";
let musicTimer: ReturnType<typeof setInterval> | null = null, nextBar = 0, bar = 0;
let music: { pad: BiquadFilterNode; arp: GainNode } | null = null;

function musicGraph(c: AudioContext) {
  if (music) return music;
  const pad = c.createBiquadFilter(); pad.type = "lowpass"; pad.frequency.value = 1400; pad.Q.value = 0.5; pad.connect(buses!.music);
  const arp = c.createGain(), delay = c.createDelay(1), fb = c.createGain(), tone = c.createBiquadFilter();
  delay.delayTime.value = 0.43; fb.gain.value = 0.32; tone.type = "lowpass"; tone.frequency.value = 1800;
  arp.connect(buses!.music); arp.connect(delay); delay.connect(tone).connect(fb).connect(delay); tone.connect(buses!.music);
  return (music = { pad, arp });
}
function voice(c: AudioContext, f: number, type: OscillatorType, t: number, a: number, hold: number, r: number, g: number, to: AudioNode, detune = 0) {
  const o = c.createOscillator(), e = c.createGain();
  o.type = type; o.frequency.value = f; o.detune.value = detune;
  e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(g, t + a); e.gain.setValueAtTime(g, t + a + hold); e.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
  o.connect(e).connect(to); o.start(t); o.stop(t + a + hold + r + 0.05);
}
function scheduleBar(c: AudioContext, t0: number): number {
  if (bar % 2 === 0) mood = wantMood; // mood only changes on a chord change, so it stays musical
  const tense = mood === "tense", beat = 60 / (tense ? 92 : 68), len = beat * 4, m = musicGraph(c);
  const chord = (tense ? TENSE : CALM)[Math.floor(bar / 2) % 4];
  m.pad.frequency.setTargetAtTime(tense ? 750 : 1400, t0, 1.5);
  if (bar % 2 === 0) for (const n of chord.slice(0, 4)) { // pad crossfades into the next chord: no gaps
    voice(c, hz(n), "triangle", t0, 1.4, len * 2 - 1.4, 2.2, 0.035, m.pad, -6);
    voice(c, hz(n), "sine", t0, 1.4, len * 2 - 1.4, 2.2, 0.03, m.pad, 7);
  }
  voice(c, hz(chord[0] - 12), "sine", t0, 0.08, len * 0.6, 0.8, 0.09, m.pad);
  if (tense) for (let b = 0; b < 4; b++) voice(c, hz(chord[0] - 24), "sawtooth", t0 + b * beat, 0.01, 0.05, 0.25, 0.05, m.pad);
  const steps = tense ? 16 : 8, step = len / steps, seed = bar * 7919;
  for (let i = 0; i < steps; i++) {
    const r = ((seed + i * 104729) % 97) / 97;
    if (r > (tense ? 0.55 : 0.6)) continue; // leave space so it stays calm and not distracting
    const n = chord[(i * (tense ? 3 : 2) + bar) % chord.length] + 12;
    voice(c, hz(n), tense ? "triangle" : "sine", t0 + i * step, 0.01, 0.05, tense ? 0.25 : 0.6, tense ? 0.035 : 0.045, m.arp);
  }
  bar++; return len;
}
function musicLoop() {
  if (!running()) return;
  const c = ctx!;
  if (nextBar < c.currentTime) nextBar = c.currentTime + 0.1;
  while (nextBar < c.currentTime + 1.2) nextBar += scheduleBar(c, nextBar);
}
function syncMusic() {
  const on = unlocked && channelGain(settings, "music") > 0;
  if (on && !musicTimer) { musicLoop(); musicTimer = setInterval(musicLoop, 300); }
  if (!on && musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}
/** Music follows the game's danger level; the change happens at the next chord, never as a restart. */
export function setMusicMood(m: "calm" | "tense") { wantMood = m; }

/* ---------------- Ambience: Martian wind, dust storms, running facilities ---------------- */
interface Loop { gain: GainNode; stop: () => void; tick?: (t: number) => void; stopAt: number; level: number }
let amb: { wind: Loop; storm: Loop; facility: Map<FacilitySound, Loop> } | null = null;

function noiseLoop(c: AudioContext, type: BiquadFilterType, freq: number, q: number, lfoHz: number, lfoDepth: number): Loop {
  const src = c.createBufferSource(), f = c.createBiquadFilter(), gain = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
  src.buffer = noise(c); src.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q; gain.gain.value = 0;
  lfo.frequency.value = lfoHz; lg.gain.value = lfoDepth; lfo.connect(lg).connect(f.frequency);
  src.connect(f).connect(gain).connect(buses!.ambience); src.start(); lfo.start();
  return { gain, stopAt: 0, level: 0, stop: () => { src.stop(); lfo.stop(); gain.disconnect(); } };
}
/** Amplitude-wobbled source: `make` builds the sound into `into`. */
function wobble(c: AudioContext, rate: number, depth: number, make: (into: AudioNode) => (() => void)): Loop {
  const gain = c.createGain(), amp = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
  gain.gain.value = 0; amp.gain.value = 1 - depth; lfo.frequency.value = rate; lg.gain.value = depth;
  lfo.connect(lg).connect(amp.gain); amp.connect(gain).connect(buses!.ambience); lfo.start();
  const stopSrc = make(amp);
  return { gain, stopAt: 0, level: 0, stop: () => { stopSrc(); lfo.stop(); gain.disconnect(); } };
}
const osc = (c: AudioContext, type: OscillatorType, f: number, to: AudioNode, g = 1) => { const o = c.createOscillator(), v = c.createGain(); o.type = type; o.frequency.value = f; v.gain.value = g; o.connect(v).connect(to); o.start(); return () => o.stop(); };
const blip = (c: AudioContext, to: AudioNode, t: number, f: number, f2: number, d: number, type: OscillatorType, g: number) => {
  const o = c.createOscillator(), e = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f2, t + d);
  e.gain.setValueAtTime(g, t); e.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(e).connect(to); o.start(t); o.stop(t + d + 0.02);
};
const FACILITY_LEVEL: Record<FacilitySound, number> = { solar: 0.5, oxygen: 0.6, greenhouse: 0.8, drill: 0.7, lab: 0.6 };
function facilityLoop(c: AudioContext, k: FacilitySound): Loop {
  if (k === "solar") return wobble(c, 0.5, 0.3, (to) => { const a = osc(c, "sine", 120, to, 0.06), b = osc(c, "sine", 240, to, 0.03), d = osc(c, "triangle", 1980, to, 0.004); return () => { a(); b(); d(); }; });
  if (k === "drill") return wobble(c, 2.6, 0.7, (to) => { const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 260; f.connect(to); const a = osc(c, "sawtooth", 52, f, 0.14), b = osc(c, "square", 78, f, 0.05); return () => { a(); b(); }; });
  if (k === "oxygen") return wobble(c, 0.22, 0.85, (to) => { const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); src.buffer = noise(c); src.loop = true; f.type = "highpass"; f.frequency.value = 2600; g.gain.value = 0.05; src.connect(f).connect(g).connect(to); src.start(); return () => src.stop(); });
  let next = 0;
  const loop = wobble(c, 0.1, 0.2, (to) => {
    if (k === "greenhouse") { const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); src.buffer = noise(c); src.loop = true; f.type = "lowpass"; f.frequency.value = 500; g.gain.value = 0.03; src.connect(f).connect(g).connect(to); src.start(); return () => src.stop(); }
    return osc(c, "sine", 820, to, 0.006); // lab: soft computer hum
  });
  loop.tick = (t) => { // bubbles in the greenhouse, data beeps in the lab
    if (next < t) next = t;
    while (next < t + 0.4) {
      if (k === "greenhouse") blip(c, loop.gain, next, 300 + Math.random() * 300, 700 + Math.random() * 500, 0.06, "sine", 0.05);
      else blip(c, loop.gain, next, [1200, 1600, 2000, 2400][Math.floor(Math.random() * 4)], 1500, 0.05, "square", 0.012);
      next += k === "greenhouse" ? 0.18 + Math.random() * 0.5 : 0.12 + Math.random() * 0.4;
    }
  };
  return loop;
}

/** Update background sounds (called a few times per second by the game; `null` fades everything out). */
export function setAmbience(a: Ambience | null) {
  if (!running()) return;
  const c = ctx!, t = c.currentTime;
  if (!a && !amb) return;
  if (channelGain(settings, "ambience") <= 0 && !amb) return;
  amb ??= { wind: noiseLoop(c, "bandpass", 420, 0.8, 0.07, 260), storm: noiseLoop(c, "bandpass", 950, 0.5, 0.31, 450), facility: new Map() };
  amb.wind.gain.gain.setTargetAtTime(0.12 * (a?.wind ?? 0), t, 0.8);
  amb.storm.gain.gain.setTargetAtTime(0.45 * (a?.storm ?? 0), t, 0.6);
  for (const [k, l] of amb.facility) {
    if (k === a?.facility) continue;
    if (!l.stopAt) { l.gain.gain.setTargetAtTime(0, t, 0.25); l.stopAt = t + 1.5; }
    else if (l.stopAt < t) { l.stop(); amb.facility.delete(k); }
  }
  if (a?.facility) {
    let l = amb.facility.get(a.facility);
    if (!l) { l = facilityLoop(c, a.facility); amb.facility.set(a.facility, l); }
    l.stopAt = 0; l.gain.gain.setTargetAtTime(FACILITY_LEVEL[a.facility], t, 0.3); l.tick?.(t);
  }
}

/* ---------------- Debug view (used by automated checks) ---------------- */
let lastAlert: { kind: AlertKind; result: string } | null = null;
export const audioDebug = () => ({ state: ctx?.state ?? "none", unlocked, music: !!musicTimer, mood, facilities: amb ? [...amb.facility.entries()].filter(([, l]) => !l.stopAt).map(([k]) => k) : [], lastAlert, buses: buses ? Object.fromEntries(Object.entries(buses).map(([k, g]) => [k, Number(g.gain.value.toFixed(2))])) : null });
if (typeof window !== "undefined") (window as unknown as { __mbbAudio?: typeof audioDebug }).__mbbAudio = audioDebug;
