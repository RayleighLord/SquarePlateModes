import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const host = "127.0.0.1";
const port = Number(process.env.BROWSER_BENCHMARK_PORT ?? 32_000 + (process.pid % 20_000));
const repositoryPath = "/SquarePlateModes/";
const baseUrl = `http://${host}:${port}${repositoryPath}`;
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const viteBin = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const requestedChromePath = process.env.CHROME_PATH;
const systemChromePath = "/usr/bin/google-chrome";
const executablePath = requestedChromePath ?? (existsSync(systemChromePath) ? systemChromePath : undefined);

const preview = spawn(
  process.execPath,
  [viteBin, "preview", "--base", repositoryPath, "--host", host, "--port", `${port}`, "--strictPort"],
  { cwd: projectRoot, stdio: ["ignore", "inherit", "inherit"] }
);

let browser;
try {
  await waitForServer(baseUrl, preview);
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const navigationStart = performance.now();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#plate-stage")?.getAttribute("data-membrane-status") === "ready");
  const firstReadyMs = performance.now() - navigationStart;

  await page.locator("#animation-toggle").click();
  const modeLatencies = [];
  for (let repeat = 0; repeat < 3; repeat += 1) {
    for (const [nx, ny] of [[1, 1], [8, 8], [2, 7], [7, 2], [4, 5], [2, 3]]) {
      const start = performance.now();
      await page.locator("#nx-slider").fill(`${nx}`);
      await page.locator("#ny-slider").fill(`${ny}`);
      await page.waitForFunction(
        ([x, y]) => document.querySelector("#plate-stage")?.getAttribute("data-mode") === `${x},${y}`,
        [nx, ny]
      );
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
      modeLatencies.push(performance.now() - start);
    }
  }

  await page.locator("#animation-toggle").click();
  const animation = await page.evaluate(async () => {
    const stage = document.querySelector("#plate-stage");
    const samples = [];
    let previousFrame = Number(stage?.getAttribute("data-frame") ?? 0);
    let previousTime = performance.now();
    const deadline = previousTime + 1_100;
    while (performance.now() < deadline) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const frame = Number(stage?.getAttribute("data-frame") ?? 0);
      if (frame !== previousFrame) {
        const now = performance.now();
        samples.push(now - previousTime);
        previousTime = now;
        previousFrame = frame;
      }
    }
    return {
      intervals: samples,
      geometries: Number(stage?.getAttribute("data-geometry-count")),
      textures: Number(stage?.getAttribute("data-texture-count")),
      programs: Number(stage?.getAttribute("data-program-count"))
    };
  });

  modeLatencies.sort((a, b) => a - b);
  const p95 = percentile(modeLatencies, 0.95);
  const meanFrameMs = animation.intervals.reduce((sum, value) => sum + value, 0) /
    Math.max(1, animation.intervals.length);

  assert.ok(modeLatencies.every(Number.isFinite));
  assert.ok(animation.intervals.length >= 20, "Animation produced too few measured frames");
  assert.equal(animation.geometries, 2, "Renderer should retain only the membrane and frame geometries");
  assert.ok(animation.textures >= 1 && animation.textures <= 4, "Texture count grew unexpectedly");

  console.log(`First ready: ${firstReadyMs.toFixed(1)} ms`);
  console.log(`Mode-to-frame p95: ${p95.toFixed(2)} ms (${modeLatencies.length} samples)`);
  console.log(`Animation mean frame interval: ${meanFrameMs.toFixed(2)} ms`);
  console.log(
    `Stable resources: ${animation.geometries} geometries, ${animation.textures} textures, ` +
    `${animation.programs} shader programs`
  );
} finally {
  await browser?.close();
  preview.kill("SIGTERM");
  await waitForExit(preview);
}

function percentile(values, quantile) {
  if (values.length === 0) return Number.NaN;
  return values[Math.min(values.length - 1, Math.floor(quantile * values.length))];
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
