import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { chromium } from "playwright";

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for Next.js to become ready");
}

async function findCachedChromium() {
  const cache = path.join(os.homedir(), ".cache", "ms-playwright");
  let revisions;
  try {
    revisions = (await readdir(cache)).filter((name) => name.startsWith("chromium-")).sort().reverse();
  } catch {
    return null;
  }
  for (const revision of revisions) {
    const revisionPath = path.join(cache, revision);
    let entries = [];
    try {
      entries = await readdir(revisionPath);
    } catch {}
    for (const entry of entries) {
      if (!entry.startsWith("chrome-linux")) continue;
      const executable = path.join(revisionPath, entry, "chrome");
      try {
        await readdir(path.dirname(executable));
        return executable;
      } catch {}
    }
  }
  return null;
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  } catch (error) {
    const executablePath = await findCachedChromium();
    if (!executablePath) throw error;
    return chromium.launch({ headless: true, executablePath, args: ["--no-sandbox"] });
  }
}

const port = await reservePort();
const baseUrl = `http://127.0.0.1:${port}`;
const output = [];
const child = spawn(
  process.execPath,
  [path.join("node_modules", "next", "dist", "bin", "next"), "dev", "-H", "127.0.0.1", "-p", String(port)],
  { cwd: process.cwd(), env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] }
);
child.stdout.on("data", (chunk) => output.push(chunk.toString()));
child.stderr.on("data", (chunk) => output.push(chunk.toString()));

let browser;
let exitCode = 2;
try {
  await waitForServer(baseUrl, child);
  browser = await launchBrowser();
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60000 });

  await page.locator("#set-state").click();
  await page.locator("#local-state").waitFor({ state: "visible" });
  const stateBeforeNavigation = await page.locator("#local-state").textContent();
  if (stateBeforeNavigation !== "preserved-marker") {
    throw new Error(`Could not establish local state before navigation: ${stateBeforeNavigation}`);
  }

  const loadingResult = page
    .locator("#loading")
    .waitFor({ state: "visible", timeout: 1200 })
    .then(() => true, () => false);
  await page.locator("#increment").click();
  const loadingObserved = await loadingResult;
  await page.waitForFunction(
    () => document.querySelector("#params")?.textContent?.includes('"1"'),
    null,
    { timeout: 15000 }
  );
  const stateAfterNavigation = await page.locator("#local-state").textContent();
  const stateReset = stateAfterNavigation === "initial";
  const symptomPresent = loadingObserved && stateReset;

  console.log(JSON.stringify({
    symptomPresent,
    loadingObserved,
    stateBeforeNavigation,
    stateAfterNavigation,
    finalUrl: page.url()
  }));
  exitCode = symptomPresent ? 0 : 1;
} catch (error) {
  console.error(`Verification failed: ${error.stack || error}`);
  console.error(output.join("").slice(-6000));
  exitCode = 2;
} finally {
  process.exitCode = exitCode;
  if (browser) await browser.close();
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }, 5000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
