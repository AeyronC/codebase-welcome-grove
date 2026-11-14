import { useRef } from "react";
import type { InputState } from "./GameCanvas";

const DEAD = 0.12;
/** Touch joystick: moves the knob directly (no re-render per finger move), with a small dead zone so the astronaut doesn't drift. */
export function Joystick({ input }: { input: React.MutableRefObject<InputState> }) {
  const base = useRef<HTMLDivElement>(null), knob = useRef<HTMLDivElement>(null), id = useRef<number | null>(null);
  const setKnob = (x: number, y: number) => { if (knob.current) knob.current.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`; };
  const update = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect(), max = r.width / 2;
    let x = e.clientX - (r.left + max), y = e.clientY - (r.top + max);
    const m = Math.hypot(x, y); if (m > max) { x = (x / m) * max; y = (y / m) * max; }
    setKnob(x, y);
    const n = Math.min(1, m / max), k = n < DEAD ? 0 : (n - DEAD) / (1 - DEAD) / (n || 1);
    input.current = { x: (x / max) * k, y: (y / max) * k };
  };
  const end = () => { id.current = null; setKnob(0, 0); input.current = { x: 0, y: 0 }; };
  return (
    <div
      ref={base}
      className="joystick hud-panel pointer-events-auto relative touch-none rounded-full"
      onPointerDown={(e) => { id.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); update(e); }}
      onPointerMove={(e) => id.current === e.pointerId && update(e)}
      onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
      onContextMenu={(e) => e.preventDefault()}
      role="application" aria-label="Movement joystick"
    >
      {["▲", "▼", "◀", "▶"].map((a, i) => (
        <span key={a} className="absolute text-xs text-hud-muted" style={{ left: ["50%", "50%", "12%", "88%"][i], top: ["12%", "88%", "50%", "50%"][i], transform: "translate(-50%,-50%)" }}>{a}</span>
      ))}
      <div ref={knob} className="absolute left-1/2 top-1/2 size-[42%] rounded-full border-4 border-hud-ink bg-primary shadow-lg" style={{ transform: "translate(-50%,-50%)" }} />
    </div>
  );
}
