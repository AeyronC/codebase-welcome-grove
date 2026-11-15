import { useEffect, useRef, useState } from "react";
import { GameCanvas, type InputState, type PlacementCursor } from "./GameCanvas";
import { BuildMenu, FacilityPanel, PlacementBar, SHEET } from "./FacilityPanels";
import { Joystick } from "./Joystick";
import { PipPortrait } from "./Pip";
import { CharacterSelect } from "./CharacterSelect";
import { BUILDINGS, LANDMARKS } from "@/game/world";
import { canPlace, facilityName, stationForFacility, type BuildableKind, type Facility } from "@/game/facilities";
import { loadCharacter, loadSim, resetGame, saveCharacter, saveSim } from "@/game/storage";
import { beep, play, soundForAction, unlockAudio, getSettings, setSettings, setAmbience, setMusicMood, type AudioSettings } from "@/game/sound";
import { alertSoundFor, ambienceFor, musicMood } from "@/game/audioRules";
import { useCompact, useShortLandscape } from "@/hooks/use-compact";
import { newFx, type Nav } from "@/game/fx";
import { report, ACHIEVEMENTS, BREAK_NAMES, checkAchievements, EVENTS, resolveEvent, SITES, visibleSites, checkObjective, infoFor, OBJECTIVES, act, actionsFor, DAY_SECONDS, EVENT_INFO, eventOf, MAX_SOL, newSim, nextSol, SOL_EVENTS, tick, type Sim, priorities, pickPrimary, LEVEL_NAMES, stormPhase, stormOf, weatherNow, BREAK_STATION, type Priority, capacityOf, shieldOf, facilityViews, CLEANING_SECONDS, oxygenAlert, OXYGEN_LOW } from "@/game/sim";
import type { Character, Landmark } from "@/game/types";

const WELCOME = "Welcome to Mars, astronaut! I'm PIP, your colony buddy. Let's explore our new home!";
const STATION_NAMES: Record<string, string> = { solar: "Solar Farm", dome: "Command Dome · Life Support", greenhouse: "Greenhouse", drill: "Ice Drill", lab: "Research Lab · Science", hab: "Habitat · Living Conditions", rover: "Rover", shelter: "Radiation Shelter", storage: "Storage Depot" };
const STATION_ICON: Record<string, string> = { solar: "☀️", dome: "🫧", greenhouse: "🌱", drill: "💧", lab: "🔬", hab: "🏠", rover: "🚙", shelter: "🛡️", storage: "📦" };

function nearestStation(x: number, y: number, s: Sim): string | null {
  for (const site of visibleSites(s)) if (!s.discoveries.includes(site.id) && Math.hypot(x - site.x, y - site.y) < 120) return `site:${site.id}`;
  for (const b of s.facilities) {
    if (b.kind === "lander" || b.kind === "antenna" || b.remaining > 0) continue;
    if (Math.hypot(x - (b.x + b.w / 2), y - (b.y + b.h / 2)) < Math.max(b.w, b.h) / 2 + 90) return stationForFacility(b.kind);
  }
  return null;
}

function stationPoint(st: string, facilities?: Facility[], from?: { x: number; y: number }): { x: number; y: number; top: number } | null {
  if (st.startsWith("site:")) { const site = SITES.find((x) => x.id === st.slice(5)); return site ? { x: site.x, y: site.y, top: site.y - 110 } : null; }
  if (facilities) {
    const matches = facilities.filter((f) => f.remaining <= 0 && stationForFacility(f.kind) === st)
      .sort((a, b) => from ? Math.hypot(a.x + a.w / 2 - from.x, a.y + a.h / 2 - from.y) - Math.hypot(b.x + b.w / 2 - from.x, b.y + b.h / 2 - from.y) : Number(b.primary) - Number(a.primary));
    const f = matches[0]; if (f) return { x: f.x + f.w / 2, y: f.y + f.h / 2, top: f.y - 20 };
  }
  const b = BUILDINGS.find((x) => x.kind === st); return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2, top: b.y - 20 } : null;
}

/** Point for guidance; for the Solar Farm pick whichever panel field is closer. */
function targetPoint(st: string, from: { x: number; y: number }) {
  if (st !== "solar") return stationPoint(st);
  const b = BUILDINGS.filter((x) => x.kind === "solar").sort((a, c) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(c.x - from.x, c.y - from.y))[0];
  return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2, top: b.y - 20 } : null;
}

function hitStation(x: number, y: number, st: string, s: Sim): boolean {
  if (st.startsWith("site:")) { const p = stationPoint(st); return !!p && Math.hypot(x - p.x, y - p.y) < 80; }
  return s.facilities.some((b) => b.remaining <= 0 && stationForFacility(b.kind) === st && x > b.x - 20 && x < b.x + b.w + 20 && y > b.y - 40 && y < b.y + b.h + 20);
}

function FacilityButton({ station, view, facilities, pos, hud, label, onOpen }: { station: string; view: React.MutableRefObject<{ cx: number; cy: number; zoom: number }>; facilities: React.MutableRefObject<Facility[]>; pos: React.MutableRefObject<{ x: number; y: number }>; hud: React.MutableRefObject<{ top: number; bottom: number }>; label: React.ReactNode; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const p = stationPoint(station, facilities.current, pos.current), el = ref.current, v = view.current;
      if (p && el) {
        const vw = window.innerWidth, vh = window.innerHeight;
        const sx = vw / 2 + (p.x - v.cx) * v.zoom, sy = vh / 2 + (p.top - v.cy) * v.zoom;
        const w = el.offsetWidth, h = el.offsetHeight;
        const x = Math.max(8, Math.min(vw - w - 8, sx - w / 2));
        const lo = hud.current.top + 8, hi = Math.max(lo, hud.current.bottom - h - 8);
        const y = Math.max(lo, Math.min(hi, sy - h));
        el.style.transform = `translate(${x}px, ${y}px)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [station, view, facilities, pos, hud]);
  return (
    <button data-sfx ref={ref} onClick={onOpen} className="hud-panel start-btn pointer-events-auto absolute left-0 top-0 z-10 flex max-w-[80vw] items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold sm:px-5 sm:py-3 sm:text-lg" style={{ transform: "translate(-9999px,0)" }}>
      {label}
    </button>
  );
}

export function MarsGame() {
  const [ready, setReady] = useState(false);
  const [character, setCharacter] = useState<Character | null>(null);
  const [playing, setPlaying] = useState(false);
  const [runId, setRunId] = useState(0);
  const [sim, setSim] = useState<Sim>(newSim);
  const [pip, setPip] = useState(WELCOME);
  const [found, setFound] = useState<string[]>([]);
  const [station, setStation] = useState<string | null>(null);
  const [banner, setBanner] = useState(0);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [flash, setFlash] = useState<{ id: number; ok: boolean } | null>(null);
  const [showGoals, setShowGoals] = useState(false);
  const input = useRef<InputState>({ x: 0, y: 0 });
  const pos = useRef({ x: 0, y: 0 });
  const simRef = useRef(sim);
  const facilitiesRef = useRef(sim.facilities);
  const solarRef = useRef<{ cleanliness: number; progress: number | null }>({ cleanliness: sim.panels, progress: null });
  const placementRef = useRef<PlacementCursor | null>(null);
  const [placement, setPlacement] = useState<PlacementCursor | null>(null);
  const [facilitiesOpen, setFacilitiesOpen] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const toastRef = useRef(0);
  const markers = useRef<{ x: number; y: number }[]>([]);
  const speed = useRef(1);
  const view = useRef({ cx: 0, cy: 0, zoom: 1 });
  const zoom = useRef(1);
  const zoomStep = (dir: 1 | -1 | 0) => { zoom.current = dir === 0 ? 1 : stepZoom(zoom.current, dir); };
  const toastN = useRef(0);
  const [briefing, setBriefing] = useState(false);
  const briefRef = useRef(false);
  briefRef.current = briefing;
  const fx = useRef(newFx());
  const nav = useRef<Nav | null>(null);
  const primaryRef = useRef<string | null>(null);
  const primaryLevelRef = useRef<number | null>(null);
  const meteorN = useRef(0);
  const [primary, setPrimary] = useState<Priority | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [audio, setAudio] = useState<AudioSettings>(getSettings);
  const updAudio = (p: Partial<AudioSettings>) => { setSettings(p); setAudio(getSettings()); };
  useEffect(() => { unlockAudio(); }, []);
  const [logOpen, setLogOpen] = useState<"" | "log" | "ach">("");
  const compact = useCompact(), short = useShortLandscape();
  const [menuOpen, setMenuOpen] = useState(false);
  const [missionOpen, setMissionOpen] = useState(false);
  const [pipMin, setPipMin] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hudTopRef = useRef<HTMLDivElement>(null);
  const hudBottomRef = useRef<HTMLDivElement>(null);
  const hud = useRef({ top: 120, bottom: 600 });
  useEffect(() => { setPipMin(false); }, [pip]);
  // On phones, opening a management panel folds the alert list away so the panel gets the room.
  useEffect(() => { if (compact && (open || menuOpen || facilitiesOpen || buildOpen || placement)) setAlertsOpen(false); }, [compact, open, menuOpen, facilitiesOpen, buildOpen, placement]);
  // Track the space the top status bar and bottom controls take, so panels and buttons never overlap them.
  useEffect(() => {
    const measure = () => {
      const top = hudTopRef.current?.getBoundingClientRect().bottom ?? 120;
      const b = hudBottomRef.current?.getBoundingClientRect(), bottom = b && b.height > 0 ? b.top : window.innerHeight - 8;
      hud.current = { top, bottom };
      rootRef.current?.style.setProperty("--hud-top", `${Math.round(top)}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (hudTopRef.current) ro.observe(hudTopRef.current);
    if (hudBottomRef.current) ro.observe(hudBottomRef.current);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [ready, playing, compact]);
  // Block pinch-zoom and double-tap zoom gestures that some phones still allow.
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    const pinch = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    document.addEventListener("gesturestart", stop);
    document.addEventListener("touchmove", pinch, { passive: false });
    return () => { document.removeEventListener("gesturestart", stop); document.removeEventListener("touchmove", pinch); };
  }, []);
  simRef.current = sim;
  facilitiesRef.current = sim.facilities;
  solarRef.current = { cleanliness: sim.panels, progress: sim.cleaning > 0 ? 100 * (1 - sim.cleaning / CLEANING_SECONDS) : null };

  useEffect(() => { const c = loadCharacter(); setCharacter(c); setPlaying(!!c); const ls = loadSim() ?? newSim(); toastRef.current = ls.objective; setSim(ls); setReady(true); }, []);

  // Simulation clock + station proximity
  useEffect(() => {
    if (!playing) return;
    let last = performance.now(), saved = 0;
    const id = setInterval(() => {
      const now = performance.now(), dt = Math.min(1, (now - last) / 1000); last = now;
      if (document.hidden) return; // no background work while the game isn't on screen
      const prev = simRef.current, next = briefRef.current ? prev : reward(tick(prev, dt));
      if (next !== prev) {
        simRef.current = next; setSim(next);
        const completed = next.facilities.find((f) => f.built && f.remaining === 0 && prev.facilities.some((p) => p.id === f.id && p.remaining > 0));
        if (completed) { play("built", `built-${completed.id}`); setToast({ id: ++toastN.current, text: `🏗️ ${facilityName(completed)} is ready!` }); setPip("Construction complete! The new facility is now connected to the base. Check the Facility Status panel."); }
        const o2 = oxygenAlert(prev, next);
        if (o2) { play(o2 === "critical" ? "critical" : "low-oxygen", `oxygen-${o2}`); setToast({ id: ++toastN.current, text: o2 === "critical" ? "🚨 Oxygen critical — 10% left!" : "🫧 Oxygen low — 20% left!" }); }
        if (prev.cleaning > 0 && next.cleaning === 0 && next.status === "day") { play("goal", "panels-clean"); setToast({ id: ++toastN.current, text: "✨ Solar panels fully clean — maximum efficiency!" }); setPip("Excellent cleaning! The panels are now at 100% cleanliness and will generate much more energy."); }
        if (next.status !== prev.status) {
          play(next.status === "won" ? "win" : next.status === "lost" ? "lose" : "milestone");
          if (next.status === "summary") setPip(`Sol ${next.sol} is over! Check our supplies and get ready for tomorrow.`);
          if (next.status === "won") setPip("We survived 10 Sols on Mars! You're a true Mars Base Buddy!");
          if (next.status === "lost") setPip(`Oh no! ${report(next).cause?.title ?? "The base broke down"}. Let's learn from it and try again!`);
        }
        const ph = stormPhase(next), pph = stormPhase(prev), st = stormOf(next);
        if (st && ph !== pph) {
          const dust = st.kind === "dust";
          if (ph === "approaching") { play(dust ? "dust" : "radiation"); setToast({ id: ++toastN.current, text: dust ? "🌪️ Dust storm approaching!" : "☢️ Radiation storm detected!" }); setPip(dust ? "A dust storm is coming! Solar power will drop — save energy and clean the panels after." : "A radiation storm is coming! Our shielding will protect the crew — upgrade it at the Radiation Shelter."); }
          if (ph === "active") { play(dust ? "dust" : "radiation", "storm-on"); setPip(dust ? "🌪️ The dust storm is here! Less sunlight means less solar power." : "☢️ Radiation storm! Radiation is 5x stronger right now."); }
          if (!ph && pph === "active") setPip("The storm has passed. Conditions are back to normal!");
        }
        if ((saved += dt) > 3 || next.status !== prev.status) { saved = 0; saveSim(next); }
      }
      const cur = simRef.current, e = eventOf(cur);
      markers.current = visibleSites(cur).filter((x) => !cur.discoveries.includes(x.id));
      const wn = weatherNow(cur);
      speed.current = cur.status === "lost" ? 0 : cur.status === "day" && (wn === "dust" || wn === "storm-flare") ? 0.65 : 1;
      void e;
      // Priorities drive the alert sound, PIP warning and the one guidance arrow
      const list = cur.status === "day" && !briefRef.current ? priorities(cur) : [];
      const top = pickPrimary(list, primaryRef.current);
      if ((top?.id ?? null) !== primaryRef.current || (top?.level ?? null) !== primaryLevelRef.current) {
        primaryRef.current = top?.id ?? null; primaryLevelRef.current = top?.level ?? null; setPrimary(top);
        if (top && top.level <= 2) { play(alertSoundFor(top), `${top.id}-${top.level}`); setPip(`⚠️ ${top.title}! ${top.action}`); }
        else if (top && top.level === 4 && top.id.startsWith("obj-")) play("objective");
      } else if (top) setPrimary(top);
      const bp = cur.broken ? stationPoint(BREAK_STATION[cur.broken]) : null;
      fx.current.weather = cur.status === "day" ? wn : "clear";
      fx.current.approaching = stormPhase(cur) === "approaching" ? stormOf(cur)!.kind : null;
      fx.current.broken = bp ? { x: bp.x, y: bp.y } : null;
      if (cur.event?.kind === "meteor" && !fx.current.meteor) { const mp = stationPoint(BREAK_STATION[cur.event.target ?? "drill"]); if (mp) fx.current.meteor = { id: ++meteorN.current, x: mp.x, y: mp.y, impact: false }; }
      const tp = top?.station ? targetPoint(top.station, pos.current) : null;
      const nearT = top?.station && nearestStation(pos.current.x, pos.current.y, cur) === top.station;
      nav.current = getSettings().nav && tp && top && !nearT && !cur.event ? { x: tp.x, y: tp.top + 20, label: `${top.icon} ${top.guide}`, level: top.level, top: hud.current.top + 72, bottom: hud.current.bottom - 40 } : null;
      if (next.event && !prev.event) { placementRef.current = null; setPlacement(null); setBuildOpen(false); setFacilitiesOpen(false); play(next.event.kind === "meteor" ? "meteor" : next.event.kind === "malfunction" ? "malfunction" : "alert", "event"); setPip(`${EVENTS[next.event.kind].icon} ${EVENTS[next.event.kind].title}! We need to decide what to do.`); }
      const st = nearestStation(pos.current.x, pos.current.y, cur);
      setStation((o) => { if (o !== st) setOpen(false); return st; });
      setMusicMood(musicMood(cur)); setAmbience(ambienceFor(cur, briefRef.current ? null : st));
    }, 200);
    return () => { clearInterval(id); setAmbience(null); setMusicMood("calm"); };
  }, [playing]);

  function reward(s: Sim): Sim {
    const r = checkObjective(s);
    if (r.done && r.sim.objective > toastRef.current) { toastRef.current = r.sim.objective; play("goal"); setToast({ id: ++toastN.current, text: `🏆 Objective complete: ${r.done.title}! +10 🔩` }); setPip(`Great job! "${r.done.title}" done. Here are 10 bonus materials!`); }
    const a = checkAchievements(r.sim);
    for (const x of a.unlocked) { beep("goal"); setToast({ id: ++toastN.current, text: `⭐ Achievement unlocked: ${x.icon} ${x.title}` }); }
    return a.sim;
  }
  const choose = (i: number) => {
    const r = resolveEvent(simRef.current, i), ok = r.sim !== simRef.current;
    const wasMeteor = simRef.current.event?.kind === "meteor";
    play(ok ? "ok" : "fail"); if (r.msg) setPip(ok ? r.msg : `❌ ${r.msg}`);
    if (ok && wasMeteor && fx.current.meteor) { fx.current.meteor.impact = true; const m = fx.current.meteor; setTimeout(() => { if (fx.current.meteor === m) fx.current.meteor = null; }, 2500); }
    if (ok) { const n = reward(r.sim); simRef.current = n; setSim(n); saveSim(n); }
  };
  const doAction = (aid: string) => {
    const r = act(simRef.current, aid), ok = r.sim !== simRef.current;
    play(ok ? soundForAction(aid) : "fail"); setFlash({ id: Date.now(), ok });
    const n = reward(r.sim); simRef.current = n; facilitiesRef.current = n.facilities; setSim(n); saveSim(n); if (r.msg) setPip(ok ? r.msg : `❌ ${r.msg}`);
    return ok;
  };

  useEffect(() => {
    const kd = (e: KeyboardEvent) => { const k = e.key.toLowerCase();
      if (simRef.current.event && /^[12]$/.test(k)) { choose(Number(k) - 1); return; }
      if (k === "escape") { setOpen(false); setFacilitiesOpen(false); setBuildOpen(false); placementRef.current = null; setPlacement(null); return; }
      if (!station) return;
      if (open && /^[1-9]$/.test(k)) { const a = actionsFor(station, simRef.current)[Number(k) - 1]; if (a) doAction(a.id); } };
    window.addEventListener("keydown", kd); return () => window.removeEventListener("keydown", kd);
  }, [station, open]);

  if (!ready) return <div className="space-bg fixed inset-0" />;
  if (!playing || !character)
    return <CharacterSelect initial={character} onStart={(c) => { saveCharacter(c); const s = newSim(); toastRef.current = 0; saveSim(s); setSim(s); setCharacter(c); setFound([]); setPip(WELCOME); setBriefing(true); setPlaying(true); }} />;

  const onDiscover = (l: Landmark) => setFound((f) => { const n = [...f, l.id]; setPip(`${l.name}: ${l.pip}`); return n; });
  const ev = eventOf(sim), info = EVENT_INFO[ev];
  const alertList = sim.status === "day" ? priorities(sim) : [];
  const urgent = alertList.filter((x) => x.level <= 3);
  const beginSol = () => { const s = nextSol(sim); setSim(s); saveSim(s); setBanner((b) => b + 1); const i = EVENT_INFO[eventOf(s)]; setPip(`Sol ${s.sol}: ${i.label}! ${i.tip}`); };
  const goal = OBJECTIVES[sim.objective];
  /** Start a fresh mission: new simulation plus a remounted map so no position, alert, storm effect or open panel carries over. */
  const restart = () => {
    const s = newSim(); toastRef.current = 0; simRef.current = s; facilitiesRef.current = s.facilities;
    fx.current = newFx(); nav.current = null; primaryRef.current = null; primaryLevelRef.current = null;
    input.current = { x: 0, y: 0 }; speed.current = 1; placementRef.current = null; markers.current = [];
    setPlacement(null); setPrimary(null); setStation(null); setOpen(false); setFacilitiesOpen(false); setBuildOpen(false);
    setAlertsOpen(false); setLogOpen(""); setShowGoals(false); setToast(null); setFlash(null); setFound([]);
    setRunId((r) => r + 1); setBriefing(true); setSim(s); saveSim(s); setPip(WELCOME); setBanner((b) => b + 1);
  };
  const cancelPlacement = () => { placementRef.current = null; setPlacement(null); input.current = { x: 0, y: 0 }; };
  const chooseBuild = (kind: BuildableKind) => {
    let x = view.current.cx, y = view.current.cy, best = Number.POSITIVE_INFINITY;
    for (let sy = 480; sy <= 2200; sy += 80) for (let sx = 200; sx <= 3000; sx += 80) {
      const distance = Math.hypot(sx - view.current.cx, sy - view.current.cy);
      if (distance < best && canPlace(facilitiesRef.current, kind, sx, sy).ok) { x = sx; y = sy; best = distance; }
    }
    const p = { kind, x, y, focusX: x, focusY: y };
    placementRef.current = p; setPlacement(p); setBuildOpen(false); setFacilitiesOpen(false); setOpen(false);
    setPip("I found the nearest suitable plain! Tap or click another site to move the preview, then Confirm build. Nothing is spent yet.");
  };
  const confirmBuild = () => {
    const p = placementRef.current; if (!p) return;
    if (doAction(`build:${p.kind}:${Math.round(p.x)}:${Math.round(p.y)}`)) { cancelPlacement(); setBuildOpen(false); }
  };
  const facilityList = facilityViews(sim);
  const res = [
    { name: "Oxygen", icon: "🫧", value: (sim.oxygen / capacityOf(sim)) * 100, raw: sim.oxygen, cls: "bg-res-oxygen", low: OXYGEN_LOW, inclusive: true },
    { name: "Water", icon: "💧", value: (sim.water / capacityOf(sim)) * 100, raw: sim.water, cls: "bg-res-water", low: 20 },
    { name: "Food", icon: "🥕", value: (sim.food / capacityOf(sim)) * 100, raw: sim.food, cls: "bg-res-food", low: 20 },
    { name: "Energy", icon: "⚡", value: sim.energy, cls: "bg-res-energy", low: 15 },
    { name: "Shield", icon: "🛡️", value: shieldOf(sim), cls: "bg-res-shield", low: -1 },
    { name: "Base", icon: "🏠", value: sim.condition, cls: "bg-res-condition", low: 35 },
  ];
  const resBar = (
    <>
      {res.map((r) => <Res key={r.name} {...r} />)}
      <div className={`flex items-center gap-1 text-xs font-bold ${sim.exposure > 60 ? "text-destructive animate-pulse" : ""}`} title="Radiation dose (lower is better)">☢️ {Math.round(sim.exposure)}</div>
      <div className="flex items-center gap-1 text-xs font-bold" title="Building materials">🔩 {sim.materials}</div>
    </>
  );
  const actions = station ? actionsFor(station, sim) : [];
  const site = station?.startsWith("site:") ? SITES.find((x) => x.id === station.slice(5)) : undefined;
  const stName = site ? `${site.name} · Exploration site` : station ? STATION_NAMES[station] : "";
  const stIcon = site ? "🔍" : station ? STATION_ICON[station] : "";
  const evDef = sim.event ? EVENTS[sim.event.kind] : null;
  const off = sim.unpowered.length > 0;

  const toggleFacilities = () => { play(facilitiesOpen ? "close" : "open"); setFacilitiesOpen((v) => !v); setBuildOpen(false); cancelPlacement(); setOpen(false); setMenuOpen(false); };
  const toggleBuild = () => { play(buildOpen ? "close" : "open"); setBuildOpen((v) => !v); setFacilitiesOpen(false); cancelPlacement(); setOpen(false); setMenuOpen(false); };
  const toggleMenu = () => { play(menuOpen ? "close" : "open"); setMenuOpen((v) => !v); setFacilitiesOpen(false); setBuildOpen(false); setOpen(false); };
  const closeStation = () => { play("close"); setOpen(false); };
  const sheetOpen = compact && (open || menuOpen);
  const btn = "hud-btn rounded-lg bg-hud-ink/50 px-2 py-1 text-xs font-bold hover:bg-hud-ink";
  const settingsBody = (
    <div className={`mt-1.5 space-y-1.5 text-xs ${compact ? "w-full" : "w-60"}`}>
      <label className="flex min-h-8 items-center justify-between gap-2">🔇 Mute everything <input type="checkbox" className="size-5" checked={audio.muted} onChange={(e) => updAudio({ muted: e.target.checked })} /></label>
      <label className="flex min-h-8 items-center justify-between gap-2">🎵 Background music <input type="checkbox" className="size-5" checked={audio.music} onChange={(e) => updAudio({ music: e.target.checked })} /></label>
      <label className="flex min-h-8 items-center justify-between gap-2">🎚️ Music volume <input type="range" aria-label="Music volume" min={0} max={1} step={0.05} value={audio.musicVolume} onChange={(e) => updAudio({ musicVolume: Number(e.target.value) })} className="w-28" /></label>
      <label className="flex min-h-8 items-center justify-between gap-2">🔔 Sound effects <input type="checkbox" className="size-5" checked={audio.sfx} onChange={(e) => updAudio({ sfx: e.target.checked })} /></label>
      <label className="flex min-h-8 items-center justify-between gap-2">🔉 Effects volume <input type="range" aria-label="Sound effects volume" min={0} max={1} step={0.05} value={audio.volume} onChange={(e) => updAudio({ volume: Number(e.target.value) })} className="w-28" /></label>
      <label className="flex min-h-8 items-center justify-between gap-2">🚨 Warning sounds <input type="checkbox" className="size-5" checked={audio.alerts} onChange={(e) => updAudio({ alerts: e.target.checked })} /></label>
      <label className="flex min-h-8 items-center justify-between gap-2">🧭 Guide arrows <input type="checkbox" className="size-5" checked={audio.nav} onChange={(e) => updAudio({ nav: e.target.checked })} /></label>
    </div>
  );
  const menuBody = (
    <>
      <div className="flex flex-wrap gap-1">
        <button onClick={() => setLogOpen((v) => (v === "log" ? "" : "log"))} aria-pressed={logOpen === "log"} className={btn}>📜 Log</button>
        <button onClick={() => setSettingsOpen((v) => !v)} aria-pressed={settingsOpen} aria-label="Sound and guidance settings" className={btn}>{audio.muted ? "🔇" : "🔊"}{compact && " Sound"}</button>
        <button onClick={() => setLogOpen((v) => (v === "ach" ? "" : "ach"))} aria-pressed={logOpen === "ach"} className={btn}>⭐ {sim.achievements.length}/{ACHIEVEMENTS.length}</button>
      </div>
      {settingsOpen && settingsBody}
      {logOpen === "log" && <ul className="hud-scroll mt-1 max-h-[40dvh] space-y-0.5 pr-1 text-xs">{sim.log.map((l, i) => <li key={i}><span className="text-hud-muted">S{l.sol}</span> {l.icon} {l.text}</li>)}</ul>}
      {logOpen === "ach" && <ul className="hud-scroll mt-1 max-h-[40dvh] space-y-0.5 text-xs">{ACHIEVEMENTS.map((a) => { const got = sim.achievements.includes(a.id); return <li key={a.id} className={got ? "font-bold text-accent" : "text-hud-muted"}>{got ? a.icon : "🔒"} {a.title}</li>; })}</ul>}
      <button onClick={() => { resetGame(); setPlaying(false); setMenuOpen(false); }} className="mt-1.5 min-h-8 text-xs underline decoration-dotted hover:text-accent">Restart / switch astronaut</button>
    </>
  );
  const onClickCapture = (e: React.MouseEvent) => {
    const b = (e.target as HTMLElement).closest("button");
    if (b && !b.disabled && !b.hasAttribute("data-sfx")) play("click");
  };

  return (
    <div ref={rootRef} onClickCapture={onClickCapture} className="game-root fixed inset-0 overflow-hidden">
      <GameCanvas key={runId} character={character} input={input} onDiscover={onDiscover} posRef={pos} markersRef={markers} speedRef={speed} viewRef={view} fxRef={fx} navRef={nav} facilitiesRef={facilitiesRef} solarRef={solarRef} zoomRef={zoom} placementRef={placementRef} onPlacement={(x, y) => { const p = placementRef.current; if (p) setPlacement({ ...p, x, y }); }} onWorldClick={(x, y) => { if (station && !open && !sim.event && !briefing && hitStation(x, y, station, sim)) { beep("open"); setOpen(true); setMenuOpen(false); } }} />
      <div className="hud-safe pointer-events-none absolute inset-0 text-hud-fg">
        <div ref={hudTopRef}>
        <div className="flex items-start justify-between gap-2">
          <div className={`hud-panel pointer-events-auto shrink-0 rounded-2xl ${compact ? "px-2 py-1.5" : "hud-scroll max-h-[calc(100dvh-1rem)] px-3 py-2"}`}>
            {!compact && <div className="font-display text-base font-bold leading-tight sm:text-xl">🪐 Mars Base Buddies</div>}
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <span className="whitespace-nowrap rounded-full bg-primary px-2 font-bold text-primary-foreground">SOL {sim.sol}/{MAX_SOL}</span>
              <span className="whitespace-nowrap" title={info.tip}>{info.icon}{!compact && ` ${info.label}`}</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-hud-ink/60" title="Time of day"><div className="h-full bg-accent" style={{ width: `${(sim.time / DAY_SECONDS) * 100}%` }} /></div>
            <div className="mt-1.5 flex gap-1">
              {compact && <button data-sfx onClick={toggleMenu} aria-label="Menu, log and sound settings" aria-expanded={menuOpen} className={`${btn} text-lg`}>☰</button>}
              <button data-sfx onClick={toggleFacilities} aria-label="Open facility status monitor" aria-expanded={facilitiesOpen} className={`${btn} ${compact ? "text-lg" : ""}`}>🏢{!compact && " Facilities"}</button>
              <button data-sfx onClick={toggleBuild} aria-label="Build a new facility" aria-expanded={buildOpen} className={`hud-btn start-btn rounded-lg px-2.5 py-1 text-xs font-bold ${compact ? "text-lg" : ""}`}>🔨{compact ? "" : " BUILD"}</button>
            </div>
            {!compact && <div className="mt-1.5">{menuBody}</div>}
          </div>
          <div className={`hud-panel min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl px-3 py-2 ${short ? "flex flex-1" : "hidden lg:flex"}`} aria-label="Base supplies">{resBar}</div>
          <div className={`hud-panel pointer-events-auto rounded-2xl ${short ? "w-56 shrink-0 px-2.5 py-1.5" : compact ? "min-w-0 max-w-[24rem] flex-1 px-2.5 py-1.5" : "w-[min(48vw,26rem)] shrink-0 px-3 py-2.5 sm:px-4 sm:py-3 md:w-[26rem] lg:w-[min(26rem,30vw)] xl:w-[28rem]"}`}>
            {compact ? (
              <button onClick={() => setMissionOpen((v) => !v)} aria-expanded={missionOpen} aria-label="Mission details" className="flex min-h-9 w-full min-w-0 items-center gap-1.5 text-left">
                <span className="shrink-0 text-sm">🎯</span>
                <span className="min-w-0 flex-1 truncate font-display text-sm font-bold leading-tight">{goal ? goal.title : "All objectives complete! 🏆"}</span>
                <span className="shrink-0 text-[10px] text-hud-muted">{sim.objective}/{OBJECTIVES.length} {missionOpen ? "▲" : "▼"}</span>
              </button>
            ) : (
              <div className="text-[11px] font-bold uppercase tracking-widest text-accent sm:text-xs">🎯 Mission</div>
            )}
            {(!compact || missionOpen) && (
              <div className={compact ? "hud-scroll max-h-[45dvh]" : ""}>
                <button onClick={() => setShowGoals((v) => !v)} className="mt-1 block w-full text-left">
                  {!compact && <div className="font-display text-base font-bold leading-snug sm:text-lg md:text-xl">{goal ? goal.title : "All objectives complete! 🏆"}</div>}
                  {goal && <div className="mt-1 text-xs leading-snug text-hud-muted sm:text-sm">{goal.hint}</div>}
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-hud-ink/60"><div className="h-full bg-res-food transition-all" style={{ width: `${(sim.objective / OBJECTIVES.length) * 100}%` }} /></div>
                  <div className="mt-1.5 text-xs text-hud-muted sm:text-sm">Objectives {sim.objective}/{OBJECTIVES.length} · Places {found.length}/{LANDMARKS.length} · 🔍 {sim.discoveries.length} <span className="underline">{showGoals ? "hide" : "list"}</span></div>
                </button>
                {showGoals && <ol className="hud-scroll mt-2 max-h-[40dvh] space-y-1 border-t border-hud-fg/15 pt-2 text-xs sm:text-sm">{OBJECTIVES.map((o, i) => <li key={o.title} className={i < sim.objective ? "text-res-food" : i === sim.objective ? "font-bold" : "text-hud-muted"}>{i < sim.objective ? "✅" : i === sim.objective ? "▶️" : "🔒"} {o.title}</li>)}</ol>}
              </div>
            )}
            {compact && !missionOpen && <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-hud-ink/60"><div className="h-full bg-res-food" style={{ width: `${(sim.objective / OBJECTIVES.length) * 100}%` }} /></div>}
            {sim.broken && <div className="mt-1.5 text-xs font-bold text-destructive sm:text-sm">🔧 Broken: {BREAK_NAMES[sim.broken]}</div>}
            {off && <div className="mt-1.5 text-xs font-bold text-destructive sm:text-sm">⚡ No power: {sim.unpowered.join(", ")}</div>}
          </div>
        </div>
        {!short && <div className="hud-panel pointer-events-auto mx-auto mt-2 flex w-fit max-w-full flex-wrap justify-center gap-x-3 gap-y-1 rounded-2xl px-3 py-1.5 lg:hidden" aria-label="Base supplies">{resBar}</div>}
        </div>
        {sim.status === "day" && !briefing && (primary || alertList.length > 0) && (
          <div className="mx-auto mt-2 w-fit max-w-[min(94vw,30rem)]">
            {primary && (
              <button onClick={() => setAlertsOpen((v) => !v)} aria-expanded={alertsOpen} className={`pointer-events-auto flex min-h-8 w-full items-center gap-2 rounded-full px-3 py-1 text-left text-xs font-bold sm:text-sm ${primary.level === 1 ? "animate-pulse bg-destructive text-destructive-foreground" : primary.level === 2 ? "bg-primary text-primary-foreground" : "hud-panel"}`}>
                <span className="rounded-full bg-hud-ink/40 px-1.5 text-[10px] text-hud-fg">{LEVEL_NAMES[primary.level]}</span>
                <span className="truncate">{primary.icon} {primary.level === 4 ? `Next: ${primary.title}` : primary.guide}</span>
                <span className="ml-auto whitespace-nowrap text-[11px] underline">{urgent.length > 1 ? `+${urgent.length - 1} more` : "details"}</span>
              </button>
            )}
            {alertsOpen && (
              <ul className="hud-panel hud-scroll pointer-events-auto mt-1 max-h-[40dvh] space-y-1.5 rounded-2xl p-2 text-xs">
                {alertList.map((a) => (
                  <li key={a.id} className={`rounded-lg bg-hud-ink/40 px-2 py-1 ${a.id === primary?.id ? "ring-2 ring-accent" : ""}`}>
                    <div className="font-bold"><span className={a.level === 1 ? "text-destructive" : a.level === 2 ? "text-primary" : "text-accent"}>{LEVEL_NAMES[a.level]}</span> {a.icon} {a.title}</div>
                    <div className="text-hud-muted">Why: {a.why}</div>
                    <div>👉 {a.action}{a.station ? ` (${STATION_NAMES[a.station]?.split(" · ")[0] ?? a.station})` : ""}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {sim.status === "day" && banner > 0 && (
          <div key={`banner-${banner}`} className="sol-banner absolute inset-x-0 top-1/3 text-center">
            <div className="font-display text-4xl font-bold drop-shadow-lg sm:text-6xl">SOL {sim.sol}</div>
            <div className="text-lg font-bold">{info.icon} {info.label}</div>
          </div>
        )}

        {briefing && sim.status === "day" && (
          <div className="event-pop hud-panel hud-scroll pointer-events-auto absolute left-1/2 top-1/2 max-h-[85dvh] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-4">
            <div className="text-center text-[10px] font-bold uppercase tracking-widest text-accent">Junior Astronaut Mission Briefing</div>
            <div className="text-center font-display text-2xl font-bold">Build a home on Mars 🚀</div>
            <p className="mt-1 text-center text-sm">Keep your crew alive for <b>10 Sols</b> (Martian days). Every machine is connected — choose wisely!</p>
            <ul className="mt-2 space-y-1 text-xs sm:text-sm">
              <li>🫧 <b>Oxygen</b> — Mars air can't be breathed. The generator makes oxygen from water + energy.</li>
              <li>💧 <b>Water</b> — frozen underground. The Ice Drill digs it up using energy.</li>
              <li>🥕 <b>Food</b> — the Greenhouse grows it with water + energy.</li>
              <li>⚡ <b>Energy</b> — solar panels. Less sun in dust storms and when panels are dusty!</li>
              <li>🛡️ <b>Shielding</b> — blocks space radiation. Upgrade it before solar flares.</li>
              <li>🏠 <b>Base</b> — shortages slowly damage the base. If it reaches 0, the mission fails.</li>
              <li>🔍 <b>Explore</b> blue <b>?</b> sites for discoveries, then study them at the Research Lab.</li>
            </ul>
            <p className="mt-2 text-center text-xs text-hud-muted">{compact ? "Move with the joystick and pinch to zoom, then tap a building's button to use it. Tap ☰ for sound settings." : "Walk up to a building, then click its button or the building itself to use it."}</p>
            <div className="text-center"><button data-sfx onClick={() => { beep("goal"); setBriefing(false); setBanner((b) => b + 1); }} className="start-btn mt-3 rounded-xl px-6 py-2 font-bold">Start mission!</button></div>
          </div>
        )}
        {sim.status !== "day" && (
          <div className={`hud-panel hud-scroll pointer-events-auto absolute left-1/2 top-1/2 max-h-[90dvh] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-4 text-center ${sim.status === "summary" ? "w-[min(92vw,360px)]" : "event-pop w-[min(94vw,560px)]"}`}>
            {sim.status === "summary" && <>
              <div className="font-display text-2xl font-bold">Sol {sim.sol} complete! 🌙</div>
              <p className="mt-1 text-sm text-hud-muted">Time is paused. Walk to buildings to switch systems, repair or upgrade before tomorrow.</p>
              <div className="mt-3 rounded-xl bg-hud-ink/40 p-2 text-sm"><b>Tomorrow: {EVENT_INFO[SOL_EVENTS[sim.sol] ?? "clear"].icon} {EVENT_INFO[SOL_EVENTS[sim.sol] ?? "clear"].label}</b><div className="text-xs">{EVENT_INFO[SOL_EVENTS[sim.sol] ?? "clear"].tip}</div></div>
              <button onClick={beginSol} className="start-btn mt-3 rounded-xl px-5 py-2 font-bold">Begin Sol {sim.sol + 1}</button>
            </>}
            {sim.status !== "summary" && <MissionReport sim={sim} onRestart={restart} />}
          </div>
        )}

        {evDef && sim.event && sim.status === "day" && (
          <div className="event-pop hud-panel hud-scroll pointer-events-auto absolute left-1/2 top-1/2 max-h-[90dvh] w-[min(92vw,380px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-3 text-center">
            <div className="text-4xl">{evDef.icon}</div>
            <div className="font-display text-xl font-bold">{evDef.title}</div>
            <p className="text-sm">{evDef.text(sim)}</p>
            <p className="mt-0.5 text-[11px] text-hud-muted">Time is paused. Choose wisely:</p>
            {evDef.choices(sim).map((c, i) => (
              <button data-sfx key={c.label} onClick={() => choose(i)} className="mt-2 block w-full rounded-xl bg-primary px-3 py-2 text-left text-primary-foreground active:scale-95">
                <div className="text-sm font-bold">{i + 1}. {c.label}</div>
                <div className="text-xs">👍 {c.pro}</div><div className="text-xs">👎 {c.con}</div>
              </button>
            ))}
          </div>
        )}
        {toast && <div key={`toast-${toast.id}`} className="sol-banner absolute inset-x-0 top-[22%] text-center"><span className="hud-panel inline-block rounded-2xl px-4 py-2 text-base font-bold text-accent sm:text-lg">{toast.text}</span></div>}

        {facilitiesOpen && !sim.event && !briefing && <FacilityPanel compact={compact} facilities={facilityList} onClose={() => { play("close"); setFacilitiesOpen(false); }} onToggle={(id) => doAction(`facility-toggle:${id}`)} onRepair={(id) => doAction(`facility-repair:${id}`)} />}
        {buildOpen && !sim.event && !briefing && <BuildMenu compact={compact} sim={sim} onSelect={chooseBuild} onClose={() => { play("close"); setBuildOpen(false); }} />}
        {placement && !sim.event && !briefing && <PlacementBar compact={compact} sim={sim} {...placement} onConfirm={confirmBuild} onCancel={() => { play("close"); cancelPlacement(); }} />}

        {compact && menuOpen && !sim.event && !briefing && (
          <section role="dialog" aria-label="Menu" className={SHEET}>
            <header className="mb-2 flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold text-accent">🪐 Mars Base Buddies</h2>
              <button data-sfx onClick={toggleMenu} aria-label="Close menu" className="hud-btn rounded-lg bg-hud-ink/50 px-2 py-1 text-lg">✕</button>
            </header>
            <div className="mb-2 text-xs text-hud-muted">{info.icon} {info.label} — {info.tip}</div>
            {menuBody}
          </section>
        )}

        {station && !open && !sim.event && !briefing && !placement && !facilitiesOpen && !buildOpen && !sheetOpen && (
          <FacilityButton station={station} view={view} facilities={facilitiesRef} pos={pos} hud={hud} onOpen={() => { beep("open"); setOpen(true); setMenuOpen(false); }} label={<><span className="text-2xl">{stIcon}</span><span>Open {stName}</span></>} />
        )}
        {station && open && !placement && !facilitiesOpen && !buildOpen && (
          <div key={flash?.id} className={`${compact ? SHEET : "hud-panel hud-scroll pointer-events-auto absolute bottom-28 left-1/2 max-h-[calc(100dvh-var(--hud-top,10rem)-8rem)] w-[min(94vw,470px)] -translate-x-1/2 rounded-2xl p-4"} ${flash ? (flash.ok ? "panel-ok" : "panel-fail") : ""}`}>
            <div className="mb-2 flex items-center justify-between text-sm font-bold uppercase tracking-wider text-accent sm:text-base">
              <span>{stIcon} {stName}</span>
              <button data-sfx onClick={closeStation} aria-label="Close" className="hud-btn rounded px-2 py-0.5 text-lg text-hud-fg hover:bg-hud-ink/40">✕</button>
            </div>
            {site && <div className="mb-2 rounded-xl bg-hud-ink/40 px-3 py-2 text-sm">{sim.discoveries.includes(site.id) ? `✅ Scanned: ${site.discovery}` : "Something interesting is here! Scanning uses suit power and oxygen — more during dust storms."}</div>}
            <ul className="space-y-0.5 rounded-xl bg-hud-ink/40 px-3 py-2 text-sm leading-relaxed sm:text-base">{infoFor(station, sim).map((l) => <li key={l}>{l}</li>)}</ul>
            {actions.length === 0 && <div className="mt-2 text-center text-sm text-hud-muted">Nothing left to build here!</div>}
            {actions.map((a, i) => (
              <button data-sfx key={a.id} onClick={() => doAction(a.id)} className="mt-2 flex min-h-11 w-full items-center justify-between gap-2 rounded-xl bg-primary px-4 py-2.5 text-left text-sm font-bold text-primary-foreground active:scale-95 sm:text-base">
                <span><span className="desktop-only mr-1 rounded bg-hud-ink/40 px-1 text-xs">{i + 1}</span>{a.label}</span>{a.cost && <span className="whitespace-nowrap text-sm">{a.cost}</span>}
              </button>
            ))}
          </div>
        )}

        <div ref={hudBottomRef} className={`absolute inset-x-[max(0.5rem,env(safe-area-inset-left))] bottom-[max(0.5rem,env(safe-area-inset-bottom))] flex ${sim.status === "won" || sim.status === "lost" || briefing || facilitiesOpen || buildOpen || placement || sheetOpen ? "hidden" : ""} items-end justify-between gap-2`}>
          <div className="touch-only"><Joystick input={input} /></div>
          <div className="desktop-only hud-panel rounded-xl px-3 py-1.5 text-xs">Move: WASD / Arrows · Zoom: scroll / + − · Open: click building · Choose: 1–5</div>
          <div className="flex min-w-0 flex-col items-end gap-1.5">
          <div className="hud-panel pointer-events-auto flex items-center gap-1 rounded-xl p-1" role="group" aria-label="Map zoom">
            <button onClick={() => zoomStep(-1)} aria-label="Zoom out" title="Zoom out (−)" className="hud-btn h-8 w-8 rounded-lg bg-hud-ink/50 text-lg font-bold hover:bg-hud-ink">−</button>
            <button onClick={() => zoomStep(0)} aria-label="Reset zoom" title="Reset zoom (0)" className="hud-btn h-8 w-8 rounded-lg bg-hud-ink/50 text-sm font-bold hover:bg-hud-ink">⟲</button>
            <button onClick={() => zoomStep(1)} aria-label="Zoom in" title="Zoom in (+)" className="hud-btn h-8 w-8 rounded-lg bg-hud-ink/50 text-lg font-bold hover:bg-hud-ink">+</button>
          </div>
          <button onClick={() => setPipMin((v) => !v)} aria-label={pipMin ? "Show PIP's message" : "Hide PIP's message"} aria-expanded={!pipMin} className={`hud-panel pointer-events-auto flex min-w-0 items-end gap-2 rounded-2xl p-1.5 text-left sm:p-2 ${pipMin ? "" : compact ? "max-w-[min(62vw,22rem)]" : "max-w-[60vw] sm:max-w-sm"}`}>
            <span className="shrink-0 rounded-xl bg-hud-ink/40 p-1"><PipPortrait size={compact ? 44 : 56} /></span>
            {!pipMin && (
              <span className="min-w-0">
                <span className="block font-display text-sm font-bold text-accent">PIP</span>
                <span key={pip} className="pip-text block text-xs leading-snug sm:text-sm">{pip}</span>
              </span>
            )}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Res({ name, icon, value, raw, cls, low, inclusive }: { name: string; icon: string; value: number; raw?: number; cls: string; low: number; inclusive?: boolean }) {
  const v = Math.round(raw ?? value), w = Math.min(100, Math.round(value)), danger = inclusive ? value <= low : value < low;
  return (
    <div className={`flex items-center gap-1 ${danger ? "animate-pulse" : ""}`} title={name}>
      <span className="text-sm">{icon}</span>
      <div className="hidden text-[10px] font-bold uppercase 2xl:block">{name}</div>
      <div className="h-2 w-7 overflow-hidden rounded-full bg-hud-ink/60 sm:w-12"><div className={`h-full ${danger ? "bg-destructive" : cls}`} style={{ width: `${w}%` }} /></div>
      <span className={`text-xs font-bold ${danger ? "text-destructive" : ""}`}>{v}</span>
    </div>
  );
}

function Stars({ n }: { n: number }) { return <span className="whitespace-nowrap text-accent" aria-label={`${n} of 3 stars`}>{"★".repeat(n)}<span className="text-hud-muted">{"★".repeat(3 - n)}</span></span>; }

function MissionReport({ sim, onRestart }: { sim: Sim; onRestart: () => void }) {
  const r = report(sim), won = sim.status === "won";
  return (
    <div className="text-left">
      <div className="text-center text-[10px] font-bold uppercase tracking-widest text-accent">Final Mission Report</div>
      <div className="text-center font-display text-2xl font-bold sm:text-3xl">{won ? "Mission complete! 🎉" : "Mission failed 💥"}</div>
      <div className="text-center text-sm font-bold">{r.grade}</div>
      {r.cause && <div className="mt-2 rounded-xl bg-destructive/30 p-2 text-sm"><b>{r.cause.title}.</b> {r.cause.lesson}</div>}
      <div className="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
        <div className="rounded-lg bg-hud-ink/40 p-1"><div className="text-lg font-bold">{r.solsSurvived.toFixed(1).replace(".0", "")}</div>Sols survived</div>
        <div className="rounded-lg bg-hud-ink/40 p-1"><div className="text-lg font-bold">{sim.objective}/{OBJECTIVES.length}</div>Objectives</div>
        <div className="rounded-lg bg-hud-ink/40 p-1"><div className="text-lg font-bold">{sim.discoveries.length}</div>Discoveries</div>
      </div>
      <div className="mt-2 text-xs">Final supplies: 🫧 {Math.round(sim.oxygen)} · 💧 {Math.round(sim.water)} · 🥕 {Math.round(sim.food)} · ⚡ {Math.round(sim.energy)} · 🛡️ {Math.round(sim.shield)}% · 🏠 {Math.round(sim.condition)}%</div>
      <ul className="mt-2 space-y-1">
        {r.ratings.map((x) => (
          <li key={x.label} className="rounded-lg bg-hud-ink/40 px-2 py-1 text-xs">
            <div className="flex justify-between gap-2 font-bold"><span>{x.icon} {x.label}</span><Stars n={x.stars} /></div>
            <div className="text-hud-muted">{x.value}</div>
          </li>
        ))}
      </ul>
      {r.strengths.length > 0 && <div className="mt-2 text-xs"><b className="text-res-food">💪 Strengths</b><ul>{r.strengths.map((t) => <li key={t}>{t}</li>)}</ul></div>}
      {r.improve.length > 0 && <div className="mt-2 text-xs"><b className="text-accent">🎯 Next time</b><ul>{r.improve.map((t) => <li key={t}>{t}</li>)}</ul></div>}
      {r.decisions.length > 0 && <div className="mt-2 text-xs"><b>🗳️ Your big decisions</b><ul className="text-hud-muted">{r.decisions.slice(0, 6).map((t, i) => <li key={i}>• {t}</li>)}</ul></div>}
      {sim.discoveries.length > 0 && <div className="mt-2 text-xs"><b>🔬 Discoveries:</b> {sim.discoveries.map((d) => SITES.find((x) => x.id === d)?.discovery).join(", ")}</div>}
      <div className="text-center"><button onClick={onRestart} className="start-btn mt-3 rounded-xl px-6 py-2 font-bold">Play again</button></div>
    </div>
  );
}
