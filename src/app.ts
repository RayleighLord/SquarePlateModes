import { ThreeMembraneRenderer } from "./membrane";
import {
  animationCycleSeconds,
  describeMode,
  frequencyRatioToFundamental,
  nodalPattern
} from "./math";
import type { ControllerState, ModeSelection } from "./types";
import { createInitialControllerState, reduceControllerState } from "./ui/controller";
import { frequencyTex, modeShapeTex, renderMath } from "./ui/math";
import { ModeSelectors } from "./ui/mode-selectors";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function startApp(): void {
  const appShell = getElement<HTMLElement>("app-shell");
  const stage = getElement<HTMLElement>("plate-stage");
  const shapeMath = getElement<HTMLElement>("shape-math");
  const frequencyMath = getElement<HTMLElement>("frequency-math");
  const description = getElement<HTMLElement>("plate-description");
  const loading = getElement<HTMLElement>("plate-loading");
  const fallback = getElement<HTMLElement>("plate-fallback");
  const fallbackMessage = getElement<HTMLElement>("plate-fallback-message");
  const retryButton = getElement<HTMLButtonElement>("retry-renderer");
  const resetButton = getElement<HTMLButtonElement>("reset-camera");
  const uiToggle = getElement<HTMLButtonElement>("ui-visibility-toggle");
  const uiToggleLabel = uiToggle.querySelector<HTMLElement>("[data-ui-toggle-label]");
  const animationToggle = getElement<HTMLButtonElement>("animation-toggle");
  const animationToggleLabel = animationToggle.querySelector<HTMLElement>(
    "[data-animation-toggle-label]"
  );
  const interactionStatus = getElement<HTMLElement>("interaction-status");
  const reducedMotionMedia = window.matchMedia(REDUCED_MOTION_QUERY);

  renderMath(shapeMath, modeShapeTex());
  renderMath(frequencyMath, frequencyTex());

  let state = createInitialControllerState({
    prefersReducedMotion: reducedMotionMedia.matches
  });
  let renderer: ThreeMembraneRenderer | null = null;
  let destroyed = false;
  let scrollBeforeCleanView = 0;

  const selectors = new ModeSelectors(getElement<HTMLElement>("mode-selectors"), {
    initialValues: state.mode,
    onChange: ({ values }) => {
      dispatch({ type: "set-mode", mode: values });
    },
    onCommit: ({ values }) => {
      announce(
        interactionStatus,
        `Selected mode n x ${values.nx}, n y ${values.ny}. ` + nodalSummary(values)
      );
    }
  });

  function initializeRenderer(): boolean {
    renderer?.destroy();
    renderer = null;
    loading.hidden = false;
    fallback.hidden = true;
    stage.setAttribute("aria-busy", "true");

    try {
      renderer = new ThreeMembraneRenderer(stage, {
        onContextLost: () => {
          showRendererFailure("The 3D view is paused because its graphics context was lost.");
        },
        onContextRestored: () => {
          fallback.hidden = true;
          loading.hidden = true;
          stage.setAttribute("aria-busy", "false");
          renderer?.setMode(state.mode);
          renderer?.setPlaying(state.isPlaying);
          announce(interactionStatus, "The three-dimensional membrane view was restored.");
        }
      });
      renderer.setMode(state.mode);
      renderer.setPageVisible(!document.hidden);
      renderer.setPlaying(state.isPlaying);
      loading.hidden = true;
      stage.setAttribute("aria-busy", "false");
      return true;
    } catch (error) {
      showRendererFailure(readableError(error, "This browser could not start the 3D view."));
      return false;
    }
  }

  function showRendererFailure(message: string): void {
    loading.hidden = true;
    fallbackMessage.textContent = message;
    fallback.hidden = false;
    stage.setAttribute("aria-busy", "false");
  }

  function dispatch(action: Parameters<typeof reduceControllerState>[1]): void {
    if (destroyed) return;
    const previous = state;
    const next = reduceControllerState(previous, action);
    if (next === previous) return;
    state = next;

    const modeChanged =
      previous.mode.nx !== next.mode.nx || previous.mode.ny !== next.mode.ny;
    if (modeChanged) {
      selectors.setValues(next.mode);
      renderer?.setMode(next.mode);
      renderMode(next.mode);
    }
    if (previous.isPlaying !== next.isPlaying) {
      renderer?.setPlaying(next.isPlaying);
    }
    if (previous.isUiVisible !== next.isUiVisible) {
      renderUiVisibility(next.isUiVisible, previous.isUiVisible);
    }
    renderPlayback(next);
  }

  function renderMode(mode: ModeSelection): void {
    const pattern = nodalPattern(mode);
    const timingDescription =
      "Animation follows the exact relative modal-frequency scaling: this mode is approximately " +
      `${frequencyRatioToFundamental(mode).toFixed(2)} times the fundamental frequency, with an ` +
      `approximately ${animationCycleSeconds(mode).toFixed(2)}-second visual cycle. `;
    description.textContent =
      `Animated square-membrane mode n x ${mode.nx}, n y ${mode.ny}. ` +
      "Height and the Berlin blue-to-coral color scale show instantaneous signed displacement. " +
      timingDescription +
      "A fine grid follows the deforming surface. " +
      `The subtle persistent overlay marks ${pattern.xCount} ${plural(pattern.xCount, "interior nodal line")} ` +
      `at constant x and ${pattern.yCount} ${plural(pattern.yCount, "interior nodal line")} at constant y. ` +
      "The pale perimeter is fixed at zero displacement.";
  }

  function renderPlayback(next: Readonly<ControllerState>): void {
    animationToggle.setAttribute("aria-pressed", String(next.isPlaying));
    animationToggle.setAttribute(
      "aria-label",
      next.isPlaying ? "Pause vibration" : "Play vibration"
    );
    animationToggle.title = next.isPlaying ? "Pause vibration (Space)" : "Play vibration (Space)";
    if (animationToggleLabel) {
      animationToggleLabel.textContent = next.isPlaying ? "Pause" : "Play";
    }
  }

  function renderUiVisibility(visible: boolean, wasVisible: boolean): void {
    if (!visible) {
      scrollBeforeCleanView = window.scrollY;
    }
    const hidden = !visible;
    appShell.dataset.uiHidden = String(hidden);
    document.documentElement.dataset.uiHidden = String(hidden);
    uiToggle.setAttribute("aria-expanded", String(visible));
    uiToggle.setAttribute("aria-pressed", String(hidden));
    uiToggle.setAttribute("aria-label", hidden ? "Show UI" : "Hide UI");
    uiToggle.title = hidden ? "Show UI (H)" : "Hide UI (H)";
    if (uiToggleLabel) {
      uiToggleLabel.textContent = hidden ? "Show UI" : "Hide UI";
    }

    if (hidden) {
      window.scrollTo(0, 0);
    } else if (!wasVisible) {
      window.requestAnimationFrame(() => window.scrollTo(0, scrollBeforeCleanView));
    }
    window.requestAnimationFrame(() => renderer?.resize());
  }

  animationToggle.addEventListener("click", () => {
    dispatch({ type: "toggle-playing" });
    announce(interactionStatus, state.isPlaying ? "Vibration playing." : "Vibration paused.");
  });

  resetButton.addEventListener("click", () => {
    renderer?.resetView();
    stage.focus({ preventScroll: true });
    announce(interactionStatus, "Membrane camera reset.");
  });

  const toggleUi = (): void => {
    dispatch({ type: "toggle-ui" });
    announce(
      interactionStatus,
      state.isUiVisible ? "Interface shown." : "Interface hidden. Press H to restore it."
    );
  };
  uiToggle.addEventListener("click", toggleUi);

  retryButton.addEventListener("click", () => {
    if (initializeRenderer()) {
      announce(interactionStatus, "Three-dimensional membrane view restored.");
    }
  });

  stage.addEventListener("pointerdown", () => stage.focus({ preventScroll: true }));
  stage.addEventListener("keydown", (event) => {
    renderer?.handleKeyboard(event);
  });

  const handleGlobalShortcut = (event: KeyboardEvent): void => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || isEditing(event.target)) {
      return;
    }
    if (event.key.toLowerCase() === "h") {
      event.preventDefault();
      toggleUi();
    } else if (event.code === "Space" && !isInteractive(event.target)) {
      event.preventDefault();
      dispatch({ type: "toggle-playing" });
      announce(interactionStatus, state.isPlaying ? "Vibration playing." : "Vibration paused.");
    }
  };
  document.addEventListener("keydown", handleGlobalShortcut);

  const handleReducedMotionChange = (): void => {
    dispatch({
      type: "set-reduced-motion",
      prefersReducedMotion: reducedMotionMedia.matches
    });
    if (reducedMotionMedia.matches) {
      announce(interactionStatus, "Reduced motion enabled. Vibration paused.");
    }
  };
  reducedMotionMedia.addEventListener("change", handleReducedMotionChange);

  const handleVisibility = (): void => renderer?.setPageVisible(!document.hidden);
  document.addEventListener("visibilitychange", handleVisibility);

  const cleanup = (): void => {
    if (destroyed) return;
    destroyed = true;
    document.removeEventListener("keydown", handleGlobalShortcut);
    document.removeEventListener("visibilitychange", handleVisibility);
    reducedMotionMedia.removeEventListener("change", handleReducedMotionChange);
    window.removeEventListener("pagehide", handlePageHide);
    window.removeEventListener("pageshow", handlePageShow);
    selectors.destroy();
    renderer?.destroy();
    renderer = null;
  };
  const handlePageHide = (event: PageTransitionEvent): void => {
    if (event.persisted) {
      renderer?.setPageVisible(false);
      return;
    }
    cleanup();
  };
  const handlePageShow = (event: PageTransitionEvent): void => {
    if (!event.persisted || destroyed) return;
    renderer?.setPageVisible(!document.hidden);
    renderer?.resize();
  };
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("pageshow", handlePageShow);

  renderMode(state.mode);
  renderPlayback(state);
  renderUiVisibility(state.isUiVisible, state.isUiVisible);
  initializeRenderer();
  announce(interactionStatus, `Mode ready. ${describeMode(state.mode)}`);
}

function nodalSummary(mode: ModeSelection): string {
  const pattern = nodalPattern(mode);
  return (
    `${pattern.xCount} constant-x ${plural(pattern.xCount, "interior nodal line")} and ` +
    `${pattern.yCount} constant-y ${plural(pattern.yCount, "interior nodal line")}`
  );
}

function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}

function isEditing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function isInteractive(target: EventTarget | null): boolean {
  return (
    isEditing(target) ||
    target instanceof HTMLButtonElement ||
    target instanceof HTMLAnchorElement ||
    (target instanceof HTMLElement &&
      target.matches('[role="button"], [role="link"], [role="slider"]'))
  );
}

function readableError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function announce(element: HTMLElement, message: string): void {
  element.textContent = "";
  window.setTimeout(() => {
    element.textContent = message;
  }, 0);
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element #${id}.`);
  return element as T;
}
