import katex from "katex";

export function renderMath(
  element: HTMLElement,
  tex: string,
  displayMode = false
): void {
  katex.render(tex, element, {
    displayMode,
    throwOnError: false,
    strict: false,
    trust: false,
    output: "htmlAndMathml"
  });
}

export function modeShapeTex(): string {
  return (
    `\\phi_{n_x,n_y}(x,y)=` +
    `\\sin\\!\\left(\\frac{n_x\\pi x}{L}\\right)` +
    `\\sin\\!\\left(\\frac{n_y\\pi y}{L}\\right)`
  );
}

export function frequencyTex(): string {
  return `\\omega_{n_x,n_y}=\\frac{\\pi c}{L}\\sqrt{n_x^2+n_y^2}`;
}
