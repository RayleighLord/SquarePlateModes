import {
  PLAYBACK_RATES,
  type ControllerState,
  type ModeAxis,
  type ModeIndex,
  type ModeSelection,
  type PlaybackRate
} from "../types";
import { createModeSelection, DEFAULT_MODE } from "../math";

export interface InitialControllerOptions {
  readonly prefersReducedMotion?: boolean;
  readonly mode?: ModeSelection;
}

export type ControllerAction =
  | { readonly type: "set-mode"; readonly mode: ModeSelection }
  | { readonly type: "set-mode-index"; readonly axis: ModeAxis; readonly value: ModeIndex }
  | { readonly type: "set-playing"; readonly isPlaying: boolean }
  | { readonly type: "toggle-playing" }
  | { readonly type: "set-playback-rate"; readonly playbackRate: PlaybackRate }
  | { readonly type: "cycle-playback-rate" }
  | { readonly type: "set-ui-visible"; readonly isUiVisible: boolean }
  | { readonly type: "toggle-ui" }
  | { readonly type: "set-reduced-motion"; readonly prefersReducedMotion: boolean }
  | { readonly type: "reset" };

export function createInitialControllerState(
  options: InitialControllerOptions = {}
): Readonly<ControllerState> {
  const prefersReducedMotion = options.prefersReducedMotion ?? false;
  const mode = options.mode ?? DEFAULT_MODE;
  return freezeState({
    mode: createModeSelection(mode.nx, mode.ny),
    isPlaying: !prefersReducedMotion,
    playbackRate: 1,
    isUiVisible: true,
    prefersReducedMotion
  });
}

/** A pure reducer. Existing states are never modified. */
export function reduceControllerState(
  state: Readonly<ControllerState>,
  action: ControllerAction
): Readonly<ControllerState> {
  switch (action.type) {
    case "set-mode":
      return withMode(state, action.mode);
    case "set-mode-index":
      return withMode(state, {
        nx: action.axis === "x" ? action.value : state.mode.nx,
        ny: action.axis === "y" ? action.value : state.mode.ny
      });
    case "set-playing":
      return action.isPlaying === state.isPlaying
        ? state
        : freezeState({ ...state, isPlaying: action.isPlaying });
    case "toggle-playing":
      return freezeState({ ...state, isPlaying: !state.isPlaying });
    case "set-playback-rate":
      assertPlaybackRate(action.playbackRate);
      return action.playbackRate === state.playbackRate
        ? state
        : freezeState({ ...state, playbackRate: action.playbackRate });
    case "cycle-playback-rate":
      return freezeState({ ...state, playbackRate: nextPlaybackRate(state.playbackRate) });
    case "set-ui-visible":
      return action.isUiVisible === state.isUiVisible
        ? state
        : freezeState({ ...state, isUiVisible: action.isUiVisible });
    case "toggle-ui":
      return freezeState({ ...state, isUiVisible: !state.isUiVisible });
    case "set-reduced-motion":
      if (action.prefersReducedMotion === state.prefersReducedMotion) {
        return state;
      }
      return freezeState({
        ...state,
        prefersReducedMotion: action.prefersReducedMotion,
        // A newly enabled reduced-motion preference takes effect immediately.
        isPlaying: action.prefersReducedMotion ? false : state.isPlaying
      });
    case "reset":
      return createInitialControllerState({ prefersReducedMotion: state.prefersReducedMotion });
  }
}

export function nextPlaybackRate(current: PlaybackRate): PlaybackRate {
  assertPlaybackRate(current);
  const index = PLAYBACK_RATES.indexOf(current);
  return PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length] ?? PLAYBACK_RATES[0];
}

function withMode(
  state: Readonly<ControllerState>,
  mode: ModeSelection
): Readonly<ControllerState> {
  const validated = createModeSelection(mode.nx, mode.ny);
  if (validated.nx === state.mode.nx && validated.ny === state.mode.ny) {
    return state;
  }
  return freezeState({ ...state, mode: validated });
}

function assertPlaybackRate(value: number): asserts value is PlaybackRate {
  if (!(PLAYBACK_RATES as readonly number[]).includes(value)) {
    throw new RangeError(`playbackRate must be one of ${PLAYBACK_RATES.join(", ")}.`);
  }
}

function freezeState(state: ControllerState): Readonly<ControllerState> {
  if (!Object.isFrozen(state.mode)) {
    Object.freeze(state.mode);
  }
  return Object.freeze(state);
}
