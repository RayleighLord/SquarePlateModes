import katex from "katex";

import type { ModeAxis, ModeIndex, ModeSelection } from "../types";

export type { ModeAxis, ModeIndex, ModeSelection } from "../types";

export const MIN_MODE_NUMBER = 1;
export const MAX_MODE_NUMBER = 8;

export type ModeNumbers = ModeSelection;

export interface ModeSelectorChange {
  axis: ModeAxis;
  value: ModeIndex;
  values: ModeNumbers;
}

export interface ModeSelectorsOptions {
  initialValues?: Partial<ModeNumbers>;
  onChange?: (change: ModeSelectorChange) => void;
  onInput?: (change: ModeSelectorChange) => void;
  onCommit?: (change: ModeSelectorChange) => void;
}

type SelectorElements = {
  input: HTMLInputElement;
  value: HTMLElement;
};

/**
 * Semantic, controlled mode-number inputs. The application owns accepted
 * state; setValues() is the only programmatic state update surface.
 */
export class ModeSelectors {
  readonly root: HTMLElement;

  private readonly options: ModeSelectorsOptions;
  private readonly selectors: Record<ModeAxis, SelectorElements>;
  private readonly cleanup: Array<() => void> = [];
  private destroyed = false;

  constructor(host: HTMLElement, options: ModeSelectorsOptions = {}) {
    this.root = host;
    this.options = options;
    this.root.classList.add("mode-selectors");
    this.root.setAttribute("role", "group");
    this.root.setAttribute("aria-label", "Choose the two mode numbers");

    const initialValues: ModeNumbers = {
      nx: normalizeModeNumber(options.initialValues?.nx ?? 2),
      ny: normalizeModeNumber(options.initialValues?.ny ?? 3)
    };

    this.selectors = {
      x: this.createSelector("x", initialValues.nx),
      y: this.createSelector("y", initialValues.ny)
    };
    this.root.replaceChildren(
      this.selectors.x.input.closest(".mode-selector") as HTMLElement,
      this.selectors.y.input.closest(".mode-selector") as HTMLElement
    );

    this.bindSelector("x");
    this.bindSelector("y");
    this.setValues(initialValues);
  }

  setValues(values: Readonly<ModeNumbers>): void {
    this.assertActive();
    const nx = normalizeModeNumber(values.nx);
    const ny = normalizeModeNumber(values.ny);
    this.updateSelector("x", nx);
    this.updateSelector("y", ny);
  }

  getValues(): ModeNumbers {
    this.assertActive();
    return this.readValues();
  }

  setDisabled(disabled: boolean): void {
    this.assertActive();
    this.selectors.x.input.disabled = disabled;
    this.selectors.y.input.disabled = disabled;
    this.root.setAttribute("aria-disabled", String(disabled));
  }

  focus(axis: ModeAxis): void {
    this.assertActive();
    this.selectors[axis].input.focus();
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    for (const dispose of this.cleanup.splice(0)) {
      dispose();
    }
    this.root.replaceChildren();
    this.root.classList.remove("mode-selectors");
    this.root.removeAttribute("role");
    this.root.removeAttribute("aria-label");
    this.root.removeAttribute("aria-disabled");
  }

  private createSelector(axis: ModeAxis, initialValue: number): SelectorElements {
    const field = document.createElement("section");
    field.className = "mode-selector";
    field.dataset.axis = axis;

    const heading = document.createElement("div");
    heading.className = "mode-selector__heading";

    const label = document.createElement("label");
    label.className = "mode-selector__label";
    label.htmlFor = `n${axis}-slider`;
    renderMath(label, `n_${axis}`);

    const value = document.createElement("output");
    value.id = `n${axis}-value-math`;
    value.className = "mode-selector__value";
    value.htmlFor = `n${axis}-slider`;
    value.setAttribute("aria-hidden", "true");
    heading.append(label, value);

    const sliderFrame = document.createElement("div");
    sliderFrame.className = "mode-selector__slider-frame";

    const ticks = document.createElement("div");
    ticks.className = "mode-selector__ticks";
    ticks.setAttribute("aria-hidden", "true");
    for (let tick = MAX_MODE_NUMBER; tick >= MIN_MODE_NUMBER; tick -= 1) {
      const mark = document.createElement("span");
      mark.className = "mode-selector__tick";
      mark.textContent = String(tick);
      ticks.append(mark);
    }

    const input = document.createElement("input");
    input.id = `n${axis}-slider`;
    input.className = "mode-selector__range";
    input.type = "range";
    input.min = String(MIN_MODE_NUMBER);
    input.max = String(MAX_MODE_NUMBER);
    input.step = "1";
    input.value = String(initialValue);
    input.setAttribute("orient", "vertical");
    input.setAttribute("aria-label", `Mode number n ${axis}`);
    input.setAttribute("aria-valuetext", String(initialValue));
    sliderFrame.append(ticks, input);

    field.append(heading, sliderFrame);
    return { input, value };
  }

  private bindSelector(axis: ModeAxis): void {
    const input = this.selectors[axis].input;
    const handleInput = (): void => {
      const value = normalizeModeNumber(Number(input.value));
      this.updateSelector(axis, value);
      const change = this.makeChange(axis, value);
      this.options.onChange?.(change);
      this.options.onInput?.(change);
    };
    const handleChange = (): void => {
      const value = normalizeModeNumber(Number(input.value));
      this.updateSelector(axis, value);
      this.options.onCommit?.(this.makeChange(axis, value));
    };

    input.addEventListener("input", handleInput);
    input.addEventListener("change", handleChange);
    this.cleanup.push(
      () => input.removeEventListener("input", handleInput),
      () => input.removeEventListener("change", handleChange)
    );
  }

  private makeChange(axis: ModeAxis, value: ModeIndex): ModeSelectorChange {
    return { axis, value, values: this.readValues() };
  }

  private readValues(): ModeNumbers {
    return {
      nx: normalizeModeNumber(Number(this.selectors.x.input.value)),
      ny: normalizeModeNumber(Number(this.selectors.y.input.value))
    };
  }

  private updateSelector(axis: ModeAxis, value: ModeIndex): void {
    const selector = this.selectors[axis];
    selector.input.value = String(value);
    selector.input.setAttribute("aria-valuetext", String(value));
    const progress = (value - MIN_MODE_NUMBER) / (MAX_MODE_NUMBER - MIN_MODE_NUMBER);
    selector.input.style.setProperty("--mode-progress", `${progress * 100}%`);
    renderMath(selector.value, `n_${axis}=${value}`);
  }

  private assertActive(): void {
    if (this.destroyed) {
      throw new Error("ModeSelectors has been destroyed.");
    }
  }
}

export function isValidModeNumber(value: number): value is ModeIndex {
  return Number.isInteger(value) && value >= MIN_MODE_NUMBER && value <= MAX_MODE_NUMBER;
}

function normalizeModeNumber(value: number): ModeIndex {
  if (!isValidModeNumber(value)) {
    throw new RangeError(
      `Mode numbers must be integers from ${MIN_MODE_NUMBER} through ${MAX_MODE_NUMBER}; received ${value}.`
    );
  }
  return value;
}

function renderMath(element: HTMLElement, tex: string): void {
  katex.render(tex, element, {
    displayMode: false,
    throwOnError: false,
    strict: false,
    trust: false
  });
}
