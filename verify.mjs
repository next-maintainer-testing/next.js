import { spawn } from "node:child_process";
import path from "node:path";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const targetPath = "/blog/singleton";
let browser;
let server;
let serverLog = "";
let result = 2;

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {}
  await Promise.race([
    new Promise((resolve) => server.once("close", resolve)),
    sleep(5000),
  ]);
  if (server.exitCode === null) {
    try {
      process.kill(-server.pid, "SIGKILL");
    } catch {}
    await Promise.race([
      new Promise((resolve) => server.once("close", resolve)),
      sleep(2000),
    ]);
  }
}

async function waitForServer(url) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${server.exitCode})`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error("Timed out waiting for Next.js");
}

try {
  const port = 32_000 + (process.pid % 20_000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const nextBin = path.join(process.cwd(), "node_modules", ".bin", "next");
  server = spawn(nextBin, ["dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const appendLog = (chunk) => {
    serverLog = (serverLog + chunk.toString()).slice(-12_000);
  };
  server.stdout.on("data", appendLog);
  server.stderr.on("data", appendLog);
  await waitForServer(baseUrl);

  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  let sawRscRequest = false;
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (request.url().includes("_rsc=")) {
      sawRscRequest = true;
      setTimeout(() => request.continue().catch(() => {}), 1500);
    } else {
      request.continue().catch(() => {});
    }
  });

  const observations = [];
  await page.exposeFunction("recordIssue56344", (observation) => {
    observations.push(observation);
  });
  await page.goto(baseUrl, { waitUntil: "load", timeout: 120_000 });
  await page.waitForSelector(`a[href="${targetPath}"]`, { timeout: 30_000 });
  await page.evaluate(() => {
    const record = () =>
      window.recordIssue56344({
        path: location.pathname,
        parentLoadingVisible: Boolean(document.querySelector("#parent-loading")),
        childLoadingVisible: Boolean(document.querySelector("#child-loading")),
        postVisible: Boolean(document.querySelector("#post")),
      });
    window.__issue56344Observer = new MutationObserver(record);
    window.__issue56344Observer.observe(document.body, { childList: true, subtree: true });
    window.__issue56344Interval = setInterval(record, 25);
    record();
  });

  await page.click(`a[href="${targetPath}"]`);
  await page.waitForSelector("#post", { timeout: 90_000 });
  await sleep(300);
  await page.evaluate(() => {
    clearInterval(window.__issue56344Interval);
    window.__issue56344Observer.disconnect();
  });

  const parentLoadingObserved = observations.some(({ parentLoadingVisible }) => parentLoadingVisible);
  const childLoadingObserved = observations.some(({ childLoadingVisible }) => childLoadingVisible);
  const postObserved = observations.some(({ postVisible }) => postVisible);
  const reachedTarget = new URL(page.url()).pathname === targetPath;
  const states = [];
  for (const observation of observations) {
    const state = observation.parentLoadingVisible
      ? "parent-loading"
      : observation.childLoadingVisible
        ? "child-loading"
        : observation.postVisible
          ? "post"
          : observation.path;
    if (states.at(-1) !== state) states.push(state);
  }

  console.log(`Visible navigation states: ${states.join(" -> ")}`);
  console.log(`RSC request observed: ${sawRscRequest}; final URL: ${page.url()}`);

  if (!sawRscRequest || !reachedTarget || !postObserved || (!parentLoadingObserved && !childLoadingObserved)) {
    throw new Error("Navigation completed without an auditable loading-state observation");
  }
  if (parentLoadingObserved) {
    console.log("Symptom present: /blog/loading.js was visibly rendered before the nested dynamic route loading UI.");
    result = 0;
  } else {
    console.log("Symptom absent: only /blog/[slug]/loading.js was visibly rendered while the nested route loaded.");
    result = 1;
  }
} catch (error) {
  console.error(`Verification failed: ${error?.stack || error}`);
  if (serverLog) console.error(`Next.js log tail:\n${serverLog}`);
  result = 2;
}

process.exitCode = result;
if (browser) {
  try {
    await browser.close();
  } catch {}
}
await stopServer();
