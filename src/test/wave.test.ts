import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODE,
  angularFrequency,
  createModeSelection,
  describeMode,
  displacement,
  frequency,
  interiorNodalPositions,
  isModeIndex,
  nodalPattern,
  spatialMode,
  waveNumbers
} from "../math";

describe("square membrane wave model", () => {
  it("uses mode (2, 3) by default", () => {
    expect(DEFAULT_MODE).toEqual({ nx: 2, ny: 3 });
    expect(Object.isFrozen(DEFAULT_MODE)).toBe(true);
  });

  it("accepts only integer mode indices from 1 through 8", () => {
    expect(isModeIndex(1)).toBe(true);
    expect(isModeIndex(8)).toBe(true);
    expect(isModeIndex(0)).toBe(false);
    expect(isModeIndex(2.5)).toBe(false);
    expect(isModeIndex(9)).toBe(false);
    expect(createModeSelection(8, 1)).toEqual({ nx: 8, ny: 1 });
    expect(() => createModeSelection(0, 2)).toThrow(RangeError);
    expect(() => createModeSelection(2, 9)).toThrow(RangeError);
  });

  it("computes wave numbers and frequencies from the 2D wave equation", () => {
    const mode = createModeSelection(2, 3);
    const numbers = waveNumbers(mode);

    expect(numbers.kx).toBeCloseTo(2 * Math.PI, 12);
    expect(numbers.ky).toBeCloseTo(3 * Math.PI, 12);
    expect(numbers.magnitude).toBeCloseTo(Math.PI * Math.sqrt(13), 12);
    expect(angularFrequency(mode)).toBeCloseTo(Math.PI * Math.sqrt(13), 12);
    expect(frequency(mode)).toBeCloseTo(Math.sqrt(13) / 2, 12);
    expect(angularFrequency(mode, 6, 3)).toBeCloseTo(2 * Math.PI * Math.sqrt(13), 12);
  });

  it("gives omega_11 = pi sqrt(2) and the expected (2,3)/(1,1) ratio", () => {
    const omega11 = angularFrequency(createModeSelection(1, 1));
    const omega23 = angularFrequency(createModeSelection(2, 3));

    expect(omega11).toBeCloseTo(Math.PI * Math.sqrt(2), 12);
    expect(omega23 / omega11).toBeCloseTo(Math.sqrt(13 / 2), 12);
  });

  it("has equal frequency for modes related by swapping x and y", () => {
    expect(angularFrequency(createModeSelection(2, 3))).toBeCloseTo(
      angularFrequency(createModeSelection(3, 2)),
      12
    );
  });

  it("enforces zero displacement on every fixed boundary", () => {
    const mode = createModeSelection(5, 4);
    const samples = [0, 0.17, 0.5, 0.83, 1];

    for (const coordinate of samples) {
      expect(spatialMode(0, coordinate, mode)).toBeCloseTo(0, 12);
      expect(spatialMode(1, coordinate, mode)).toBeCloseTo(0, 12);
      expect(spatialMode(coordinate, 0, mode)).toBeCloseTo(0, 12);
      expect(spatialMode(coordinate, 1, mode)).toBeCloseTo(0, 12);
    }
  });

  it("reaches alternating positive and negative unit antinodes", () => {
    const mode = createModeSelection(2, 3);

    expect(spatialMode(1 / 4, 1 / 6, mode)).toBeCloseTo(1, 12);
    expect(spatialMode(3 / 4, 1 / 6, mode)).toBeCloseTo(-1, 12);
  });

  it("satisfies the Helmholtz eigenvalue identity", () => {
    const mode = createModeSelection(2, 3);
    const { magnitude } = waveNumbers(mode);
    const x = 0.31;
    const y = 0.42;
    const h = 1e-4;
    const center = spatialMode(x, y, mode);
    const dxx =
      (spatialMode(x + h, y, mode) - 2 * center + spatialMode(x - h, y, mode)) /
      h ** 2;
    const dyy =
      (spatialMode(x, y + h, mode) - 2 * center + spatialMode(x, y - h, mode)) /
      h ** 2;

    expect(dxx + dyy).toBeCloseTo(-(magnitude ** 2) * center, 4);
  });

  it("keeps distinct representative modes orthogonal over the square", () => {
    const first = createModeSelection(2, 3);
    const second = createModeSelection(2, 4);
    const cells = 160;
    let innerProduct = 0;

    // Midpoint quadrature avoids evaluating only at shared nodal coordinates.
    for (let ix = 0; ix < cells; ix += 1) {
      for (let iy = 0; iy < cells; iy += 1) {
        const x = (ix + 0.5) / cells;
        const y = (iy + 0.5) / cells;
        innerProduct += spatialMode(x, y, first) * spatialMode(x, y, second);
      }
    }
    innerProduct /= cells ** 2;

    expect(innerProduct).toBeCloseTo(0, 12);
  });

  it("has zero quarter-period displacement and half-period sign inversion", () => {
    const mode = createModeSelection(1, 1);
    const omega = angularFrequency(mode);

    expect(displacement(0.5, 0.5, 0, mode)).toBeCloseTo(1, 12);
    expect(displacement(0.5, 0.5, Math.PI / (2 * omega), mode)).toBeCloseTo(0, 12);
    expect(displacement(0.5, 0.5, Math.PI / omega, mode)).toBeCloseTo(-1, 12);
    expect(displacement(0.5, 0.5, 0, mode, { amplitude: 0.4 })).toBeCloseTo(0.4, 12);
  });

  it("reports interior nodal coordinates and counts", () => {
    expect(interiorNodalPositions(1)).toEqual([]);
    expect(interiorNodalPositions(4, 2)).toEqual([0.5, 1, 1.5]);

    const pattern = nodalPattern(createModeSelection(2, 3));
    expect(pattern.xPositions).toEqual([0.5]);
    expect(pattern.yPositions[0]).toBeCloseTo(1 / 3, 12);
    expect(pattern.yPositions[1]).toBeCloseTo(2 / 3, 12);
    expect(pattern).toMatchObject({ xCount: 1, yCount: 2, totalCount: 3 });
    expect(describeMode(createModeSelection(2, 3))).toBe(
      "Mode (2, 3) has 1 interior nodal line at constant x and 2 interior nodal lines at constant y."
    );
  });

  it("rejects nonphysical parameters", () => {
    const mode = createModeSelection(2, 3);
    expect(() => angularFrequency(mode, 0)).toThrow(RangeError);
    expect(() => spatialMode(0.2, 0.3, mode, -1)).toThrow(RangeError);
    expect(() => displacement(0.2, 0.3, Number.NaN, mode)).toThrow(RangeError);
  });
});
