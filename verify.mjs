import { spawn } from "node:child_process";
import { createServer } from "node:net";
import process from "node:process";
import puppeteer from "puppeteer";

const host = "127.0.0.1";

async function availablePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      server.close((error) =>
        error ? reject(error) : resolve(address.port),
      );
    });
  });
}

async function waitForServer(url, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before startup with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for Next.js to start");
}

function signalProcessTree(child, signal) {
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  signalProcessTree(child, "SIGTERM");
  if (await waitForExit(child, 5000)) return;
  signalProcessTree(child, "SIGKILL");
  await waitForExit(child, 5000);
}

const port = await availablePort();
const url = `http://${host}:${port}/`;
const next = spawn(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "dev", "--", "--hostname", host, "--port", String(port)],
  {
    cwd: process.cwd(),
    detached: process.platform !== "win32",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  },
);

let serverOutput = "";
for (const stream of [next.stdout, next.stderr]) {
  stream.on("data", (chunk) => {
    serverOutput += chunk.toString();
    if (serverOutput.length > 20000) serverOutput = serverOutput.slice(-20000);
  });
}

let browser;
let resultCode = 2;
try {
  await waitForServer(url, next, 120000);
  browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(
    () =>
      document.body.innerText.includes("First Async Component") &&
      document.body.innerText.includes("Second Async Component") &&
      document.querySelector("button")?.textContent === "Update Query Params",
    { timeout: 30000 },
  );

  const startingUrl = page.url();
  await page.click("button");

  let fallbackSeen = false;
  let navigationPendingObserved = false;
  const observationDeadline = Date.now() + 1800;
  while (Date.now() < observationDeadline) {
    const state = await page.evaluate(() => ({
      text: document.body.innerText,
      href: location.href,
    }));
    if (state.text.includes("Loading second component...")) fallbackSeen = true;
    if (state.href === startingUrl) navigationPendingObserved = true;
    if (state.href !== startingUrl) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  await page.waitForFunction(
    (oldUrl) =>
      location.href !== oldUrl &&
      document.body.innerText.includes("Second Async Component"),
    { timeout: 30000 },
    startingUrl,
  );

  if (!navigationPendingObserved) {
    throw new Error("The query-param navigation did not expose a pending interval");
  }

  const symptomPresent = !fallbackSeen;
  console.log(
    JSON.stringify({
      symptom: "keyed second Suspense fallback missing during query-param navigation",
      symptomPresent,
      fallbackSeen,
      navigationPendingObserved,
      startingUrl,
      finalUrl: page.url(),
    }),
  );
  resultCode = symptomPresent ? 0 : 1;
} catch (error) {
  console.error(error?.stack || error);
  console.error(serverOutput);
  resultCode = 2;
} finally {
  process.exitCode = resultCode;
  if (browser) await browser.close();
  await stop(next);
}
