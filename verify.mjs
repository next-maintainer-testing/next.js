import { spawn } from "node:child_process";
import net from "node:net";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js server exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error("Timed out waiting for the Next.js server");
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  const signalTree = (signal) => {
    try {
      if (process.platform === "win32") child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  };
  signalTree("SIGTERM");
  const exited = await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    delay(10_000).then(() => false),
  ]);
  if (!exited && child.exitCode === null) {
    signalTree("SIGKILL");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

let browser;
let server;
let resultCode = 2;

try {
  const port = await reservePort();
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: process.cwd(),
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", () => {});
  server.stderr.on("data", () => {});

  await waitForServer(origin, server);

  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    args: [...chromium.args, "--no-sandbox"],
  });
  const page = await browser.newPage();
  await page.goto(origin, { waitUntil: "networkidle0", timeout: 60_000 });
  await page.waitForSelector("#slow-link");

  await page.evaluate(() => {
    window.__loadingFirstSeenAt = null;
    window.__clickStartedAt = null;
    const recordLoading = () => {
      if (document.querySelector("#route-loading") && window.__loadingFirstSeenAt === null) {
        window.__loadingFirstSeenAt = performance.now();
      }
    };
    new MutationObserver(recordLoading).observe(document.body, {
      childList: true,
      subtree: true,
    });
  });

  await page.evaluate(() => {
    window.__clickStartedAt = performance.now();
    document.querySelector("#slow-link").click();
  });

  await delay(600);
  const promptState = await page.evaluate(() => ({
    homeVisible: Boolean(document.querySelector("#home-page")),
    loadingVisible: Boolean(document.querySelector("#route-loading")),
    slowVisible: Boolean(document.querySelector("#slow-page")),
    loadingDelay: window.__loadingFirstSeenAt === null
      ? null
      : window.__loadingFirstSeenAt - window.__clickStartedAt,
  }));

  await page.waitForSelector("#slow-page", { timeout: 15_000 });
  const finalState = await page.evaluate(() => ({
    loadingDelay: window.__loadingFirstSeenAt === null
      ? null
      : window.__loadingFirstSeenAt - window.__clickStartedAt,
    path: location.pathname,
  }));

  if (promptState.slowVisible || !promptState.homeVisible || finalState.path !== "/slow") {
    throw new Error(`Delay fixture did not remain active: ${JSON.stringify({ promptState, finalState })}`);
  }

  const symptomPresent = !promptState.loadingVisible;
  console.log(JSON.stringify({
    symptom: symptomPresent
      ? "No loading UI was visible 600ms after clicking the non-prefetched link"
      : "Route loading UI appeared promptly after clicking the non-prefetched link",
    promptState,
    finalState,
  }));
  resultCode = symptomPresent ? 0 : 1;
} catch (error) {
  console.error(error?.stack || error);
  resultCode = 2;
} finally {
  process.exitCode = resultCode;
  if (browser) await browser.close();
  if (server) await stopServer(server);
}
