import type {
  ModeIndex,
  ModeSelection,
  NodalPattern,
  WaveNumbers,
  WaveParameters
} from "../types";
import { MODE_INDICES } from "../types";

export const MIN_MODE_INDEX: ModeIndex = 1;
export const MAX_MODE_INDEX: ModeIndex = 8;

export const DEFAULT_MODE: Readonly<ModeSelection> = Object.freeze({
  nx: 2,
  ny: 3
});

export const DEFAULT_WAVE_PARAMETERS: Readonly<WaveParameters> = Object.freeze({
  sideLength: 1,
  waveSpeed: 1,
  amplitude: 1,
  phase: 0
});

export function isModeIndex(value: number): value is ModeIndex {
  return Number.isInteger(value) && value >= MIN_MODE_INDEX && value <= MAX_MODE_INDEX;
}

export function createModeSelection(nx: number, ny: number): Readonly<ModeSelection> {
  assertModeIndex(nx, "nx");
  assertModeIndex(ny, "ny");
  return Object.freeze({ nx, ny });
}

export function waveNumbers(
  mode: ModeSelection,
  sideLength = DEFAULT_WAVE_PARAMETERS.sideLength
): Readonly<WaveNumbers> {
  assertMode(mode);
  assertPositiveFinite(sideLength, "sideLength");

  const kx = (mode.nx * Math.PI) / sideLength;
  const ky = (mode.ny * Math.PI) / sideLength;
  return Object.freeze({ kx, ky, magnitude: Math.hypot(kx, ky) });
}

/** Angular frequency omega = (pi c / L) sqrt(nx^2 + ny^2). */
export function angularFrequency(
  mode: ModeSelection,
  waveSpeed = DEFAULT_WAVE_PARAMETERS.waveSpeed,
  sideLength = DEFAULT_WAVE_PARAMETERS.sideLength
): number {
  assertPositiveFinite(waveSpeed, "waveSpeed");
  return waveSpeed * waveNumbers(mode, sideLength).magnitude;
}

/** Cyclic frequency f = omega / (2 pi). */
export function frequency(
  mode: ModeSelection,
  waveSpeed = DEFAULT_WAVE_PARAMETERS.waveSpeed,
  sideLength = DEFAULT_WAVE_PARAMETERS.sideLength
): number {
  return angularFrequency(mode, waveSpeed, sideLength) / (2 * Math.PI);
}

/**
 * Unit-amplitude spatial eigenfunction on the square [0,L] x [0,L].
 * The sine factors enforce zero displacement on all four boundaries.
 */
export function spatialMode(
  x: number,
  y: number,
  mode: ModeSelection,
  sideLength = DEFAULT_WAVE_PARAMETERS.sideLength
): number {
  assertFinite(x, "x");
  assertFinite(y, "y");
  const { kx, ky } = waveNumbers(mode, sideLength);
  return Math.sin(kx * x) * Math.sin(ky * y);
}

/**
 * Standing-wave displacement
 * u(x,y,t) = A sin(nx pi x/L) sin(ny pi y/L) cos(omega t + phi).
 */
export function displacement(
  x: number,
  y: number,
  time: number,
  mode: ModeSelection,
  parameters: Partial<WaveParameters> = {}
): number {
  assertFinite(time, "time");
  const resolved = resolveWaveParameters(parameters);
  const shape = spatialMode(x, y, mode, resolved.sideLength);
  const omega = angularFrequency(mode, resolved.waveSpeed, resolved.sideLength);
  return resolved.amplitude * shape * Math.cos(omega * time + resolved.phase);
}

/** Return only the interior nodal coordinates kL/n, k=1,...,n-1. */
export function interiorNodalPositions(
  index: ModeIndex,
  sideLength = DEFAULT_WAVE_PARAMETERS.sideLength
): readonly number[] {
  assertModeIndex(index, "index");
  assertPositiveFinite(sideLength, "sideLength");

  return Object.freeze(
    Array.from({ length: index - 1 }, (_, offset) => ((offset + 1) * sideLength) / index)
  );
}

export function nodalPattern(
  mode: ModeSelection,
  sideLength = DEFAULT_WAVE_PARAMETERS.sideLength
): Readonly<NodalPattern> {
  assertMode(mode);
  const xPositions = interiorNodalPositions(mode.nx, sideLength);
  const yPositions = interiorNodalPositions(mode.ny, sideLength);
  return Object.freeze({
    xPositions,
    yPositions,
    xCount: xPositions.length,
    yCount: yPositions.length,
    totalCount: xPositions.length + yPositions.length
  });
}

export function describeMode(mode: ModeSelection): string {
  const pattern = nodalPattern(mode);
  const xLines = countPhrase(pattern.xCount, "interior nodal line");
  const yLines = countPhrase(pattern.yCount, "interior nodal line");
  return `Mode (${mode.nx}, ${mode.ny}) has ${xLines} at constant x and ${yLines} at constant y.`;
}

export function resolveWaveParameters(
  parameters: Partial<WaveParameters> = {}
): Readonly<WaveParameters> {
  const resolved: WaveParameters = {
    sideLength: parameters.sideLength ?? DEFAULT_WAVE_PARAMETERS.sideLength,
    waveSpeed: parameters.waveSpeed ?? DEFAULT_WAVE_PARAMETERS.waveSpeed,
    amplitude: parameters.amplitude ?? DEFAULT_WAVE_PARAMETERS.amplitude,
    phase: parameters.phase ?? DEFAULT_WAVE_PARAMETERS.phase
  };

  assertPositiveFinite(resolved.sideLength, "sideLength");
  assertPositiveFinite(resolved.waveSpeed, "waveSpeed");
  assertFinite(resolved.amplitude, "amplitude");
  assertFinite(resolved.phase, "phase");
  return Object.freeze(resolved);
}

function assertMode(mode: ModeSelection): void {
  assertModeIndex(mode.nx, "nx");
  assertModeIndex(mode.ny, "ny");
}

function assertModeIndex(value: number, label: string): asserts value is ModeIndex {
  if (!isModeIndex(value)) {
    throw new RangeError(`${label} must be an integer from ${MODE_INDICES[0]} to ${MODE_INDICES.at(-1)}.`);
  }
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite.`);
  }
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
}

function countPhrase(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}
