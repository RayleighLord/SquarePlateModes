import { describe, expect, it } from "vitest";

import {
  BERLIN_ENDPOINTS,
  BERLIN_SAMPLE_COUNT,
  MEMBRANE_AMPLITUDE,
  berlinCoordinate,
  createBerlinTexture
} from "../membrane";

describe("Berlin signed-displacement palette", () => {
  it("uses the reduced visual displacement amplitude", () => {
    expect(MEMBRANE_AMPLITUDE).toBe(0.09);
  });

  it("maps signed displacement symmetrically and clamps outliers", () => {
    expect(berlinCoordinate(-2)).toBe(0);
    expect(berlinCoordinate(-1)).toBe(0);
    expect(berlinCoordinate(0)).toBe(0.5);
    expect(berlinCoordinate(1)).toBe(1);
    expect(berlinCoordinate(2)).toBe(1);
  });

  it("vendors the complete canonical endpoint samples", () => {
    const texture = createBerlinTexture();
    const image = texture.image as { data: Uint8Array; width: number; height: number };
    expect(BERLIN_SAMPLE_COUNT).toBe(256);
    expect(image.width).toBe(256);
    expect(image.height).toBe(1);
    expect(image.data).toHaveLength(256 * 4);
    expect([...image.data.slice(0, 4)]).toEqual([158, 176, 255, 255]);
    expect([...image.data.slice(-4)]).toEqual([255, 173, 173, 255]);
    expect(BERLIN_ENDPOINTS).toEqual({
      negative: "#9eb0ff",
      zero: "#190c09",
      positive: "#ffadad"
    });
    texture.dispose();
  });
});
