/** Pure audio rules (settings, alert priority, music mood, ambience). The sound engine in sound.ts only follows these. */
import { facilityViews, priorities, stormOf, stormPhase, weatherNow, type Priority, type Sim } from "./sim";
import { stationForFacility } from "./facilities";

export interface AudioSettings { muted: boolean; music: boolean; sfx: boolean; alerts: boolean; musicVolume: number; volume: number; nav: boolean }
/** `volume` is the sound-effects volume (kept under its old name so saved settings still load). */
export const DEFAULT_AUDIO: AudioSettings = { muted: false, music: true, sfx: true, alerts: true, musicVolume: 0.4, volume: 0.7, nav: true };

const vol = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
export function normalizeSettings(raw: unknown): AudioSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>, d = DEFAULT_AUDIO;
  return { muted: bool(r.muted, d.muted), music: bool(r.music, d.music), sfx: bool(r.sfx, d.sfx), alerts: bool(r.alerts, d.alerts),
    musicVolume: vol(r.musicVolume, d.musicVolume), volume: vol(r.volume, d.volume), nav: bool(r.nav, d.nav) };
}

export type Channel = "music" | "sfx" | "alert" | "ambience";
/** Loudness of each channel. Master mute silences everything; alerts and ambience follow the sound-effects volume. */
export function channelGain(s: AudioSettings, ch: Channel): number {
  if (s.muted) return 0;
  if (ch === "music") return s.music ? s.musicVolume : 0;
  if (ch === "alert") return s.alerts ? s.volume : 0;
  if (ch === "ambience") return s.sfx ? s.volume * 0.6 : 0;
  return s.sfx ? s.volume : 0;
}

/** Higher number = more important. Critical survival warnings win over everything else. */
export const ALERT_PRIORITY = {
  critical: 5, "low-oxygen": 4, radiation: 3, "low-energy": 3, "low-water": 3, "low-food": 3, malfunction: 3, meteor: 3, alert: 2, dust: 2,
} as const;
export type AlertKind = keyof typeof ALERT_PRIORITY;
export const isAlert = (k: string): k is AlertKind => k in ALERT_PRIORITY;
/** Minimum gap before the same warning may sound again. */
export const ALERT_COOLDOWN: Record<AlertKind, number> = {
  critical: 8000, "low-oxygen": 12000, radiation: 15000, "low-energy": 15000, "low-water": 15000, "low-food": 15000, malfunction: 6000, meteor: 4000, alert: 12000, dust: 15000,
};
/** How long a critical alert keeps the alert channel to itself. */
export const CRITICAL_HOLD_MS = 3000;

export interface AlertGate { until: number; priority: number; last: Map<string, number> }
export const newGate = (): AlertGate => ({ until: -Infinity, priority: 0, last: new Map() });
/** Only one alert sounds at a time: a more important one interrupts, an equal or lesser one is skipped. */
export function decideAlert(g: AlertGate, kind: AlertKind, key: string, now: number): "play" | "interrupt" | "skip" {
  if (now - (g.last.get(key) ?? -Infinity) < ALERT_COOLDOWN[kind]) return "skip";
  if (now < g.until) return ALERT_PRIORITY[kind] > g.priority ? "interrupt" : "skip";
  return "play";
}
export function claimAlert(g: AlertGate, kind: AlertKind, key: string, now: number, durationMs: number) {
  g.last.set(key, now); g.priority = ALERT_PRIORITY[kind];
  g.until = now + Math.max(durationMs + 400, kind === "critical" ? CRITICAL_HOLD_MS : 0);
}

/** Which warning sound belongs to a survival priority. */
export function alertSoundFor(p: Priority): AlertKind {
  if (p.level === 1) return "critical";
  if (p.id === "oxygen" || p.id === "lifesupport") return "low-oxygen";
  if (p.id === "water") return "low-water";
  if (p.id === "food") return "low-food";
  if (p.id === "energy") return "low-energy";
  if (p.id === "radiation") return "radiation";
  if (p.id === "broken") return "malfunction";
  return "alert";
}

/** Music turns tense during storms, events and critical danger; calm otherwise. */
export function musicMood(s: Sim): "calm" | "tense" {
  if (s.status !== "day") return "calm";
  if (s.event || stormPhase(s)) return "tense";
  return priorities(s).some((p) => p.level === 1) ? "tense" : "calm";
}

export type FacilitySound = "solar" | "oxygen" | "greenhouse" | "drill" | "lab";
const STATION_SOUND: Record<string, FacilitySound> = { solar: "solar", dome: "oxygen", greenhouse: "greenhouse", drill: "drill", lab: "lab" };
export interface Ambience { wind: number; storm: number; facility: FacilitySound | null }
/** Background sounds: Martian wind always, storm roar during dust storms, and the nearby facility only while it is actually running. */
export function ambienceFor(s: Sim, station: string | null): Ambience {
  if (s.status === "won" || s.status === "lost") return { wind: 0.5, storm: 0, facility: null };
  const w = weatherNow(s), dusty = s.status === "day" && (w === "dust" || w === "storm-flare");
  const approaching = stormPhase(s) === "approaching" && stormOf(s)?.kind === "dust";
  const sound = station ? STATION_SOUND[station] : undefined;
  const running = !!sound && facilityViews(s).some((f) => stationForFacility(f.kind) === station && f.status === "operational");
  return { wind: dusty ? 0.6 : 1, storm: dusty ? 1 : approaching ? 0.35 : 0, facility: running ? sound! : null };
}
