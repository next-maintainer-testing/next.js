import { spawn } from "node:child_process";
import process from "node:process";
import { chromium } from "playwright";

const expectedTitle = "Stable Root Title";
const expectedThemeColor = "#123456";
const port = 32000 + (process.pid % 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
let server;
let browser;
let finalCode = 2;

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with ${code ?? signal}\n${stdout}\n${stderr}`));
    });
  });
}

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not become ready: ${lastError}`);
}

try {
  await run(process.execPath, ["node_modules/next/dist/bin/next", "build"], 180_000);

  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverError = "";
  server.stderr.on("data", (chunk) => { serverError += chunk; });
  server.once("error", (error) => { serverError += String(error); });
  await waitForServer(30_000);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  const initial = await page.evaluate(() => ({
    title: document.title,
    themeColors: [...document.querySelectorAll('meta[name="theme-color"]')].map((node) => node.content),
  }));
  if (initial.title !== expectedTitle || !initial.themeColors.includes(expectedThemeColor)) {
    throw new Error(`initial static metadata was not rendered: ${JSON.stringify(initial)}`);
  }

  await page.evaluate(() => {
    window.__metadataSamples = [];
    window.__headMutations = [];
    window.__keepSampling = true;
    const describeMetadata = (node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return [];
      const element = node;
      const matches = [];
      if (element.matches('title, meta[name="theme-color"]')) matches.push(element.outerHTML);
      for (const child of element.querySelectorAll('title, meta[name="theme-color"]')) matches.push(child.outerHTML);
      return matches;
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const removed = [...record.removedNodes].flatMap(describeMetadata);
        const added = [...record.addedNodes].flatMap(describeMetadata);
        if (removed.length || added.length) {
          window.__headMutations.push({
            at: performance.now(),
            removed,
            added,
            title: document.title,
            themeColors: [...document.querySelectorAll('meta[name="theme-color"]')].map((node) => node.content),
            loading: Boolean(document.querySelector("#dynamic-loading")),
            ready: Boolean(document.querySelector("#dynamic-ready")),
            pathname: location.pathname,
          });
        }
      }
    });
    observer.observe(document.head, { childList: true, subtree: true });
    window.__metadataObserver = observer;
    const sample = () => {
      window.__metadataSamples.push({
        at: performance.now(),
        title: document.title,
        themeColors: [...document.querySelectorAll('meta[name="theme-color"]')].map((node) => node.content),
        loading: Boolean(document.querySelector("#dynamic-loading")),
        ready: Boolean(document.querySelector("#dynamic-ready")),
        pathname: location.pathname,
      });
      if (window.__keepSampling) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  await page.click("#dynamic-link");
  await page.waitForSelector("#dynamic-loading", { timeout: 10_000 });
  await page.waitForSelector("#dynamic-ready", { timeout: 15_000 });
  await page.evaluate(() => {
    window.__keepSampling = false;
    window.__metadataObserver.disconnect();
  });

  const { samples, headMutations } = await page.evaluate(() => ({
    samples: window.__metadataSamples,
    headMutations: window.__headMutations,
  }));
  const transitionSamples = samples.filter((sample) => sample.pathname === "/dynamic" && !sample.ready);
  if (!transitionSamples.some((sample) => sample.loading)) {
    throw new Error("the dynamic route loading UI was not observed");
  }
  const flickerSamples = transitionSamples.filter(
    (sample) => sample.title !== "Stable Root Title" || !sample.themeColors.includes("#123456"),
  );
  const loadingRemovals = headMutations.filter(
    (mutation) => mutation.pathname === "/dynamic" && mutation.loading && !mutation.ready && mutation.removed.length > 0,
  );
  const final = samples.at(-1);
  const reproduced = flickerSamples.length > 0 || loadingRemovals.length > 0;
  console.log(JSON.stringify({
    reproduced,
    transitionSampleCount: transitionSamples.length,
    flickerSampleCount: flickerSamples.length,
    loadingMetadataRemovalCount: loadingRemovals.length,
    firstFlicker: flickerSamples[0] ?? null,
    firstLoadingRemoval: loadingRemovals[0] ?? null,
    final,
  }));
  finalCode = reproduced ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  if (server && server.exitCode !== null) console.error(`server exited early with ${server.exitCode}`);
  finalCode = 2;
} finally {
  process.exitCode = finalCode;
  if (browser) await browser.close().catch(() => {});
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (server.exitCode === null) server.kill("SIGKILL");
        resolve();
      }, 5_000);
      server.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
