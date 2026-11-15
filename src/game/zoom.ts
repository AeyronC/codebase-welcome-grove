/** Camera zoom rules. The player's chosen zoom is a multiplier on the screen-size base zoom. */
export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 2.2;
export const ZOOM_STEP = 1.25;

export const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number.isFinite(z) ? z : 1));

/** Mouse wheel / trackpad: scale by how far the wheel moved, so one fast flick can't slam to the limit. */
export function wheelZoom(z: number, deltaY: number, deltaMode = 0) {
  const dy = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 100 : 1);
  return clampZoom(z * Math.exp(-dy * 0.0015));
}

/** + / − buttons and keys. */
export const stepZoom = (z: number, dir: 1 | -1) => clampZoom(z * (dir > 0 ? ZOOM_STEP : 1 / ZOOM_STEP));

/** Two-finger pinch: zoom follows the change in finger distance. */
export const pinchZoom = (startZoom: number, startDist: number, dist: number) =>
  clampZoom(startDist > 0 ? (startZoom * dist) / startDist : startZoom);

/** Final camera scale for a screen. Never zooms out past the edge of the map. */
export function viewZoom(vw: number, vh: number, user: number, worldW: number, worldH: number) {
  const base = Math.max(0.55, Math.min(1.15, Math.min(vw, vh) / 720));
  const fill = Math.max(vw / worldW, vh / worldH);
  return Math.max(fill, base * clampZoom(user));
}
