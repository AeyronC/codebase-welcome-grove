import { useState } from "react";
import { BUILD_DEFS, BUILDABLE_KINDS, canPlace, type BuildableKind } from "@/game/facilities";
import { missingForCost, type FacilityView, type Sim } from "@/game/sim";

const STATUS_LABEL: Record<FacilityView["status"], string> = {
  operational: "● OPERATIONAL", inactive: "○ INACTIVE · OFF", damaged: "🔧 DAMAGED · NEEDS REPAIR", construction: "◌ UNDER CONSTRUCTION", unpowered: "⚡ NO POWER",
};
const STATUS_CLASS: Record<FacilityView["status"], string> = {
  operational: "text-res-food", inactive: "text-hud-muted", damaged: "text-destructive", construction: "text-accent", unpowered: "text-primary",
};

/** Small screens: panels become a bottom sheet that never covers the top status bar and scrolls when long. */
export const SHEET = "hud-panel hud-scroll pointer-events-auto absolute inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] mx-auto max-w-[520px] max-h-[calc(100dvh-var(--hud-top,8rem)-1rem)] rounded-2xl p-3";

export function FacilityPanel({ facilities, compact, onClose, onToggle, onRepair }: {
  facilities: FacilityView[];
  compact?: boolean;
  onClose: () => void;
  onToggle: (id: string) => void;
  onRepair: (id: string) => void;
}) {
  const [pendingOff, setPendingOff] = useState<string | null>(null);
  const pending = facilities.find((f) => f.id === pendingOff);
  const operational = facilities.filter((f) => f.status === "operational").length;
  const requestToggle = (f: FacilityView) => {
    if (f.enabled && f.essential) { setPendingOff(f.id); return; }
    setPendingOff(null); onToggle(f.id);
  };
  return (
    <section role="dialog" aria-label="Facility status monitor" className={compact ? `${SHEET} flex flex-col` : "hud-panel pointer-events-auto absolute right-3 top-[calc(var(--hud-top,10rem)+0.5rem)] flex max-h-[calc(100dvh-var(--hud-top,10rem)-1.5rem)] w-[min(94vw,390px)] flex-col rounded-2xl p-3"}>
      <header className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-bold text-accent">🏢 Facility Status</h2>
          <p className="text-xs text-hud-muted">{operational}/{facilities.length} operational · updates live</p>
        </div>
        <button data-sfx onClick={onClose} aria-label="Close facility status" className="hud-btn rounded-lg bg-hud-ink/50 px-2 py-1 text-lg">✕</button>
      </header>
      {pending && (
        <div role="alert" className="mb-2 rounded-xl border-2 border-primary bg-hud-ink/70 p-2 text-xs">
          <div className="font-bold text-primary">⚠️ Switch off {pending.name}?</div>
          <p className="mt-1">{pending.warning}</p>
          <div className="mt-2 flex gap-2">
            <button onClick={() => setPendingOff(null)} className="hud-btn flex-1 rounded-lg bg-hud-ink px-3 py-2 font-bold">Keep it ON</button>
            <button data-sfx onClick={() => { setPendingOff(null); onToggle(pending.id); }} className="hud-btn flex-1 rounded-lg bg-destructive px-3 py-2 font-bold text-destructive-foreground">Switch OFF</button>
          </div>
        </div>
      )}
      <ul className="hud-scroll min-h-0 space-y-1.5 pr-1">
        {facilities.map((f) => {
          const def = BUILD_DEFS[f.kind as BuildableKind];
          const progress = def && f.remaining > 0 ? Math.round((1 - f.remaining / def.duration) * 100) : 100;
          return (
            <li key={f.id} className="rounded-xl bg-hud-ink/45 p-2">
              <div className="flex items-center gap-2">
                <span className="text-xl" aria-hidden>{f.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{f.name}</div>
                  <div className={`text-[10px] font-bold ${STATUS_CLASS[f.status]}`}>{STATUS_LABEL[f.status]}</div>
                </div>
                {f.status === "damaged" ? (
                  <button data-sfx onClick={() => onRepair(f.id)} className="hud-btn shrink-0 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-bold text-primary-foreground">Repair · 10 🔩</button>
                ) : f.controllable && f.remaining <= 0 ? (
                  <button data-sfx={f.enabled && f.essential ? undefined : ""} onClick={() => requestToggle(f)} aria-label={`Switch ${f.name} ${f.enabled ? "off" : "on"}`} className={`hud-btn min-w-14 shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold ${f.enabled ? "bg-hud-ink text-hud-fg" : "bg-res-food text-hud-ink"}`}>
                    {f.enabled ? "OFF" : "ON"}
                  </button>
                ) : f.remaining <= 0 ? <span className="text-[10px] text-hud-muted">AUTO</span> : null}
              </div>
              {f.remaining > 0 && (
                <div className="mt-1.5">
                  <div className="h-2 overflow-hidden rounded-full bg-hud-ink"><div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} /></div>
                  <div className="mt-0.5 text-[10px] text-hud-muted">{progress}% · {Math.ceil(f.remaining)}s remaining</div>
                </div>
              )}
              <p className="mt-1 text-[11px] leading-snug text-hud-muted">{f.description}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function BuildMenu({ sim, compact, onSelect, onClose }: { sim: Sim; compact?: boolean; onSelect: (kind: BuildableKind) => void; onClose: () => void }) {
  return (
    <section role="dialog" aria-label="Construction menu" className={compact ? SHEET : "hud-panel hud-scroll pointer-events-auto absolute bottom-24 left-1/2 max-h-[calc(100dvh-var(--hud-top,10rem)-7rem)] w-[min(95vw,500px)] -translate-x-1/2 rounded-2xl p-3"}>
      <header className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-bold text-accent">🔨 Build on the Plains</h2>
          <p className="text-xs text-hud-muted">Choose a working facility, then place its transparent preview.</p>
        </div>
        <button data-sfx onClick={onClose} aria-label="Close construction menu" className="hud-btn rounded-lg bg-hud-ink/50 px-2 py-1 text-lg">✕</button>
      </header>
      <div className="grid grid-cols-1 gap-1.5 min-[430px]:grid-cols-2">
        {BUILDABLE_KINDS.map((kind) => {
          const d = BUILD_DEFS[kind], missing = missingForCost(sim, d.cost);
          return (
            <button data-sfx key={kind} onClick={() => onSelect(kind)} className="min-h-11 rounded-xl bg-hud-ink/45 p-2 text-left active:scale-[0.98] hover:bg-hud-ink/70">
              <div className="flex items-center gap-1.5 text-sm font-bold"><span className="text-xl">{d.icon}</span>{d.name}</div>
              <p className="mt-0.5 text-[11px] leading-snug text-hud-muted">{d.description}</p>
              <div className={`mt-1 text-xs font-bold ${missing.length ? "text-destructive" : "text-accent"}`}>{d.cost.materials} 🔩 + {d.cost.energy} ⚡ · {d.duration}s</div>
              {missing.length > 0 && <div className="text-[10px] text-destructive">Missing: {missing.join(" + ")}</div>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function PlacementBar({ sim, compact, kind, x, y, onConfirm, onCancel }: {
  sim: Sim; compact?: boolean; kind: BuildableKind; x: number; y: number; onConfirm: () => void; onCancel: () => void;
}) {
  const d = BUILD_DEFS[kind], site = canPlace(sim.facilities, kind, x, y), missing = missingForCost(sim, d.cost);
  const ready = site.ok && missing.length === 0;
  return (
    <section aria-label="Confirm building placement" className={compact ? `${SHEET} max-w-[430px] p-2.5` : "hud-panel pointer-events-auto absolute bottom-24 left-1/2 w-[min(94vw,430px)] -translate-x-1/2 rounded-2xl p-3"}>
      <div className="flex items-start gap-2">
        <span className="text-2xl">{d.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="font-display font-bold">Place {d.name}</div>
          <p className="text-xs text-hud-muted">Tap or click the map to move the preview. Green dots mark good spots.</p>
        </div>
        <button data-sfx onClick={onCancel} aria-label="Cancel building placement" className="hud-btn rounded-lg bg-hud-ink/50 px-2 py-1">✕</button>
      </div>
      <div className={`mt-2 rounded-lg bg-hud-ink/45 p-2 text-xs font-bold ${site.ok ? "text-res-food" : "text-destructive"}`}>{site.ok ? "✓" : "✕"} {site.reason}</div>
      {missing.length > 0 && <div className="mt-1 text-xs font-bold text-destructive">Cannot build: {missing.join(" and ")}.</div>}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold">Cost: {d.cost.materials} 🔩 + {d.cost.energy} ⚡</span>
        <div className="flex gap-2">
          <button data-sfx onClick={onCancel} className="hud-btn rounded-xl bg-hud-ink px-3 py-2 text-sm font-bold">Cancel</button>
          <button data-sfx disabled={!ready} onClick={onConfirm} className="hud-btn start-btn rounded-xl px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40">Confirm build</button>
        </div>
      </div>
    </section>
  );
}
