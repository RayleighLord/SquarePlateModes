import { describe, expect, it } from "vitest";

import { createModeSelection } from "../math";
import {
  createInitialControllerState,
  nextPlaybackRate,
  reduceControllerState
} from "../ui/controller";

describe("immutable explorer controller", () => {
  it("starts at mode (2, 3), playing at 1x, with the UI visible", () => {
    expect(createInitialControllerState()).toEqual({
      mode: { nx: 2, ny: 3 },
      isPlaying: true,
      playbackRate: 1,
      isUiVisible: true,
      prefersReducedMotion: false
    });
  });

  it("starts paused when reduced motion is preferred", () => {
    const state = createInitialControllerState({ prefersReducedMotion: true });
    expect(state.isPlaying).toBe(false);
    expect(state.prefersReducedMotion).toBe(true);
  });

  it("updates one mode index without mutating the previous state", () => {
    const initial = createInitialControllerState();
    const updated = reduceControllerState(initial, {
      type: "set-mode-index",
      axis: "x",
      value: 7
    });

    expect(updated).not.toBe(initial);
    expect(updated.mode).toEqual({ nx: 7, ny: 3 });
    expect(initial.mode).toEqual({ nx: 2, ny: 3 });
    expect(Object.isFrozen(initial)).toBe(true);
    expect(Object.isFrozen(updated)).toBe(true);
    expect(Object.isFrozen(updated.mode)).toBe(true);
  });

  it("returns the same object for an idempotent mode update", () => {
    const initial = createInitialControllerState();
    expect(
      reduceControllerState(initial, { type: "set-mode", mode: createModeSelection(2, 3) })
    ).toBe(initial);
  });

  it("supports only the 0.5x, 1x, and 2x playback cycle", () => {
    expect(nextPlaybackRate(0.5)).toBe(1);
    expect(nextPlaybackRate(1)).toBe(2);
    expect(nextPlaybackRate(2)).toBe(0.5);

    const initial = createInitialControllerState();
    const twice = reduceControllerState(initial, {
      type: "set-playback-rate",
      playbackRate: 2
    });
    expect(twice.playbackRate).toBe(2);
    expect(reduceControllerState(twice, { type: "cycle-playback-rate" }).playbackRate).toBe(0.5);
  });

  it("pauses immediately when reduced motion becomes preferred", () => {
    const initial = createInitialControllerState();
    const reduced = reduceControllerState(initial, {
      type: "set-reduced-motion",
      prefersReducedMotion: true
    });
    const preferenceRemoved = reduceControllerState(reduced, {
      type: "set-reduced-motion",
      prefersReducedMotion: false
    });

    expect(reduced.isPlaying).toBe(false);
    expect(preferenceRemoved.isPlaying).toBe(false);
  });

  it("toggles playback and UI visibility", () => {
    const initial = createInitialControllerState();
    const paused = reduceControllerState(initial, { type: "toggle-playing" });
    const hidden = reduceControllerState(paused, { type: "toggle-ui" });

    expect(paused.isPlaying).toBe(false);
    expect(hidden.isUiVisible).toBe(false);
  });

  it("resets mode, rate, visibility, and playback while preserving motion preference", () => {
    let state = createInitialControllerState({ prefersReducedMotion: true, mode: { nx: 8, ny: 7 } });
    state = reduceControllerState(state, { type: "set-ui-visible", isUiVisible: true });
    state = reduceControllerState(state, { type: "set-playback-rate", playbackRate: 2 });
    state = reduceControllerState(state, { type: "reset" });

    expect(state).toEqual({
      mode: { nx: 2, ny: 3 },
      isPlaying: false,
      playbackRate: 1,
      isUiVisible: true,
      prefersReducedMotion: true
    });
  });
});
