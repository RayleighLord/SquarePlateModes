export const MODE_INDICES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export type ModeIndex = (typeof MODE_INDICES)[number];
export type ModeAxis = "x" | "y";

export interface ModeSelection {
  readonly nx: ModeIndex;
  readonly ny: ModeIndex;
}

/** A semantic alias used by renderers that consume a selected membrane mode. */
export type MembraneMode = ModeSelection;

export const PLAYBACK_RATES = [0.5, 1, 2] as const;

export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export interface WaveParameters {
  /** Side length L of the square domain. */
  readonly sideLength: number;
  /** Wave propagation speed c. */
  readonly waveSpeed: number;
  /** Peak displacement multiplier. */
  readonly amplitude: number;
  /** Initial temporal phase, in radians. */
  readonly phase: number;
}

export interface WaveNumbers {
  readonly kx: number;
  readonly ky: number;
  readonly magnitude: number;
}

export interface NodalPattern {
  /** Interior x coordinates where the displacement vanishes for all y. */
  readonly xPositions: readonly number[];
  /** Interior y coordinates where the displacement vanishes for all x. */
  readonly yPositions: readonly number[];
  readonly xCount: number;
  readonly yCount: number;
  readonly totalCount: number;
}

export interface ControllerState {
  readonly mode: ModeSelection;
  readonly isPlaying: boolean;
  readonly playbackRate: PlaybackRate;
  readonly isUiVisible: boolean;
  readonly prefersReducedMotion: boolean;
}
