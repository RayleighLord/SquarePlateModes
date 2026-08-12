import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const host = "127.0.0.1";
const port = Number(process.env.BROWSER_SMOKE_PORT ?? 30_000 + (process.pid % 20_000));
const repositoryPath = "/SquarePlateModes/";
const baseUrl = `http://${host}:${port}${repositoryPath}`;
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const artifactDir = new URL("../output/playwright/", import.meta.url);
const docsDir = new URL("../docs/", import.meta.url);
const deployedNotices = new URL("../dist/THIRD_PARTY_NOTICES.txt", import.meta.url);
const viteBin = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const requestedChromePath = process.env.CHROME_PATH;
const systemChromePath = "/usr/bin/google-chrome";
const executablePath = requestedChromePath ?? (existsSync(systemChromePath) ? systemChromePath : undefined);

await mkdir(artifactDir, { recursive: true });
assert.ok(existsSync(deployedNotices), "The Pages artifact is missing third-party notices");
if (process.env.UPDATE_README_SCREENSHOT === "1") {
  await mkdir(docsDir, { recursive: true });
}

const preview = spawn(
  process.execPath,
  [viteBin, "preview", "--base", repositoryPath, "--host", host, "--port", `${port}`, "--strictPort"],
  { cwd: projectRoot, stdio: ["ignore", "inherit", "inherit"] }
);

let browser;
try {
  await waitForServer(baseUrl, preview);
  browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {})
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const browserErrors = collectBrowserErrors(page);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await waitForMembrane(page, 2, 3);

  await assertInitialComposition(page);
  await assertModeSelection(page);
  await assertAllModes(page);
  await assertRelativeModalTiming(page);
  await assertPlayback(page);
  await assertCameraAndCleanView(page);
  await assertPersistedPageLifecycle(page);
  await assertContextLossAndRetry(page);
  await assertResponsiveLayout(page);
  await assertReducedMotion(browser, baseUrl);

  assert.deepEqual(browserErrors, [], `Browser errors:\n${browserErrors.join("\n")}`);
  console.log("Browser smoke checks passed for all 64 square-membrane modes.");
} finally {
  await browser?.close();
  preview.kill("SIGTERM");
  await waitForExit(preview);
}

async function assertInitialComposition(page) {
  assert.equal(await page.title(), "Square Membrane Modes");
  assert.equal(await page.locator('[data-membrane-canvas="true"]').count(), 1);
  assert.equal(await page.locator("#nx-slider").getAttribute("min"), "1");
  assert.equal(await page.locator("#nx-slider").getAttribute("max"), "8");
  assert.equal(await page.locator("#ny-slider").inputValue(), "3");
  assert.equal(await page.locator("#plate-stage").getAttribute("data-nodal-x-count"), "1");
  assert.equal(await page.locator("#plate-stage").getAttribute("data-nodal-y-count"), "2");
  assert.equal(await page.locator("#plate-stage").getAttribute("data-amplitude"), "0.09");
  assert.equal(await page.locator("#plate-stage").getAttribute("data-grid-visible"), "true");
  assert.equal(await page.locator("#plate-stage").getAttribute("data-axis-markers"), "false");
  assert.equal(await page.locator("#plate-stage").getAttribute("data-camera-full-rotation"), "true");
  assert.equal(await page.locator("#plate-stage").getAttribute("data-animation-timing"), "modal");
  assert.ok(
    Math.abs(
      Number(await page.locator("#plate-stage").getAttribute("data-cycle-seconds")) -
        10 / Math.sqrt(13 / 2)
    ) < 1e-12
  );
  assert.ok(
    Math.abs(
      Number(await page.locator("#plate-stage").getAttribute("data-frequency-ratio")) -
        Math.sqrt(13 / 2)
    ) < 1e-12
  );
  assert.match(await page.locator("#shape-math annotation").textContent(), /\\phi_\{n_x,n_y\}/);
  assert.match(
    await page.locator("#frequency-math annotation").textContent(),
    /\\omega_\{n_x,n_y\}=\\frac\{\\pi c\}\{L\}\\sqrt\{n_x\^2\+n_y\^2\}/
  );
  assert.equal(await page.locator("#boundary-note").textContent(), "FIXED BOUNDARIES");
  assert.equal(await page.locator(".mode-controls__header p").count(), 0);
  assert.equal(
    await page
      .locator(
        "#mode-math, #nodal-readout, #speed-select, #displacement-legend, " +
          "#frequency-scale-toggle"
      )
      .count(),
    0
  );
  const sliderType = await page.evaluate(() => ({
    ticks: Number.parseFloat(getComputedStyle(document.querySelector(".mode-selector__ticks")).fontSize),
    value: Number.parseFloat(getComputedStyle(document.querySelector(".mode-selector__value")).fontSize)
  }));
  assert.ok(sliderType.ticks >= 12, "Slider tick numbers are too small");
  assert.ok(sliderType.value >= 16, "Selected mode numbers are too small");

  const targets = await page
    .locator(
      "#nx-slider, #ny-slider, #reset-camera, #ui-visibility-toggle, " +
        "#animation-toggle"
    )
    .evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { id: element.id, tag: element.tagName, width: rect.width, height: rect.height };
    }));
  for (const target of targets) {
    assert.ok(target.width >= 44, `${target.id} is narrower than 44px`);
    if (target.tag === "BUTTON") {
      assert.ok(target.height >= 44, `${target.id} is shorter than 44px`);
    }
  }

  const layout = await readLayout(page);
  assert.ok(Math.abs(layout.stageCenterX - layout.viewportWidth / 2) <= 2);
  assert.ok(Math.abs(layout.panelWidth - layout.viewportWidth) <= 2);
  assert.ok(layout.controlsWidth >= 300 && layout.controlsWidth <= 365);

  // Freeze the default mode at maximum displacement for deterministic visual evidence.
  await page.locator("#animation-toggle").click();
  await page.evaluate(() => {
    const input = document.querySelector("#nx-slider");
    input.value = "1";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.value = "2";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await waitForMembrane(page, 2, 3);
  assert.ok(Math.abs(Number(await page.locator("#plate-stage").getAttribute("data-phase"))) < 1e-6);

  await page.screenshot({
    path: new URL("browser-smoke-desktop.png", artifactDir).pathname,
    fullPage: true
  });
  if (process.env.UPDATE_README_SCREENSHOT === "1") {
    await page.screenshot({
      path: new URL("square-membrane-modes-explorer.png", docsDir).pathname,
      fullPage: true
    });
  }
  await page.locator("#animation-toggle").click();
}

async function assertModeSelection(page) {
  const nx = page.locator("#nx-slider");
  const ny = page.locator("#ny-slider");

  await nx.focus();
  await nx.press("Home");
  await waitForMembrane(page, 1, 3);
  await nx.press("ArrowUp");
  await waitForMembrane(page, 2, 3);

  await ny.fill("5");
  await waitForMembrane(page, 2, 5);
  assert.match(await page.locator("#shape-math annotation").textContent(), /\\phi_\{n_x,n_y\}/);
  assert.equal(await page.locator("#plate-stage").getAttribute("data-nodal-y-count"), "4");
  assert.match(await page.locator("#plate-description").textContent(), /4 interior nodal lines at constant y/);

  await ny.fill("3");
  await waitForMembrane(page, 2, 3);
}

async function assertAllModes(page) {
  const toggle = page.locator("#animation-toggle");
  await toggle.click();
  for (let nx = 1; nx <= 8; nx += 1) {
    await page.locator("#nx-slider").fill(`${nx}`);
    for (let ny = 1; ny <= 8; ny += 1) {
      await page.locator("#ny-slider").fill(`${ny}`);
      await waitForMembrane(page, nx, ny);
      assert.equal(await page.locator("#plate-stage").getAttribute("data-nodal-x-count"), `${nx - 1}`);
      assert.equal(await page.locator("#plate-stage").getAttribute("data-nodal-y-count"), `${ny - 1}`);
      assert.equal(await page.locator("#plate-stage").getAttribute("data-animation-timing"), "modal");
      const expectedRatio = Math.sqrt((nx ** 2 + ny ** 2) / 2);
      assert.ok(
        Math.abs(
          Number(await page.locator("#plate-stage").getAttribute("data-frequency-ratio")) -
            expectedRatio
        ) < 1e-12
      );
      assert.ok(
        Math.abs(
          Number(await page.locator("#plate-stage").getAttribute("data-cycle-seconds")) -
            10 / expectedRatio
        ) < 1e-12
      );
      if ((nx === 1 && ny === 1) || (nx === 8 && ny === 8)) {
        await page.screenshot({
          path: new URL(`mode-${nx}-${ny}-maximum.png`, artifactDir).pathname
        });
      }
    }
  }
  await page.locator("#nx-slider").fill("2");
  await page.locator("#ny-slider").fill("3");
  await waitForMembrane(page, 2, 3);
  await toggle.click();
}

async function assertRelativeModalTiming(page) {
  const stage = page.locator("#plate-stage");
  const playbackToggle = page.locator("#animation-toggle");

  await playbackToggle.click();
  assert.equal(await stage.getAttribute("data-playing"), "false");
  assert.ok(
    Math.abs(Number(await stage.getAttribute("data-cycle-seconds")) - 10 / Math.sqrt(13 / 2)) < 1e-12
  );
  assert.match(
    await page.locator("#plate-description").textContent(),
    /exact relative modal-frequency scaling.*approximately 2\.55/
  );

  await page.locator("#nx-slider").fill("1");
  await page.locator("#ny-slider").fill("1");
  await waitForMembrane(page, 1, 1);
  assert.equal(await stage.getAttribute("data-frequency-ratio"), "1");
  assert.equal(await stage.getAttribute("data-cycle-seconds"), "10");
  const fundamentalAdvance = await measurePhaseAdvance(page, 500);

  await page.locator("#nx-slider").fill("8");
  await page.locator("#ny-slider").fill("8");
  await waitForMembrane(page, 8, 8);
  assert.equal(await stage.getAttribute("data-frequency-ratio"), "8");
  assert.equal(await stage.getAttribute("data-cycle-seconds"), "1.25");
  const highestModeAdvance = await measurePhaseAdvance(page, 500);
  assert.ok(
    highestModeAdvance > 5 * fundamentalAdvance,
    `Expected modal timing to advance (8,8) much faster than (1,1); got ` +
      `${highestModeAdvance.toFixed(3)} versus ${fundamentalAdvance.toFixed(3)} radians`
  );

  await page.locator("#nx-slider").fill("2");
  await page.locator("#ny-slider").fill("3");
  await waitForMembrane(page, 2, 3);
  await playbackToggle.click();
}

async function measurePhaseAdvance(page, durationMs) {
  const stage = page.locator("#plate-stage");
  const toggle = page.locator("#animation-toggle");
  assert.equal(await stage.getAttribute("data-playing"), "false");
  const initialPhase = Number(await stage.getAttribute("data-phase"));
  await toggle.click();
  await page.waitForTimeout(durationMs);
  await toggle.click();
  const finalPhase = Number(await stage.getAttribute("data-phase"));
  return (finalPhase - initialPhase + 2 * Math.PI) % (2 * Math.PI);
}

async function assertPlayback(page) {
  const toggle = page.locator("#animation-toggle");
  const stage = page.locator("#plate-stage");
  assert.equal(await stage.getAttribute("data-playing"), "true");
  await page.waitForFunction(() => {
    const phase = Number(document.querySelector("#plate-stage")?.getAttribute("data-phase"));
    return Math.abs(Math.cos(phase)) < 0.02;
  });
  await toggle.click();
  assert.equal(await stage.getAttribute("data-playing"), "false");
  const frozenPhase = Number(await stage.getAttribute("data-phase"));
  await page.waitForTimeout(180);
  assert.ok(Math.abs(Number(await stage.getAttribute("data-phase")) - frozenPhase) < 1e-5);
  await page.screenshot({
    path: new URL("mode-2-3-equilibrium.png", artifactDir).pathname
  });

  assert.equal(await page.locator("#speed-select").count(), 0);
  assert.equal(await stage.getAttribute("data-playback-rate"), null);
  await toggle.click();
  await page.waitForTimeout(180);
  assert.ok(Math.abs(Number(await stage.getAttribute("data-phase")) - frozenPhase) > 0.05);

  const resetPhase = await page.evaluate(() => {
    const input = document.querySelector("#nx-slider");
    const stage = document.querySelector("#plate-stage");
    input.value = "4";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return Number(stage.getAttribute("data-phase"));
  });
  assert.ok(Math.abs(resetPhase) < 1e-6);
  await waitForMembrane(page, 4, 3);
  await toggle.click();
  await page.locator("#nx-slider").fill("2");
  await waitForMembrane(page, 2, 3);
}

async function assertCameraAndCleanView(page) {
  const stage = page.locator("#plate-stage");
  const initialCamera = await stage.getAttribute("data-camera");
  const initialPlaying = await stage.getAttribute("data-playing");
  await stage.focus();
  await stage.press("ArrowLeft");
  await page.waitForTimeout(80);
  assert.notEqual(await stage.getAttribute("data-camera"), initialCamera);
  await page.locator("#reset-camera").focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(80);
  assert.equal(await stage.getAttribute("data-camera"), initialCamera);
  assert.equal(await stage.getAttribute("data-playing"), initialPlaying);

  const bounds = await stage.boundingBox();
  assert.ok(bounds, "Membrane stage has no pointer bounds");
  await page.mouse.move(bounds.x + bounds.width * 0.55, bounds.y + bounds.height * 0.72);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.55, bounds.y + bounds.height * 0.08, {
    steps: 18
  });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const undersideCamera = (await stage.getAttribute("data-camera"))
    .split(",")
    .map(Number);
  assert.ok(undersideCamera[1] < -0.05, "Camera could not rotate beneath the membrane");
  await page.locator("#reset-camera").click();
  await page.waitForTimeout(80);
  assert.equal(await stage.getAttribute("data-camera"), initialCamera);

  await page.locator("#ui-visibility-toggle").focus();
  await page.keyboard.press("Space");
  assert.equal(await page.locator("#app-shell").getAttribute("data-ui-hidden"), "true");
  assert.equal(await stage.getAttribute("data-playing"), initialPlaying);
  assert.equal(await page.locator(".ui-chrome:visible").count(), 0);
  const hidden = await readLayout(page);
  assert.ok(Math.abs(hidden.panelHeight - hidden.viewportHeight) <= 2);
  await page.keyboard.press("h");
  assert.equal(await page.locator("#app-shell").getAttribute("data-ui-hidden"), "false");
}

async function assertResponsiveLayout(page) {
  await page.setViewportSize({ width: 600, height: 800 });
  await page.waitForTimeout(100);
  const intermediate = await page.evaluate(() => {
    const formula = document.querySelector("#formula-card")?.getBoundingClientRect();
    const controls = document.querySelector(".view-controls")?.getBoundingClientRect();
    return {
      documentWidth: document.documentElement.scrollWidth,
      formula: formula && {
        top: formula.top,
        right: formula.right,
        bottom: formula.bottom,
        left: formula.left
      },
      controls: controls && {
        top: controls.top,
        right: controls.right,
        bottom: controls.bottom,
        left: controls.left
      }
    };
  });
  assert.ok(intermediate.documentWidth <= 600);
  assert.ok(intermediate.formula && intermediate.controls);
  assert.ok(
    intermediate.formula.top >= intermediate.controls.bottom,
    "Formula card overlaps the view controls at the intermediate breakpoint"
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const layout = await readLayout(page);
  assert.ok(layout.documentWidth <= 390);
  assert.ok(layout.controlsY >= layout.panelHeight - 2);
  assert.ok(layout.formulaRight <= 390 && layout.formulaLeft >= 0);
  const touchTargets = await page
    .locator("#reset-camera, #ui-visibility-toggle, #animation-toggle")
    .evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { id: element.id, width: rect.width, height: rect.height };
    }));
  for (const target of touchTargets) {
    assert.ok(target.width >= 44, `${target.id} is narrower than 44px on mobile`);
    assert.ok(target.height >= 44, `${target.id} is shorter than 44px on mobile`);
  }
  await page.screenshot({
    path: new URL("browser-smoke-mobile.png", artifactDir).pathname,
    fullPage: true
  });
}

async function assertPersistedPageLifecycle(page) {
  const canvas = page.locator('[data-membrane-canvas="true"]');
  await canvas.evaluate((element) => {
    element.dataset.lifecycleMarker = "original-canvas";
  });
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await waitForMembrane(page, 2, 3);
  assert.equal(await page.locator('[data-membrane-canvas="true"]').count(), 1);
  assert.equal(await canvas.getAttribute("data-lifecycle-marker"), "original-canvas");
  await page.locator("#nx-slider").fill("3");
  await waitForMembrane(page, 3, 3);
  await page.locator("#nx-slider").fill("2");
  await waitForMembrane(page, 2, 3);
}

async function assertContextLossAndRetry(page) {
  const stage = page.locator("#plate-stage");
  const canvas = page.locator('[data-membrane-canvas="true"]');
  const canLoseContext = await canvas.evaluate((element) => {
    const context = element.getContext("webgl2") ?? element.getContext("webgl");
    const extension = context?.getExtension("WEBGL_lose_context");
    window.__membraneTestContextLoss = extension;
    extension?.loseContext();
    return Boolean(extension);
  });
  assert.equal(canLoseContext, true, "WEBGL_lose_context is unavailable");
  await page.waitForFunction(() =>
    document.querySelector("#plate-stage")?.getAttribute("data-membrane-status") === "context-lost"
  );
  assert.equal(await page.locator("#plate-fallback").isVisible(), true);
  assert.match(await page.locator("#plate-fallback-message").textContent(), /context was lost/);

  await page.evaluate(() => {
    window.__membraneTestContextLoss?.restoreContext();
  });
  await waitForMembrane(page, 2, 3);
  assert.equal(await page.locator("#plate-fallback").isHidden(), true);

  await canvas.evaluate((element) => {
    const context = element.getContext("webgl2") ?? element.getContext("webgl");
    const extension = context?.getExtension("WEBGL_lose_context");
    window.__membraneTestContextLoss = extension;
    extension?.loseContext();
  });
  await page.waitForFunction(() =>
    document.querySelector("#plate-stage")?.getAttribute("data-membrane-status") === "context-lost"
  );
  await page.locator("#retry-renderer").click();
  await waitForMembrane(page, 2, 3);
  await page.evaluate(() => delete window.__membraneTestContextLoss);
  assert.equal(await page.locator('[data-membrane-canvas="true"]').count(), 1);
  assert.equal(await page.locator("#plate-fallback").isHidden(), true);
  assert.equal(await stage.getAttribute("data-mode"), "2,3");
  assert.equal(await stage.getAttribute("data-animation-timing"), "modal");
  assert.ok(
    Math.abs(Number(await stage.getAttribute("data-cycle-seconds")) - 10 / Math.sqrt(13 / 2)) < 1e-12
  );
}

async function assertReducedMotion(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    reducedMotion: "reduce"
  });
  try {
    const page = await context.newPage();
    const errors = collectBrowserErrors(page);
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await waitForMembrane(page, 2, 3);
    assert.equal(await page.locator("#plate-stage").getAttribute("data-playing"), "false");
    assert.equal(await page.locator("#plate-stage").getAttribute("data-animation-timing"), "modal");
    assert.ok(
      Math.abs(
        Number(await page.locator("#plate-stage").getAttribute("data-cycle-seconds")) -
          10 / Math.sqrt(13 / 2)
      ) < 1e-12
    );
    assert.equal(await page.locator("#animation-toggle").getAttribute("aria-pressed"), "false");
    assert.equal(await page.locator("#animation-toggle").getAttribute("aria-label"), "Play vibration");
    assert.equal(await page.locator("#frequency-scale-toggle").count(), 0);
    assert.deepEqual(errors, [], `Reduced-motion browser errors:\n${errors.join("\n")}`);
  } finally {
    await context.close();
  }
}

async function waitForMembrane(page, nx, ny) {
  await page.locator("#plate-stage").waitFor({ state: "visible" });
  await page.waitForFunction(
    ([x, y]) => {
      const stage = document.querySelector("#plate-stage");
      return stage?.getAttribute("data-membrane-status") === "ready" &&
        stage.getAttribute("data-mode") === `${x},${y}`;
    },
    [nx, ny]
  );
}

async function readLayout(page) {
  return page.evaluate(() => {
    const stage = document.querySelector("#plate-stage").getBoundingClientRect();
    const panel = document.querySelector(".plate-panel").getBoundingClientRect();
    const controls = document.querySelector(".mode-controls").getBoundingClientRect();
    const formula = document.querySelector(".formula-card").getBoundingClientRect();
    return {
      stageCenterX: stage.x + stage.width / 2,
      panelWidth: panel.width,
      panelHeight: panel.height,
      controlsWidth: controls.width,
      controlsY: controls.y,
      formulaLeft: formula.left,
      formulaRight: formula.right,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight
    };
  });
}

function collectBrowserErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function waitForServer(url, process) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (process.exitCode !== null) throw new Error(`Preview exited with code ${process.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForExit(process) {
  if (process.exitCode !== null) return;
  await new Promise((resolve) => {
    process.once("exit", resolve);
    setTimeout(resolve, 2_000);
  });
}
