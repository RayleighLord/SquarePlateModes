import { describe, expect, it } from "vitest";

import { frequencyTex, modeShapeTex } from "../ui/math";

describe("KaTeX formula sources", () => {
  it("shows the generic mode shape without substituting selected indices", () => {
    expect(modeShapeTex()).toBe(
      "\\phi_{n_x,n_y}(x,y)=\\sin\\!\\left(\\frac{n_x\\pi x}{L}\\right)" +
        "\\sin\\!\\left(\\frac{n_y\\pi y}{L}\\right)"
    );
  });

  it("shows only the generic angular-frequency relation", () => {
    expect(frequencyTex()).toBe(
      "\\omega_{n_x,n_y}=\\frac{\\pi c}{L}\\sqrt{n_x^2+n_y^2}"
    );
  });
});
