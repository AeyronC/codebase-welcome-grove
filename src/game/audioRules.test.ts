import { describe, expect, it } from "vitest";
import { act, newSim, priorities } from "./sim";
import { alertSoundFor, ambienceFor, channelGain, claimAlert, decideAlert, DEFAULT_AUDIO, musicMood, newGate, normalizeSettings } from "./audioRules";

describe("audio settings", () => {
  it("master mute silences music, effects, alerts and ambience", () => {
    const s = { ...DEFAULT_AUDIO, muted: true };
    for (const ch of ["music", "sfx", "alert", "ambience"] as const) expect(channelGain(s, ch)).toBe(0);
  });
  it("music off keeps sound effects playing", () => {
    const s = { ...DEFAULT_AUDIO, music: false, volume: 0.8 };
    expect(channelGain(s, "music")).toBe(0);
    expect(channelGain(s, "sfx")).toBe(0.8);
  });
  it("music and sound effects have separate volumes", () => {
    const s = { ...DEFAULT_AUDIO, musicVolume: 0.2, volume: 0.9 };
    expect(channelGain(s, "music")).toBe(0.2);
    expect(channelGain(s, "sfx")).toBe(0.9);
  });
  it("sound effects off also silences facility and wind sounds", () => {
    expect(channelGain({ ...DEFAULT_AUDIO, sfx: false }, "ambience")).toBe(0);
  });
  it("old saved settings keep their volume and gain music settings", () => {
    const s = normalizeSettings({ muted: false, sfx: true, alerts: true, volume: 0.3, nav: false });
    expect(s.volume).toBe(0.3); expect(s.nav).toBe(false); expect(s.music).toBe(true); expect(s.musicVolume).toBe(DEFAULT_AUDIO.musicVolume);
  });
});

describe("alert priority", () => {
  it("a critical warning interrupts a lower warning that is playing", () => {
    const g = newGate(); claimAlert(g, "low-water", "water-2", 0, 600);
    expect(decideAlert(g, "critical", "oxygen-1", 200)).toBe("interrupt");
  });
  it("a lower warning never plays over a critical warning", () => {
    const g = newGate(); claimAlert(g, "critical", "oxygen-1", 0, 700);
    expect(decideAlert(g, "low-food", "food-2", 2000)).toBe("skip");
    expect(decideAlert(g, "low-food", "food-2", 3500)).toBe("play");
  });
  it("two equal warnings never sound at the same time", () => {
    const g = newGate(); claimAlert(g, "low-water", "water-2", 0, 600);
    expect(decideAlert(g, "low-food", "food-2", 300)).toBe("skip");
  });
  it("the same warning is not repeated within its cooldown", () => {
    const g = newGate(); claimAlert(g, "low-oxygen", "oxygen-2", 0, 900);
    expect(decideAlert(g, "low-oxygen", "oxygen-2", 5000)).toBe("skip");
    expect(decideAlert(g, "low-oxygen", "oxygen-2", 12001)).toBe("play");
  });
  it("each low supply has its own warning sound", () => {
    const s = { ...newSim(), water: 10, food: 10, energy: 5 };
    const kinds = priorities(s).map(alertSoundFor);
    expect(kinds).toEqual(expect.arrayContaining(["low-water", "low-food", "low-energy"]));
  });
});

describe("music and ambience follow the game", () => {
  it("music is calm in a normal start and tense when oxygen is critical", () => {
    expect(musicMood(newSim())).toBe("calm");
    expect(musicMood({ ...newSim(), oxygen: 5 })).toBe("tense");
  });
  it("a running greenhouse is heard nearby and goes silent when switched off", () => {
    const s = newSim();
    expect(ambienceFor(s, "greenhouse").facility).toBe("greenhouse");
    const gh = s.facilities.find((f) => f.kind === "greenhouse")!;
    const off = act(s, `facility-toggle:${gh.id}`).sim;
    expect(ambienceFor(off, "greenhouse").facility).toBeNull();
  });
  it("the ice drill is silent while it is off at the start", () => {
    expect(ambienceFor(newSim(), "drill").facility).toBeNull();
  });
});
