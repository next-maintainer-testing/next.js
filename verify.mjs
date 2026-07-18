import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const host = "127.0.0.1";
const appPort = 32143;
const debugPort = 32144;
const appUrl = `http://${host}:${appPort}/`;
const output = [];
let server;
let browser;
let cdp;

function record(chunk) {
  const text = String(chunk);
  output.push(text);
  if (output.join("").length > 30000) output.shift();
}

function chromeExecutable() {
  const explicit = process.env.CHROME_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  for (const direct of [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/opt/google/chrome/chrome",
  ]) {
    if (existsSync(direct)) return direct;
  }
  const cache = "/root/.cache/ms-playwright";
  if (existsSync(cache)) {
    for (const release of readdirSync(cache).sort().reverse()) {
      for (const relative of ["chrome-linux64/chrome", "chrome-linux/chrome", "chrome-headless-shell-linux64/chrome-headless-shell"]) {
        const candidate = join(cache, release, relative);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  throw new Error("No Chromium executable is available for the browser-runtime check");
}

async function waitFor(url, timeoutMs, predicate = (response) => response.ok) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (predicate(response)) return response;
      lastError = new Error(`${url} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || "unknown error"}`);
}

class CDP {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.waiters = [];
    this.socket = new WebSocket(url);
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", () => reject(new Error("CDP WebSocket connection failed")), { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      this.events.push(message);
      for (const waiter of this.waiters.splice(0)) waiter();
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async waitForEvent(method, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const index = this.events.findIndex((event) => event.method === method);
      if (index !== -1) return this.events.splice(index, 1)[0].params;
      await Promise.race([
        new Promise((resolve) => this.waiters.push(resolve)),
        new Promise((resolve) => setTimeout(resolve, Math.min(250, deadline - Date.now()))),
      ]);
    }
    throw new Error(`Timed out waiting for CDP event ${method}`);
  }

  close() {
    this.socket.close();
  }
}

function terminate(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    child.kill("SIGTERM");
  } catch {}
}

async function main() {
  const nextBin = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(nextBin)) throw new Error(`Next.js executable not found at ${nextBin}`);

  server = spawn(process.execPath, [nextBin, "dev", "-H", host, "-p", String(appPort)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", record);
  server.stderr.on("data", record);

  await waitFor(appUrl, 120000, (response) => response.status < 500);

  const executable = chromeExecutable();
  browser = spawn(executable, [
    "--headless",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    `--remote-debugging-port=${debugPort}`,
    "--remote-debugging-address=127.0.0.1",
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  browser.stdout.on("data", record);
  browser.stderr.on("data", record);

  await waitFor(`http://${host}:${debugPort}/json/version`, 30000);
  const created = await (await fetch(`http://${host}:${debugPort}/json/new?about:blank`, { method: "PUT" })).json();
  if (!created.webSocketDebuggerUrl) throw new Error("Chromium did not provide a page debugging target");

  cdp = new CDP(created.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Page.enable");
  await cdp.send("Page.navigate", { url: appUrl });
  await cdp.waitForEvent("Page.loadEventFired", 90000);
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const exceptionTexts = cdp.events
    .filter((event) => event.method === "Runtime.exceptionThrown")
    .map((event) => event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text || "");
  const logTexts = cdp.events
    .filter((event) => event.method === "Log.entryAdded")
    .map((event) => event.params.entry?.text || "");
  const observedErrors = [...exceptionTexts, ...logTexts];
  const symptom = observedErrors.some((text) => /TypeError:\s*\$ is not a function/.test(text));

  const evaluation = await cdp.send("Runtime.evaluate", {
    expression: "({ text: document.body?.innerText || '', title: document.title, ready: document.readyState })",
    returnByValue: true,
  });
  const page = evaluation.result?.value;
  if (symptom) {
    console.log(`REPRODUCED: browser raised ${observedErrors.find((text) => /TypeError:\s*\$ is not a function/.test(text)).split("\n")[0]}`);
    return 0;
  }
  if (!page || !page.text.includes("see console report error") || page.ready !== "complete") {
    throw new Error(`App did not load to its expected state: ${JSON.stringify(page)}; browser errors: ${JSON.stringify(observedErrors)}`);
  }
  console.log(`NOT REPRODUCED: app loaded successfully without the reported browser TypeError; state=${JSON.stringify(page)}`);
  return 1;
}

let result = 2;
try {
  result = await main();
} catch (error) {
  console.error(`CHECK FAILED: ${error.stack || error}`);
  const logs = output.join("");
  if (logs) console.error(`PROCESS OUTPUT:\n${logs.slice(-12000)}`);
  result = 2;
} finally {
  process.exitCode = result;
  if (cdp) cdp.close();
  terminate(browser);
  terminate(server);
  await new Promise((resolve) => setTimeout(resolve, 750));
  if (browser?.exitCode === null && browser?.signalCode === null) browser.kill("SIGKILL");
  if (server?.exitCode === null && server?.signalCode === null) server.kill("SIGKILL");
}
