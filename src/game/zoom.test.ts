import { describe, expect, it } from "vitest";
import { pinchZoom, stepZoom, viewZoom, wheelZoom, ZOOM_MAX, ZOOM_MIN } from "./zoom";

describe("camera zoom", () => {
  it("+ and − buttons zoom in and out and stay within limits", () => {
    expect(stepZoom(1, 1)).toBeCloseTo(1.25);
    expect(stepZoom(1, -1)).toBeCloseTo(0.8);
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
  });
  it("scrolling up zooms in, scrolling down zooms out", () => {
    expect(wheelZoom(1, -100)).toBeGreaterThan(1);
    expect(wheelZoom(1, 100)).toBeLessThan(1);
  });
  it("one small trackpad tick changes zoom only a little", () => {
    expect(wheelZoom(1, -4)).toBeLessThan(1.01);
  });
  it("Firefox line-based scrolling zooms like pixel scrolling", () => {
    expect(wheelZoom(1, 3, 1)).toBeCloseTo(wheelZoom(1, 48, 0));
  });
  it("pinching fingers twice as far apart doubles zoom", () => {
    expect(pinchZoom(1, 100, 200)).toBeCloseTo(2);
    expect(pinchZoom(1, 100, 1000)).toBe(ZOOM_MAX);
  });
  it("never zooms out so far that the edge of the map shows", () => {
    expect(viewZoom(1920, 1080, ZOOM_MIN, 3200, 2400) * 3200).toBeGreaterThanOrEqual(1920);
    expect(viewZoom(1920, 1080, ZOOM_MIN, 3200, 2400) * 2400).toBeGreaterThanOrEqual(1080);
  });
});
